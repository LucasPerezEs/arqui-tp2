# Predicciones

## P-01 — Latencia base del despliegue inicial

- Configuración: una instancia Standard_D2als_v7 en eastus2.
- Escenario: perf/root.yaml; GET / durante 60 segundos,
  con una llegada por segundo.
- Generador: Ubuntu en WSL, ejecutado desde Ciudad Autonoma de Buenos Aires.
- Conexión: WiFi.
- Predicción: cero errores HTTP y de conexión; p95 menor a 500 ms.
- Justificación: el endpoint devuelve un texto fijo y no consulta
  ARCA ni Redis. A esta tasa esperamos que predomine la latencia
  de internet, sin saturación del nodo.