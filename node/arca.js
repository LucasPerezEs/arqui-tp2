import axios from "axios";
import config from "./config.js";

export function isValidDni(dni) {
  return typeof dni === "string" && /^[1-9][0-9]{6,7}$/.test(dni);
}

export async function validateDni(dni) {
  if (!isValidDni(dni)) {
    throw new Error("El DNI debe ser un texto entre 1000000 y 99999999");
  }

  const response = await axios.post(
    `${config.arcaUri}/validar`,
    { dni },
    { timeout: 5000 }
  );

  if (typeof response.data?.ok !== "boolean"
      || (response.data.ok && (typeof response.data.codigoAutorizacion !== "string"
        || response.data.codigoAutorizacion.trim() === ""))) {
    throw new Error("Respuesta invalida de ARCA");
  }

  return { ...response.data, dni };
}
