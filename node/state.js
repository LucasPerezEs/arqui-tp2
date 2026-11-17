
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { initRedis } from "./redisClient.js";

// Redis - importo el cliente para leer y guardar el estado
import { getRedisClient } from "./redisClient.js";

let accounts = null;
let rates = null;
let log = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas de los archivos donde se guardan los datos
const ACCOUNTS = "./state/accounts.json";
const RATES = "./state/rates.json";
const LOG = "./state/log.json";

// Redis - claves que identifican cada conjunto de datos
const REDIS_ACCOUNTS = "arvault:accounts";
const REDIS_RATES = "arvault:rates";
const REDIS_LOG = "arvault:log";

// Inicializa el estado cargando los datos desde los archivos JSON
export async function init() {
  // Inicializo la conexion a Redis si esta habilitada
  await initRedis();

  // Redis - selecciono el almacenamiento segun la configuracion
  if (process.env.REDIS_ENABLED === "true") {
    accounts = await loadRedis(REDIS_ACCOUNTS, ACCOUNTS);
    rates = await loadRedis(REDIS_RATES, RATES);
    log = await loadRedis(REDIS_LOG, LOG);

    // Redis - guardado periodico para la primera etapa con un nodo
    // scheduleSaveRedis(accounts, REDIS_ACCOUNTS, 1000);
    // scheduleSaveRedis(rates, REDIS_RATES, 5000);
    // scheduleSaveRedis(log, REDIS_LOG, 1000);
  } else {
    accounts = await load(ACCOUNTS);
    rates = await load(RATES);
    log = await load(LOG);

    // Programa el guardado periodico de los datos
    scheduleSave(accounts, ACCOUNTS, 1000);
    scheduleSave(rates, RATES, 5000);
    scheduleSave(log, LOG, 1000);
  }
}

// Devuelve las cuentas almacenadas en memoria
export function getAccounts() {
  return accounts;
}

// Devuelve las tasas de cambio actuales
export function getRates() {
  return rates;
}

// Devuelve el historial de operaciones
export function getLog() {
  return log;
}

// Lee un archivo JSON y devuelve su contenido
async function load(fileName) {
  const filePath = path.join(__dirname, fileName);

  try {
    await fs.promises.access(filePath);
    const raw = await fs.promises.readFile(filePath, "utf8");
    
    return JSON.parse(raw);
  } catch (err) {
    // Diferencia entre un archivo inexistente y otros errores de lectura
    if (err.code == "ENOENT") {
      console.error(`${filePath} not found`);
    } else {
      console.error(`Error loading ${filePath}:`, err);
    }
  }
}

// Guarda los datos en el archivo JSON correspondiente
async function save(data, fileName) {
  const filePath = path.join(__dirname, fileName);
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing to ${filePath}:`, err);
  }
}

// Programa un guardado automatico cada cierta cantidad de milisegundos
function scheduleSave(data, fileName, period) {
  setInterval(async () => {
    await save(data, fileName);
  }, period);
}

// Redis - carga los datos compartidos
async function loadRedis(key, fileName) {
  const client = getRedisClient();

  // Uso el JSON inicial solamente si la clave no existe
  const initialData = await load(fileName);

  if (initialData !== undefined) {
    await client.set(key, JSON.stringify(initialData), { NX: true });
  }

  const data = await client.get(key);

  if (data === null) {
    throw new Error(`No se pudo inicializar ${key} en Redis`);
  }

  return JSON.parse(data);
}

// Redis - guarda el estado periodicamente
function scheduleSaveRedis(data, key, period) {
  setInterval(async () => {
    try {
      const client = getRedisClient();
      await client.set(key, JSON.stringify(data));
    } catch (err) {
      console.error(`Error guardando ${key} en Redis:`, err.message);
    }
  }, period);
}