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


## P-03 — Intercambios con un nodo, Redis y ARCA

- Configuración: una instancia Standard_D2als_v7 en eastus2; Redis Balanced_B0
  con TLS y endpoint privado; ARCA en Azure Container Instances.
  Aplicación con la corrección de reservas del commit 827af31.
- Escenario: perf/exchange-low.yaml; POST /exchange durante 60 segundos,
  con una llegada por segundo, una solicitud por usuario virtual,
  DNI "1000000" y cambio de 1.000 ARS a USD.
- Generador: el mismo equipo con Ubuntu/WSL desde CABA y por WiFi que
  en P-01 y P-02. Condiciones confirmadas antes de esta prueba.
- Condiciones: sin otras pruebas ni despliegues simultáneos; una instancia
  activa; Redis habilitado; ninguna reserva pendiente al comenzar;
  cotización ARS/USD constante y saldo suficiente para las 60 solicitudes.
- Predicción: 60 solicitudes; al menos 48 respuestas HTTP 200 (80 %);
  como máximo 12 fallos de ARCA expuestos como HTTP 502 o 504;
  cero rechazos fiscales HTTP 403, cero fallos de negocio HTTP 500,
  cero operaciones pendientes HTTP 503, cero errores de conexión o timeout
  del generador y cero respuestas fuera de contrato.
  Latencia HTTP p95 menor a 2.000 ms, calculada sobre todas las respuestas.
- Justificación de latencia: GET /rates tuvo p95 de 147 ms y la validación
  funcional de ARCA mostró latencias del orden de cientos de milisegundos.
  Cada intercambio aprobado agrega dos transferencias simuladas de
  200–400 ms y transacciones cortas con Redis. A una llegada por segundo,
  esperamos baja contención y una latencia del orden de un segundo.
- Justificación de errores: el DNI fue aprobado en las verificaciones
  funcionales, pero el simulador de ARCA también devolvió HTTP 500 con ese
  DNI. El límite del 20 % es una hipótesis; la muestra funcional
  no permite estimar una tasa estable de fallos. No esperamos cero errores
  de ARCA ni consideraremos esos errores intercambios aprobados.
- Consistencia esperada: una entrada nueva de historial por solicitud
  completada. Con la cotización actual de 0,00066 USD/ARS, cada aprobación
  debe aumentar el saldo ARS en 1.000 y disminuir el saldo USD en 0,66.
  Los fallos de ARCA deben registrarse sin alterar saldos y no deben quedar
  reservas pendientes al finalizar.
- Comparación: informar solicitudes y aprobaciones por separado, distribución
  de estados HTTP, p50/p95, errores de ARCA, operaciones pendientes y CPU.
  Comparar los resultados con estos umbrales sin reinterpretar un HTTP 5xx
  como éxito porque su cuerpo cumpla el contrato.
