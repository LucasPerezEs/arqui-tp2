import { nanoid } from "nanoid";

import { init as stateInit, getAccounts as stateAccounts, getRates as stateRates, getLog as stateLog } from "./state.js";

// Import para StatsD para metricas
import StatsD from "hot-shots";

// Configuracion de StatsD para enviar metricas a Graphite
const statsd = new StatsD({
  host: "graphite",
  port: 8125,
  prefix: "arvault.business.",
});

let accounts;
let rates;
let log;

// Llamada para inicializar el servicio de intercambio
export async function init() {
  await stateInit();

  accounts = stateAccounts();
  rates = stateRates();
  log = stateLog();
}

// Devuelve todas las cuentas internas
export function getAccounts() {
  return accounts;
}

// Establece el saldo de una cuenta
export function setAccountBalance(accountId, balance) {
  const account = findAccountById(accountId);

  if (account != null) {
    account.balance = balance;
  }
}

// Devuelve todas las tasas de cambio actuales
export function getRates() {
  return rates;
}

// Devuelve el registro completo de transacciones
export function getLog() {
  return log;
}

// Establece la tasa de cambio para un par de monedas dado, y la tasa recíproca también
export function setRate(rateRequest) {
  const { baseCurrency, counterCurrency, rate } = rateRequest;

  rates[baseCurrency][counterCurrency] = rate;
  rates[counterCurrency][baseCurrency] = Number((1 / rate).toFixed(5));
}

// Ejecuta una operación de intercambio
export async function exchange(exchangeRequest) {
  const {
    baseCurrency,
    counterCurrency,
    baseAccountId: clientBaseAccountId,
    counterAccountId: clientCounterAccountId,
    baseAmount,
  } = exchangeRequest;

  // Obtener el tipo de cambio
  const exchangeRate = rates[baseCurrency][counterCurrency];
  // Calcular el importe solicitado (en la divisa de contrapartida)
  const counterAmount = baseAmount * exchangeRate;
  // Localiza nuestra cuenta en la moneda (base) indicada
  const baseAccount = findAccountByCurrency(baseCurrency);
  // Busca nuestra cuenta en la divisa cotizada
  const counterAccount = findAccountByCurrency(counterCurrency);

  // Construir el objeto de resultado con valores predeterminados
  const exchangeResult = {
    id: nanoid(),
    ts: new Date(),
    ok: false,
    request: exchangeRequest,
    exchangeRate: exchangeRate,
    counterAmount: 0.0,
    obs: null,
  };

  // Comprobar si disponemos de fondos en la cuenta de la divisa contraparte
  if (counterAccount.balance >= counterAmount) {
    counterAccount.balance -= counterAmount;

    // Intentar realizar una transferencia desde la cuenta base de los clientes
    if (await transfer(clientBaseAccountId, baseAccount.id, baseAmount)) {
      // Intentar realizar una transferencia a la cuenta de contrapartida del cliente
      if (
        await transfer(counterAccount.id, clientCounterAccountId, counterAmount)
      ) {
        // Todo bien, actualiza los saldos
        baseAccount.balance += baseAmount;
        exchangeResult.ok = true;
        exchangeResult.counterAmount = counterAmount;

        // Metricas de negocio para StatsD
        
        // Volumen: Acumula el total comerciado por cada moneda
        statsd.increment(`volume.${baseCurrency}`, baseAmount);
        statsd.increment(`volume.${counterCurrency}`, counterAmount);

        // Neto: Compras ingresan dinero al sistema (+), Ventas retiran dinero (-)
        statsd.increment(`net.${baseCurrency}`, baseAmount);
        statsd.decrement(`net.${counterCurrency}`, counterAmount);

      } else {
        // No fue posible realizar la transferencia a la cuenta de contrapartida del 
        // cliente; se devuelve el importe base al cliente
        await transfer(baseAccount.id, clientBaseAccountId, baseAmount);
        counterAccount.balance += counterAmount;
        exchangeResult.obs = "Could not transfer to clients' account";
      }
    } else {
      // No fue posible realizar retiros de la cuenta de los clientes
      counterAccount.balance += counterAmount;
      exchangeResult.obs = "Could not withdraw from clients' account";
    }
  } else {
    // No hay suficientes fondos en la cuenta de contrapartida interna
    exchangeResult.obs = "Not enough funds on counter currency account";
  }

  // Registra la transacción y return
  log.push(exchangeResult);

  return exchangeResult;
}

// interno: servicio de transferencia entre cuentas para realizar traspasos
async function transfer(fromAccountId, toAccountId, amount) {
  const min = 200;
  const max = 400;
  return new Promise((resolve) =>
    setTimeout(() => resolve(true), Math.random() * (max - min + 1) + min)
  );
}

function findAccountByCurrency(currency) {
  for (let account of accounts) {
    if (account.currency == currency) {
      return account;
    }
  }

  return null;
}

function findAccountById(id) {
  for (let account of accounts) {
    if (account.id == id) {
      return account;
    }
  }

  return null;
}
