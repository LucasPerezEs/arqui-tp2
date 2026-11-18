
import axios from "axios";
import config from "./config.js";

// Genera un DNI aleatorio entre 1.000.000 y 99.999.999
function generateDni() {
  return String(
    Math.floor(Math.random() * (99999999 - 1000000 + 1)) + 1000000
  );
}

// Consulta el servicio de ARCA
export async function validateDni() {
  const dni = generateDni();

  const response = await axios.post(
    `${config.arcaUri}/validar`,
    { dni },
    { timeout: 5000 }
  );

  return {
    dni,
    ...response.data,
  };
}
