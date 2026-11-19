import { getRedisClient } from "./redisClient.js";

export const LOG_ENTRIES_KEY = "arvault:log:entries";
export const RESULT_PREFIX = "arvault:result:";

export async function assertRedisLogType(client) {
  const type = await client.type(LOG_ENTRIES_KEY);
  if (type !== "none" && type !== "list") {
    throw new Error("El historial nuevo de Redis no es una lista");
  }
}

export async function appendRedisLog(entry) {
  await getRedisClient().rPush(LOG_ENTRIES_KEY, JSON.stringify(entry));
}

export async function getRedisLog() {
  const client = getRedisClient();
  const [legacy, entries] = await Promise.all([
    client.get("arvault:log"),
    client.lRange(LOG_ENTRIES_KEY, 0, -1),
  ]);
  if (legacy === null) throw new Error("Falta el historial inicial en Redis");
  const previous = JSON.parse(legacy);
  if (!Array.isArray(previous)) throw new Error("El historial inicial no es una lista");
  return previous.concat(entries.map(entry => JSON.parse(entry)));
}
