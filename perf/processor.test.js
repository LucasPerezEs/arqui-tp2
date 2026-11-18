"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareExchange, trackRoot, trackRates, trackExchange } = require("./processor.js");

function inspect(hook, statusCode, body) {
  const metrics = {};
  let error;
  let callbacks = 0;
  hook({}, { statusCode, body }, {}, {
    emit(kind, name, value) {
      assert.equal(kind, "counter");
      metrics[name] = (metrics[name] || 0) + value;
    },
  }, err => { error = err; callbacks++; });
  assert.equal(callbacks, 1);
  return { metrics, error };
}

test("envía el DNI como texto y el importe como número", () => {
  const previous = process.env.TP2_DNI;
  try {
    process.env.TP2_DNI = "40101235";
    const request = {};
    prepareExchange(request, {}, {}, err => assert.ifError(err));
    assert.equal(request.json.dni, "40101235");
    assert.equal(request.json.baseAmount, 1000);
    assert.equal(typeof request.json.baseAmount, "number");
    for (const dni of ["999999", "100000000", "0000001", "texto", ""]) {
      process.env.TP2_DNI = dni;
      prepareExchange({}, {}, {}, err => assert.ok(err));
    }
  } finally {
    if (previous === undefined) delete process.env.TP2_DNI;
    else process.env.TP2_DNI = previous;
  }
});

test("GET / valida el contenido, no solamente HTTP 200", () => {
  assert.ifError(inspect(trackRoot, 200, "Server is up.").error);
  assert.ok(inspect(trackRoot, 200, "<html>Error</html>").error);
});

test("cotizaciones exige una tasa ARS/USD positiva y numérica", () => {
  assert.ifError(inspect(trackRates, 200, '{"ARS":{"USD":0.00066}}').error);
  assert.ifError(inspect(trackRates, 200, { ARS: { USD: 0.00066 } }).error);
  for (const body of ["no es JSON", "null", '{"ARS":{"USD":0}}', '{"ARS":{"USD":"0.1"}}']) {
    const result = inspect(trackRates, 200, body);
    assert.ok(result.error);
    assert.equal(result.metrics.tp2_invalid_response, 1);
  }
});

test("solo cuenta como exitoso un cambio HTTP 200 con ok:true e importe positivo", () => {
  const result = inspect(trackExchange, 200, '{"ok":true,"counterAmount":0.66}');
  assert.ifError(result.error);
  assert.equal(result.metrics.tp2_exchange_ok, 1);
  assert.equal(result.metrics.tp2_exchange_not_ok, 0);
  assert.equal(result.metrics.tp2_http_5xx, 0);
  assert.equal(result.metrics.tp2_invalid_response, 0);
  for (const response of [{}, { ok: true, counterAmount: 0 }, { ok: false }]) {
    assert.ok(inspect(trackExchange, 200, response).error);
  }
});

test("un resultado negativo no se cuenta como éxito aunque el VU termine", () => {
  for (const status of [403, 500]) {
    const result = inspect(trackExchange, status, { ok: false, obs: "rechazado" });
    assert.ifError(result.error);
    assert.equal(result.metrics.tp2_exchange_ok, 0);
    assert.equal(result.metrics.tp2_exchange_not_ok, 1);
    assert.equal(result.metrics.tp2_http_4xx, Number(status === 403));
    assert.equal(result.metrics.tp2_http_5xx, Number(status === 500));
  }
});

test("un error técnico o una respuesta contradictoria no se atribuyen a ARCA", () => {
  for (const body of ["<html>Error</html>", { error: "Redis no disponible" },
    { ok: true, counterAmount: 1 }]) {
    const result = inspect(trackExchange, 503, body);
    assert.ok(result.error);
    assert.equal(result.metrics.tp2_http_5xx, 1);
    assert.equal(result.metrics.tp2_exchange_ok, 0);
    assert.equal(result.metrics.tp2_exchange_not_ok, 0);
    assert.equal(result.metrics.tp2_invalid_response, 1);
  }
});
