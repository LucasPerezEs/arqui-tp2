import axios from "axios";
import { performance } from "node:perf_hooks";
import config from "./config.js";
import { metrics } from "./metrics.js";

export function isValidDni(dni) {
  return typeof dni === "string" && /^[1-9][0-9]{6,7}$/.test(dni);
}

function errorReason(error) {
  if (error.code === "ARCA_INVALID_RESPONSE") return "invalid_response";
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code)) return "timeout";
  if (error.response?.status >= 500) return "http_5xx";
  if (error.response?.status >= 400) return "http_4xx";
  return "network";
}

export class ArcaError extends Error {
  constructor(error) {
    const reason = errorReason(error);
    super(reason === "timeout" ? "ARCA validation timed out" : "Could not validate DNI with ARCA", { cause: error });
    this.name = "ArcaError";
    this.reason = reason;
    this.code = reason === "timeout" ? "ARCA_TIMEOUT" : "ARCA_UNAVAILABLE";
    this.httpStatus = reason === "timeout" ? 504 : 502;
    this.upstreamStatus = error.response?.status ?? null;
  }
}

export async function validateDni(dni) {
  if (!isValidDni(dni)) {
    throw new Error("El DNI debe ser un texto entre 1000000 y 99999999");
  }

  const started = performance.now();
  let outcome = "error";
  metrics.increment("arca.requests");

  try {
    const response = await axios.post(
      `${config.arcaUri}/validar`,
      { dni },
      { timeout: 5000 }
    );

    if (typeof response.data?.ok !== "boolean"
        || (response.data.ok && (typeof response.data.codigoAutorizacion !== "string"
          || response.data.codigoAutorizacion.trim() === ""))) {
      const error = new Error("Respuesta invalida de ARCA");
      error.code = "ARCA_INVALID_RESPONSE";
      error.response = { status: response.status };
      throw error;
    }

    outcome = response.data.ok ? "approved" : "rejected";
    metrics.increment(`arca.${outcome}`);
    return { ...response.data, dni };
  } catch (error) {
    const arcaError = new ArcaError(error);
    metrics.increment("arca.errors", 1, [`reason:${arcaError.reason}`]);
    throw arcaError;
  } finally {
    metrics.timing("arca.duration_ms", performance.now() - started, [`outcome:${outcome}`]);
  }
}
