"use strict";

// Estas métricas se miden desde el generador y reciben el prefijo "artillery.".
function recordHttp(response, events) {
  const status = response.statusCode;
  events.emit("counter", "tp2_http_4xx", Number(status >= 400 && status < 500));
  events.emit("counter", "tp2_http_5xx", Number(status >= 500 && status < 600));
}

function parseBody(response) {
  if (response.body !== null && typeof response.body === "object"
      && !Buffer.isBuffer(response.body)) {
    return response.body;
  }
  try {
    return JSON.parse(String(response.body));
  } catch {
    return null;
  }
}

function finishCheck(valid, events, done) {
  events.emit("counter", "tp2_invalid_response", Number(!valid));
  return done(valid ? undefined : new Error("TP2_INVALID_RESPONSE"));
}

function trackRoot(_request, response, _context, events, done) {
  recordHttp(response, events);
  const valid = response.statusCode === 200
    && String(response.body).trim() === "Server is up.";
  return finishCheck(valid, events, done);
}

function trackRates(_request, response, _context, events, done) {
  recordHttp(response, events);
  const body = parseBody(response);
  const valid = response.statusCode === 200
    && Number.isFinite(body?.ARS?.USD) && body.ARS.USD > 0;
  return finishCheck(valid, events, done);
}

function prepareExchange(request, _context, _events, done) {
  const dni = process.env.TP2_DNI;
  if (!/^[1-9][0-9]{6,7}$/.test(dni || "")) {
    return done(new Error("TP2_INVALID_DNI"));
  }

  request.json = {
    baseCurrency: "ARS",
    counterCurrency: "USD",
    baseAmount: 1000,
    baseAccountId: 10,
    counterAccountId: 11,
    dni,
  };
  return done();
}

function trackExchange(_request, response, _context, events, done) {
  recordHttp(response, events);
  const body = parseBody(response);
  const approved = response.statusCode === 200 && body?.ok === true
    && Number.isFinite(body.counterAmount) && body.counterAmount > 0;
  const notApproved = response.statusCode >= 400 && response.statusCode < 600
    && body?.ok === false;

  const pending = response.statusCode === 503 && body?.ok === null
    && body.pending === true && body.error === "EXCHANGE_PENDING"
    && typeof body.id === "string" && body.id.length > 0;

  events.emit("counter", "tp2_exchange_ok", Number(approved));
  events.emit("counter", "tp2_exchange_not_ok", Number(notApproved));
  events.emit("counter", "tp2_exchange_pending", Number(pending));

  // ok:false no identifica por sí solo un rechazo de ARCA: también puede ser
  // falta de saldo. Los códigos HTTP se contabilizan por separado, incluso si
  // la aplicación usa HTTP 500 para un resultado de negocio negativo.
  return finishCheck(approved || notApproved || pending, events, done);
}

module.exports = { prepareExchange, trackRoot, trackRates, trackExchange };
