
import { WatchError } from "redis";
import { getRedisClient } from "./redisClient.js";

// Redis - actualizo una clave sin pisar cambios de otros nodos
async function updateRedis(key, modify) {
  const client = getRedisClient().duplicate();
  client.on("error", err => console.error("Error de Redis:", err.message));

  await client.connect();

  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      await client.watch(key);

      const raw = await client.get(key);
      if (raw === null) {
        throw new Error(`No se encontro ${key} en Redis`);
      }

      const data = JSON.parse(raw);
      modify(data);

      try {
        await client.multi()
          .set(key, JSON.stringify(data))
          .exec();

        return data;
      } catch (err) {
        if (err instanceof WatchError) {
          continue;
        }

        throw err;
      }
    }

    throw new Error("Demasiadas operaciones simultaneas");
  } finally {
    client.destroy();
  }
}

// Redis - actualizo el saldo de una cuenta
export async function setRedisBalance(accountId, balance) {
  const newBalance = Number(balance);

  if (!Number.isFinite(newBalance) || newBalance < 0) {
    throw new Error("Saldo invalido");
  }

  return updateRedis("arvault:accounts", accounts => {
    const account = accounts.find(a => a.id == accountId);

    if (!account) {
      throw new Error("Cuenta inexistente");
    }

    account.balance = newBalance;
  });
}

// Redis - actualizo una tasa y su reciproca
export async function setRedisRate(rateRequest) {
  const { baseCurrency, counterCurrency, rate } = rateRequest;
  const newRate = Number(rate);

  if (!Number.isFinite(newRate) || newRate <= 0) {
    throw new Error("Tasa invalida");
  }

  return updateRedis("arvault:rates", rates => {
    if (!rates[baseCurrency] || !rates[counterCurrency]) {
      throw new Error("Moneda inexistente");
    }

    rates[baseCurrency][counterCurrency] = newRate;
    rates[counterCurrency][baseCurrency] =
      Number((1 / newRate).toFixed(5));
  });
}
