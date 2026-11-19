import { nanoid } from "nanoid";
import { WatchError } from "redis";
import { getRedisClient } from "./redisClient.js";
import { LOG_ENTRIES_KEY, RESULT_PREFIX, assertRedisLogType } from "./redisLog.js";

const ACCOUNTS_KEY = "arvault:accounts";
const RATES_KEY = "arvault:rates";

// Los reintentos contienen solamente operaciones de Redis.
async function commitUpdate(client, keys, prepare) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await client.watch(keys);
    const values = await client.mGet(keys);
    const update = prepare(Object.fromEntries(keys.map((key, i) => [key, values[i]])));
    if (!update.writes.length && !update.logEntry) {
      await client.unwatch();
      return update.result;
    }
    const transaction = client.multi();
    if (update.writes.length) transaction.mSet(Object.fromEntries(update.writes));
    if (update.logEntry) transaction.rPush(LOG_ENTRIES_KEY, JSON.stringify(update.logEntry));
    try {
      await transaction.exec();
    } catch (error) {
      if (error instanceof WatchError) continue;
      // EXEC puede haber aplicado parte de los comandos. Conservar la reserva.
      error.redisCommitUnknown = true;
      throw error;
    }
    // Borrar la reserva solo despues de comprobar que EXEC termino sin errores.
    try {
      if (update.deletes?.length) await client.del(update.deletes);
    } catch (error) {
      error.redisCommitUnknown = true;
      throw error;
    }
    return update.result;
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
  await assertRedisLogType(client);
  return commitUpdate(client, [ACCOUNTS_KEY, RATES_KEY, operationKey], raw => {
    const accounts = readState(raw[ACCOUNTS_KEY], ACCOUNTS_KEY);
    const rates = readState(raw[RATES_KEY], RATES_KEY);
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
      return {
        writes: [[RESULT_PREFIX + result.id, JSON.stringify(result)]],
        logEntry: result,
        result: { reservation: null, result },
      };
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
  await assertRedisLogType(client);
  await saveReservation(client, operationKey, reservation);
  const resultKey = RESULT_PREFIX + reservation.result.id;
  return commitUpdate(client, [ACCOUNTS_KEY, operationKey, resultKey], raw => {
    const accounts = readState(raw[ACCOUNTS_KEY], ACCOUNTS_KEY);
    if (raw[resultKey] !== null) {
      if (raw[operationKey] !== null) {
        throw new Error("La operacion tiene un resultado y una reserva; requiere reconciliacion");
      }
      return { writes: [], result: JSON.parse(raw[resultKey]) };
    }
    const pending = readState(raw[operationKey], operationKey);
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
    return {
      writes: [[ACCOUNTS_KEY, JSON.stringify(accounts)], [resultKey, JSON.stringify(result)]],
      logEntry: result,
      deletes: [operationKey],
      result,
    };
  });
}

async function saveReservation(client, operationKey, reservation) {
  const saved = await client.set(operationKey, JSON.stringify(reservation), { XX: true });
  if (saved === null) throw new Error("No se encontro la reserva de la operacion");
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
    await saveReservation(client, operationKey, reservation);
    const deposited = await transfer(
      reservation.counterAccountId, exchangeRequest.counterAccountId, reservation.counterAmount
    );
    if (deposited) return await finish(client, operationKey, reservation, "approved");

    reservation.stage = "refunding";
    await saveReservation(client, operationKey, reservation);
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
