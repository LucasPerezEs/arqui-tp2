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

## P-04 — Carga creciente de intercambios con un nodo

- Configuración: la misma de P-03; una instancia Standard_D2als_v7 en eastus2,
  Redis Balanced_B0 con TLS y endpoint privado, y ARCA en Container Instances
  con 0,5 CPU y 0,5 GiB. Código de la aplicación: commit 827af31.
- Escenario: perf/exchange-ramp.yaml; POST /exchange con DNI "1000000",
  cambio de 1.000 ARS a USD y una solicitud por usuario virtual.
  Fases: 30 segundos a una llegada/s, 60 segundos de rampa de una a diez
  llegadas/s y 60 segundos sostenidos a diez llegadas/s. Duración de las
  fases: 150 segundos. La integral ideal de la carga es aproximadamente
  960 solicitudes; el número real se tomará del reporte, sin forzarlo a
  coincidir con esa aproximación.
- Generador y condiciones: mismo equipo con Ubuntu/WSL desde CABA y por WiFi;
  sin otras pruebas, despliegues ni cambios de cotización simultáneos;
  un nodo activo; Redis habilitado; cero reservas pendientes al comenzar;
  saldo USD suficiente para todas las aprobaciones.
- Referencia: P-03 tuvo 60 solicitudes, 44 aprobaciones, 16 errores HTTP 502
  por fallos HTTP 500 de ARCA, cero operaciones pendientes y p95 de
  1.300,1 ms. La media de las aprobaciones fue 1.141,5 ms. Los saldos y el
  historial fueron consistentes. Las capturas mostraron CPU baja en la VM.
- Predicción de latencia: p95 HTTP global menor a 2.500 ms, incluyendo las
  respuestas de error. Revisar además los intervalos de la fase sostenida
  para detectar crecimiento de latencia que el agregado pueda ocultar.
- Predicción de resultados: al menos 60 % de respuestas HTTP 200 y como
  máximo 40 % de errores de ARCA HTTP 502/504. En la fase sostenida
  esperamos al menos seis aprobaciones/s en promedio, con diez llegadas/s.
- Predicción de otros errores: cero HTTP 403 para el DNI verificado,
  cero HTTP 500 por fallos de negocio, cero HTTP 503 de operaciones
  pendientes, cero errores de conexión o timeout del generador y cero
  respuestas fuera de contrato.
- Justificación: las transferencias simuladas esperan con setTimeout y las
  transacciones de Redis se confirman antes y después de esas esperas, por
  lo que varias operaciones pueden avanzar juntas. Con la media global de
  884,6 ms de P-03, a diez llegadas/s habría del orden de nueve operaciones
  en curso si la latencia se mantuviera. Esto no demuestra capacidad:
  aumentan la competencia por las claves compartidas de Redis y el trabajo
  sobre el historial JSON, y ARCA tiene recursos acotados.
- Justificación de los umbrales: 2.500 ms deja margen sobre los 1.300,1 ms
  previos para una carga diez veces mayor en la última fase. El máximo
  del 40 % de errores es una hipótesis con margen sobre el 26,7 % observado;
  no representa una probabilidad conocida del simulador. Si aparecen más
  errores, comparar sus causas y latencias antes de atribuirlos a saturación.
- Consistencia esperada: al finalizar y completar los usuarios virtuales,
  el número de entradas nuevas del historial debe coincidir con las
  solicitudes procesadas. Con cotización 0,00066, por N aprobaciones se
  espera +1.000*N ARS y -0,66*N USD. EUR y BRL no deben variar; los fallos
  de ARCA no deben alterar saldos; no deben quedar reservas pendientes.
- Comparación: separar el promedio de toda la ejecución del throughput en
  la fase sostenida. Informar llegadas, solicitudes, aprobaciones, estados
  HTTP, p50/p95, latencia de ARCA, CPU/memoria de la VM, saldos e historial.
  No usar los picos de un intervalo como capacidad máxima ni inferir
  saturación de ARCA o Redis a partir de la CPU de la VM de aplicación.
