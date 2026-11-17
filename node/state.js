import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

let accounts = null;
let rates = null;
let log = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas de los archivos donde se guardan los datos
const ACCOUNTS = "./state/accounts.json";
const RATES = "./state/rates.json";
const LOG = "./state/log.json";

// Inicializa el estado cargando los datos desde los archivos JSON
export async function init() {
  accounts = await load(ACCOUNTS);
  rates = await load(RATES);
  log = await load(LOG);

  // Programa el guardado periodico de los datos
  scheduleSave(accounts, ACCOUNTS, 1000);
  scheduleSave(rates, RATES, 5000);
  scheduleSave(log, LOG, 1000);
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