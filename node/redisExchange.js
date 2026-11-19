import { nanoid } from "nanoid";
import { WatchError } from "redis";
import { getRedisClient } from "./redisClient.js";

const ACCOUNTS_KEY = "arvault:accounts";
const RATES_KEY = "arvault:rates";
const LOG_KEY = "arvault:log";

// Los reintentos contienen solamente operaciones de Redis.
async function commitUpdate(client, keys, prepare) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await client.watch(keys);
    const values = await client.mGet(keys);
    const update = prepare(Object.fromEntries(keys.map((key, i) => [key, values[i]])));
    if (!update.writes.length && !update.deletes?.length) {
      await client.unwatch();
      return update.result;
    }
    const transaction = client.multi();
    if (update.writes.length) transaction.mSet(Object.fromEntries(update.writes));
    for (const key of update.deletes || []) transaction.del(key);
    try {
      await transaction.exec();
      return update.result;
    } catch (error) {
      if (error instanceof WatchError) continue;
      // Sin respuesta de EXEC, la escritura podria haberse aplicado.
      error.redisCommitUnknown = true;
      throw error;
    }
  }
  throw new Error("No se pudo completar la operacion por concurrencia");
}

function readState(raw, key) {
  if (raw === null) throw new Error("Faltan datos de arVault en Redis: " + key);
  return JSON.parse(raw);
}

export class RedisExchangePendingError extends Error {
  constructor(operation, cause) {
    super("Exchange requires reconciliation", { cause });
    this.name = "RedisExchangePendingError";
    this.operation = operation;
  }
}

async function reserve(client, operationKey, operation) {
  return commitUpdate(client, [ACCOUNTS_KEY, RATES_KEY, LOG_KEY, operationKey], raw => {
    const accounts = readState(raw[ACCOUNTS_KEY], ACCOUNTS_KEY);
    const rates = readState(raw[RATES_KEY], RATES_KEY);
    const log = readState(raw[LOG_KEY], LOG_KEY);
    const { baseCurrency, counterCurrency, baseAmount } = operation.request;
    const amount = Number(baseAmount);
    const exchangeRate = rates[baseCurrency]?.[counterCurrency];
    const baseAccount = accounts.find(account => account.currency === baseCurrency);
    const counterAccount = accounts.find(account => account.currency === counterCurrency);
    if (
      !baseAccount || !counterAccount || baseAccount.id === counterAccount.id ||
      !Number.isFinite(amount) || amount <= 0 ||
      !Number.isFinite(exchangeRate) || exchangeRate <= 0 ||
      !Number.isFinite(baseAccount.balance) || !Number.isFinite(counterAccount.balance) ||
      !Number.isFinite(baseAccount.balance + amount)
    ) throw new Error("Datos de intercambio invalidos");

    const counterAmount = amount * exchangeRate;
    if (!Number.isFinite(counterAmount) || counterAmount <= 0) {
      throw new Error("Importe de intercambio invalido");
    }
    const result = { ...operation, exchangeRate, counterAmount: 0, ok: false, obs: null };
    if (counterAccount.balance < counterAmount) {
      result.obs = "Not enough funds on counter currency account";
      log.push(result);
      return { writes: [[LOG_KEY, JSON.stringify(log)]], result: { reservation: null, result } };
    }

    counterAccount.balance -= counterAmount;
    const reservation = {
      stage: "withdrawing",
      baseAccountId: baseAccount.id,
      counterAccountId: counterAccount.id,
      amount,
      counterAmount,
      result,
    };
    return {
      writes: [
        [ACCOUNTS_KEY, JSON.stringify(accounts)],
        [operationKey, JSON.stringify(reservation)],
      ],
      result: { reservation, result },
    };
  });
}

async function finish(client, operationKey, reservation, outcome) {
  reservation.stage = "finalizing";
  reservation.outcome = outcome;
  await client.set(operationKey, JSON.stringify(reservation));
  return commitUpdate(client, [ACCOUNTS_KEY, LOG_KEY, operationKey], raw => {
    const accounts = readState(raw[ACCOUNTS_KEY], ACCOUNTS_KEY);
    const log = readState(raw[LOG_KEY], LOG_KEY);
    if (raw[operationKey] === null) {
      const recorded = log.find(entry => entry.id === reservation.result.id);
      if (!recorded) throw new Error("No se encontro la reserva ni su resultado");
      return { writes: [], result: recorded };
    }
    const pending = JSON.parse(raw[operationKey]);
    const baseAccount = accounts.find(account => account.id === pending.baseAccountId);
    const counterAccount = accounts.find(account => account.id === pending.counterAccountId);
    if (!baseAccount || !counterAccount) throw new Error("Cuenta reservada inexistente");
    const approved = pending.outcome === "approved";
    if (approved) baseAccount.balance += pending.amount;
    else counterAccount.balance += pending.counterAmount;
    if (!Number.isFinite(baseAccount.balance) || !Number.isFinite(counterAccount.balance)) {
      throw new Error("Saldo invalido al confirmar el intercambio");
    }
    const result = {
      ...pending.result,
      ok: approved,
      counterAmount: approved ? pending.counterAmount : 0,
      obs: approved ? null : pending.outcome === "deposit_failed"
        ? "Could not transfer to clients' account"
        : "Could not withdraw from clients' account",
    };
    log.push(result);
    return {
      writes: [[ACCOUNTS_KEY, JSON.stringify(accounts)], [LOG_KEY, JSON.stringify(log)]],
      deletes: [operationKey],
      result,
    };
  });
}

export async function exchangeRedis(exchangeRequest, transfer) {
  const client = getRedisClient().duplicate();
  client.on("error", error => console.error("Error de Redis:", error.message));
  const operation = {
    id: nanoid(), ts: new Date(), request: exchangeRequest,
    dni: exchangeRequest.dni, arca: exchangeRequest.arca,
  };
  const operationKey = "arvault:exchange:" + operation.id;
  let reservation;
  try {
    await client.connect();
    const prepared = await reserve(client, operationKey, operation);
    if (!prepared.reservation) return prepared.result;
    reservation = prepared.reservation;

    const withdrawn = await transfer(
      exchangeRequest.baseAccountId, reservation.baseAccountId, reservation.amount
    );
    if (!withdrawn) return await finish(client, operationKey, reservation, "withdraw_failed");

    reservation.stage = "depositing";
    await client.set(operationKey, JSON.stringify(reservation));
    const deposited = await transfer(
      reservation.counterAccountId, exchangeRequest.counterAccountId, reservation.counterAmount
    );
    if (deposited) return await finish(client, operationKey, reservation, "approved");

    reservation.stage = "refunding";
    await client.set(operationKey, JSON.stringify(reservation));
    const refunded = await transfer(
      reservation.baseAccountId, exchangeRequest.baseAccountId, reservation.amount
    );
    if (!refunded) throw new Error("Could not refund clients' account");
    return await finish(client, operationKey, reservation, "deposit_failed");
  } catch (error) {
    if (reservation || error.redisCommitUnknown) {
      // No vencer reservas cuyo movimiento de fondos pueda estar pendiente.
      throw new RedisExchangePendingError(reservation?.result || operation, error);
    }
    throw error;
  } finally {
    if (client.isOpen) client.destroy();
  }
}