- Evidencia de referencia:
  evidence/1-nodo/20261119t024732z-1-nodo-exchange-low/analysis.json,
  sus capturas y snapshots, y
  perf/results/1-nodo/20261119t024732z-1-nodo-exchange-low/report.json.

## P-05 — Misma carga de intercambios con dos nodos

- Configuración: repetir la prueba P-04 con dos nodos en lugar de uno.
  Ambos serán Standard_D2als_v7 en eastus2 y usarán el mismo balanceador,
  Redis Balanced_B0 con conexión privada y TLS, y ARCA con 0,5 CPU y
  0,5 GiB. La aplicación seguirá con el código del commit 827af31.
- Carga: usar perf/exchange-ramp.yaml sin cambiarlo. Primero, 30 segundos
  a una solicitud por segundo; después, 60 segundos subiendo de una a diez;
  por último, 60 segundos a diez solicitudes por segundo. Cada solicitud
  cambia 1.000 ARS a USD con el DNI "1000000". Esperamos unas 960 solicitudes;
  para analizar el resultado usaremos la cantidad que registre el reporte.
- Condiciones: mismo equipo con Ubuntu/WSL, desde CABA y por WiFi. Sin otras
  pruebas, despliegues ni cambios de cotización mientras medimos. Los dos
  nodos deben usar Redis y la misma versión de la aplicación. Mantener los
  datos existentes, saldo suficiente, cotización ARS/USD de 0,00066 y cero
  reservas pendientes antes de empezar.
- Qué pasó con un nodo: hubo 960 solicitudes, 728 aprobadas (75,83 %) y
  232 errores HTTP 502 por fallos HTTP 500 de ARCA (24,17 %). La mediana
  fue de 1.085,9 ms y el p95 de 1.326,4 ms. En 50 segundos de la última
  fase hubo 385 aprobaciones: 7,7 por segundo. La CPU estuvo por debajo
  del 10 % y no quedaron reservas pendientes.
- Qué esperamos con dos nodos: entre seis y nueve aprobaciones por segundo
  durante la última fase. El 95 % de las respuestas debería tardar menos
  de 2.000 ms (p95), contando también las respuestas de error. No esperamos
  el doble de aprobaciones: seguimos enviando diez solicitudes por segundo
  y un solo nodo ya pudo atender esa carga. Esta prueba no mide la carga
  máxima que pueden soportar dos nodos.
- Por qué: agregar otro nodo no reduce la demora de internet, ARCA ni las
  transferencias simuladas. ARCA y Redis siguen siendo los mismos servicios
  compartidos. Además, los dos nodos deberán actualizar los mismos saldos
  e historial en Redis sin perder cambios. La CPU baja de P-04 indica que
  el nodo tenía margen para atender esa carga.
- Errores esperados: al menos 60 % de respuestas HTTP 200 y como máximo
  40 % de errores de ARCA HTTP 502/504. Esperamos cero rechazos HTTP 403,
  fallos de negocio HTTP 500, operaciones pendientes HTTP 503, errores de
  conexión o timeout del generador y respuestas con formato incorrecto.
  Los fallos de ARCA pueden variar respecto de la prueba anterior.
- Saldos e historial: cada solicitud procesada debe agregar una entrada
  al historial, sin duplicados ni pérdida de entradas anteriores. Por cada
  aprobación, el saldo ARS debe subir 1.000 y el USD bajar 0,66. EUR y BRL
  deben quedar iguales. Los errores de ARCA no deben modificar saldos y
  no deben quedar reservas pendientes al terminar.
- Qué vamos a guardar y comparar: configuración del VMSS y de las dos
  aplicaciones; saldos, cotizaciones e historial antes y después; reporte
  de Artillery y capturas de Datadog con ambos nodos. Compararemos mediana,
  p95 y aprobaciones por segundo en intervalos completos de la última fase.
  No esperamos que el balanceador reparta exactamente la mitad a cada nodo.
  Un pico aislado del gráfico no indica la capacidad máxima del sistema.
- Referencia: `perf/results/1-nodo/20261119t031538z-1-nodo-exchange-ramp/report.json`
  y `evidence/1-nodo/20261119t031538z-1-nodo-exchange-ramp/`.
