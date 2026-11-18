
import { nanoid } from "nanoid";
import { WatchError } from "redis";
import { getRedisClient } from "./redisClient.js";

const ACCOUNTS_KEY = "arvault:accounts";
const RATES_KEY = "arvault:rates";
const LOG_KEY = "arvault:log";

// Redis - realizo el intercambio sin pisar operaciones de otros nodos
export async function exchangeRedis(exchangeRequest, transfer) {
  const client = getRedisClient().duplicate();
  client.on("error", err => console.error("Error de Redis:", err.message));

  await client.connect();

  // Redis - mantengo el mismo resultado durante los reintentos
  const operationId = nanoid();
  const operationDate = new Date();
  let transferResult = null;

  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      await client.watch([ACCOUNTS_KEY, RATES_KEY, LOG_KEY]);

      try {
        const [accountsRaw, ratesRaw, logRaw] = await Promise.all([
          client.get(ACCOUNTS_KEY),
          client.get(RATES_KEY),
          client.get(LOG_KEY),
        ]);

        if (!accountsRaw || !ratesRaw || !logRaw) {
          throw new Error("Faltan datos de arVault en Redis");
        }

        const accounts = JSON.parse(accountsRaw);
        const rates = JSON.parse(ratesRaw);
        const log = JSON.parse(logRaw);

        const {
          baseCurrency,
          counterCurrency,
          baseAccountId,
          counterAccountId,
          baseAmount,
        } = exchangeRequest;

        const amount = Number(baseAmount);
        const exchangeRate = rates[baseCurrency]?.[counterCurrency];

        const baseAccount = accounts.find(
          account => account.currency === baseCurrency
        );
        const counterAccount = accounts.find(
          account => account.currency === counterCurrency
        );

        if (
          !baseAccount ||
          !counterAccount ||
          baseAccount.id === counterAccount.id ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          !Number.isFinite(exchangeRate) ||
          exchangeRate <= 0
        ) {
          throw new Error("Datos de intercambio invalidos");
        }

        const counterAmount = amount * exchangeRate;

        if (!Number.isFinite(counterAmount) || counterAmount <= 0) {
          throw new Error("Importe de intercambio invalido");
        }

        const result = {
          id: operationId,
          ts: operationDate,
          ok: false,
          request: exchangeRequest,
          dni: exchangeRequest.dni,
          arca: exchangeRequest.arca,
          exchangeRate,
          counterAmount: 0,
          obs: null,
        };

        if (counterAccount.balance >= counterAmount) {
          // Redis - ejecuto las transferencias simuladas una sola vez
          if (transferResult === null) {
            const withdrawn = await transfer(
              baseAccountId,
              baseAccount.id,
              amount
            );

            if (withdrawn) {
              const deposited = await transfer(
                counterAccount.id,
                counterAccountId,
                counterAmount
              );

              if (deposited) {
                transferResult = "ok";
              } else {
                await transfer(baseAccount.id, baseAccountId, amount);
                transferResult = "deposit_failed";
              }
            } else {
              transferResult = "withdraw_failed";
            }
          }

          if (transferResult === "ok") {
            counterAccount.balance -= counterAmount;
            baseAccount.balance += amount;
            result.ok = true;
            result.counterAmount = counterAmount;
          } else if (transferResult === "deposit_failed") {
            result.obs = "Could not transfer to clients' account";
          } else {
            result.obs = "Could not withdraw from clients' account";
          }
        } else {
          result.obs = "Not enough funds on counter currency account";
        }

        log.push(result);

        // Redis - actualizo cuentas e historial juntos
        await client.multi()
          .set(ACCOUNTS_KEY, JSON.stringify(accounts))
          .set(LOG_KEY, JSON.stringify(log))
          .exec();

        return result;
      } catch (err) {
        // Redis - reintento si otro nodo modifico los datos
        if (err instanceof WatchError) {
          continue;
        }

        throw err;
      }
    }

    throw new Error("No se pudo completar la operacion por concurrencia");
  } finally {
    client.destroy();
  }
}
