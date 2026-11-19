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

## P-06 — Carga alta de intercambios con dos nodos

- Qué vamos a probar: aumentar la carga con los dos nodos actuales y ver
  en qué tramo empieza a crecer la demora o aparecen errores nuevos.
  Se mantienen las VMs Standard_D2als_v7 en eastus2, Redis Balanced_B0 y
  ARCA con 0,5 CPU y 0,5 GiB. La aplicación sigue con el código de 827af31.
- Carga: usar perf/exchange-high.yaml. Primero, 30 segundos a diez
  solicitudes por segundo; después, 30 segundos subiendo de diez a 25,
  60 segundos a 25, 30 segundos subiendo de 25 a 50 y 60 segundos a 50.
  Son 210 segundos de carga y unas 6.450 solicitudes si el generador
  mantiene el ritmo. Cada usuario virtual envía una solicitud.
- Datos: el mismo DNI "1000000" y el mismo cambio de 1.000 ARS a USD.
  La cotización debe mantenerse en 0,00066. Antes de empezar debe haber
  al menos 5.000 USD disponibles, que cubren las 6.450 aprobaciones
  posibles con margen. Mantener los datos que ya existen en Redis.
- Condiciones: mismo equipo con Ubuntu/WSL, desde CABA y por WiFi; sin
  otras pruebas, despliegues ni cambios de cotización. Ambos nodos activos
  con la misma versión, Redis habilitado y cero reservas pendientes.
  Guardar la cantidad de entradas y el tamaño del historial antes y después:
  el historial crece con cada operación y eso puede influir en la demora.
- Referencia: con dos nodos y diez solicitudes por segundo hubo 722
  aprobaciones y 238 errores de ARCA sobre 960 solicitudes. El p95 fue
  de 1.353,1 ms y se midieron 7,58 aprobaciones/s en 50 segundos completos
  de la última fase. La CPU de ambos nodos estuvo por debajo del 10 %.
- Qué esperamos: en el tramo de 25 solicitudes/s, al menos 15 aprobaciones/s
  y p95 menor a 3.000 ms. En el tramo de 50 solicitudes/s, al menos
  30 aprobaciones/s y p95 menor a 5.000 ms. Calcularemos estas métricas
  sobre intervalos completos de cada tramo sostenido y revisaremos
  también el p95 de las respuestas aprobadas.
- Errores esperados: al menos 60 % de respuestas HTTP 200 en total y como
  máximo 40 % de errores de ARCA HTTP 502/504. Esperamos cero HTTP 403,
  fallos de negocio HTTP 500, operaciones pendientes HTTP 503, errores
  de conexión o timeout del generador y respuestas con formato incorrecto.
- Por qué: a diez solicitudes/s los nodos tenían margen de CPU. Esperamos
  atender más intercambios, aunque ARCA sigue con los mismos recursos.
  Además, cada intercambio lee el historial completo de Redis y al guardar
  su resultado vuelve a escribirlo. Con más operaciones al mismo tiempo,
  los nodos compiten por las mismas claves y el historial es cada vez mayor.
  Por eso dejamos margen de latencia y buscamos dónde empieza a empeorar.
- Límite del generador: máximo de 200 usuarios virtuales activos por fase.
  Con la media anterior de 920,8 ms, a 50 solicitudes/s habría unas 46
  operaciones en curso si esa demora se mantuviera.
- Saldos e historial: por cada aprobación, +1.000 ARS y -0,66 USD; EUR y BRL
  sin cambios. Los errores de ARCA no deben modificar saldos. 
- Alcance: esta primera ejecución mide dos nodos. Para comparar uno y dos
  con carga alta habrá que repetir el mismo escenario con un nodo y su
  predicción previa, registrando también el crecimiento del historial.
  Sostener 50 solicitudes/s tampoco probaría que esa es la capacidad máxima.
- Referencia: `perf/results/2-nodos/20261119t041857z-2-nodos-exchange-ramp/report.json`
  y `evidence/2-nodos/20261119t041857z-2-nodos-exchange-ramp/`.

## P-07 — Táctica de rendimiento: reducir el trabajo sobre el historial

