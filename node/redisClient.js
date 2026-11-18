import { createClient } from "redis";

// Cliente compartido para conectarse a Redis
let redisClient = null;

// Inicializa Redis solo cuando esta habilitado
export async function initRedis() {
  if (process.env.REDIS_ENABLED !== "true") {
    console.log("Redis deshabilitado, se mantiene el almacenamiento JSON");
    return;
  }

  // Redis - valido los datos segun el entorno
  const redisLocal = process.env.REDIS_LOCAL === "true";

  if (!process.env.REDIS_HOST || (!redisLocal && !process.env.REDIS_PASSWORD)) {
    throw new Error("Faltan los datos de conexion a Redis");
  }

  redisClient = createClient({
    ...(!redisLocal && {
      username: "default",
      password: process.env.REDIS_PASSWORD,
    }),
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || (redisLocal ? 6379 : 10000)),
      tls: !redisLocal,
    },
  });

  // Registra errores de conexion sin mostrar credenciales
  redisClient.on("error", (err) => {
    console.error("Error de Redis:", err.message);
  });

  await redisClient.connect();

  // Comprueba que Redis responda
  await redisClient.ping();
  console.log("Conexion con Redis establecida");
}

// Devuelve el cliente para las operaciones de almacenamiento
export function getRedisClient() {
  if (!redisClient?.isReady) {
    throw new Error("Redis no esta conectado");
  }

  return redisClient;
}
