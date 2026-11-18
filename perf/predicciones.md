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

## P-02 — Cotizaciones con un nodo y Redis en Azure

- Configuración: una instancia Standard_D2als_v7 en eastus2; Azure Managed
  Redis Balanced_B0, sin alta disponibilidad, con TLS y endpoint privado.
- Escenario: perf/rates.yaml; GET /rates durante 60 segundos, con
  diez llegadas por segundo y un request por usuario virtual.
- Generador previsto: el mismo equipo con Ubuntu/WSL, en CABA y por WiFi
  que se usó en P-01. Confirmar estas condiciones antes de ejecutar;
  si cambiaron, actualizar esta predicción antes del commit y de la prueba.
- Condiciones: sin otras pruebas ni despliegues simultáneos; una instancia
  activa; Redis habilitado en la aplicación; cotización ARS/USD positiva.
- Predicción: 600 respuestas HTTP 200, cero errores HTTP, de conexión o
  de validación del escenario, y latencia HTTP p95 menor a 500 ms.
  Esperamos sostener aproximadamente diez respuestas exitosas por segundo.
- Justificación: la medición inicial de GET / tuvo p95 de 149,9 ms.
  GET /rates realiza un GET a Redis dentro de la red de Azure y procesa
  un JSON pequeño; no consulta ARCA según el código actual.
  A esta carga esperamos que predomine la latencia de internet y que
  esa lectura no agregue cientos de milisegundos ni sature el nodo.
  La comparación usa la misma métrica http.response_time.
- Alcance: esta prueba verifica lectura de cotizaciones con almacenamiento
  externo; no mide todavía el flujo de cambio ni la capacidad máxima.
- Evidencia previa de infraestructura: evidence/redis/infraestructura.json,
  evidence/redis/vmss.json y evidence/1-nodo/app-10.0.2.4.json.