- Problema observado: P-06 envió 3.891 solicitudes; hubo 413 respuestas
  HTTP 200 y 2.747 timeouts. Se omitieron 2.559 usuarios al alcanzar el límite.
  En los 50 segundos completos analizados de cada tramo sostenido de 25
  y 50 solicitudes/s no hubo respuestas aprobadas. Los logs mostraron
  conflictos de actualización y errores OOM de Redis. Esto justifica
  reducir el trabajo por intercambio, aunque no aísla una causa única.
- Cambio: guardar cada nueva operación en una lista de Redis con RPUSH,
  sin leer ni reescribir el historial anterior. Mantener la lógica en
  JavaScript, WATCH/MULTI y el límite de diez intentos para los saldos.
  El historial no se vigila con WATCH. Cada intercambio sigue usando una
  conexión aislada, y las transferencias quedan fuera de los reintentos.
- Configuración y carga: dos nodos Standard_D2als_v7, el mismo Redis
  Balanced_B0 y ARCA de 0,5 CPU y 0,5 GiB. Usar exchange-high.yaml sin
  cambiar fases, timeout de diez segundos ni límite de 200 usuarios.
  Mismo equipo Ubuntu/WSL, CABA y WiFi; sin otras pruebas ni despliegues.
- Datos: DNI "1000000", cambios de 1.000 ARS a USD y cotización 0,00066.
  Partir de los mismos datos que P-06: 121.497.000 ARS, 59.011,98 USD,
  40.000 EUR, 60.000 BRL y 1.989 operaciones anteriores. Los saldos exactos
  y el historial de 834.926 bytes están en los JSON anteriores a P-06.
- Preparación: detener ambas aplicaciones y respaldar el estado completo.
  Restaurar accounts-before.json, rates-before.json y log-before.json de
  `evidence/2-nodos/20261119t045643z-2-nodos-exchange-high/`, y retirar las
  140 reservas de esa prueba. Es un reinicio de datos de prueba, no una
  reconciliación de las operaciones fallidas. Su evidencia se conserva.
  Verificar cero reservas y los mismos datos en ambos nodos antes de medir.
  Registrar cantidad de entradas y tamaño del historial antes y después.
- Predicción: al menos 15 respuestas aprobadas/s en el tramo de 25
  solicitudes/s, y 30 aprobadas/s en el de 50. p95 menor a 3.000 ms y
  5.000 ms, respectivamente. Usar intervalos completos de diez segundos
  dentro de cada tramo; informar también el p95 de las aprobadas si las hay.
- Errores: esperamos al menos 60 % de HTTP 200 sobre solicitudes enviadas
  y como máximo 40 % de HTTP 502/504 por ARCA. Cero HTTP 403, 500, 503,
  timeouts, respuestas inválidas y usuarios omitidos. Eliminar trabajo
  de Redis no elimina los fallos del simulador ARCA.
- Por qué: las solicitudes dejarán de descargar y volver a guardar todo
  el historial, que en P-06 creció de 834.926 a 1.114.214 bytes. Agregar
  una entrada no requiere recorrer las anteriores ni provoca conflictos
  por el historial. Los cambios de
  saldo todavía pueden provocar reintentos: la predicción puede no cumplirse
  si esa competencia sigue siendo el límite. La prueba debe comprobarlo.
- Consistencia: conservar todas las entradas anteriores. Cada aprobación
  nueva debe sumar 1.000 ARS y descontar 0,66 USD; EUR y BRL sin cambios.
  Verificar historial, reservas y saldos aunque Artillery termine con código 0.
- Costos: el historial sigue creciendo y GET /log lee todas las entradas.
  Las confirmaciones guardan además una copia del resultado por ID para
  identificar si ya se aplicó. Se conserva el costo de las conexiones
  aisladas y pueden agotarse los diez intentos sobre los saldos. Desplegar
  la misma versión en ambos nodos sin tráfico durante el cambio; volver
  al código anterior haría que /log no mostrara las entradas nuevas.
  No cambiamos el SKU ni ARCA.
- Referencia: `perf/results/2-nodos/20261119t045643z-2-nodos-exchange-high/report.json`
  y `evidence/2-nodos/20261119t045643z-2-nodos-exchange-high/`.
- Registro de la preparación: `evidence/2-nodos/20261119t105255z-preparacion-p07/`.
