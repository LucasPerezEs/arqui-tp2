# Resultado P-03: intercambios con un nodo

Ejecucion: 20261119t024732z-1-nodo-exchange-low.
Prediccion y escenario commiteados antes de medir en 4633fde.

| Metrica | Prediccion | Resultado |
| --- | --- | --- |
| Solicitudes | 60 | 60 |
| HTTP 200 | Al menos 48 | 44 (73,33 %) |
| Errores de ARCA HTTP 502/504 | Como maximo 12 | 16 HTTP 502 (26,67 %) |
| Latencia HTTP p95 | Menor a 2.000 ms | 1.300,1 ms |
| Conexiones fallidas o timeouts del generador | 0 | 0 |
| Respuestas fuera de contrato | 0 | 0 |
| Respuestas pendientes HTTP 503 | 0 | 0 |
| Historial y saldos | Coherentes con las aprobaciones | Verificado |

El historial paso de 9 a 69 entradas: 44 intercambios aprobados y 16 errores
ARCA_UNAVAILABLE con arca.error.type=http_5xx y upstreamStatus=500.
Cada aprobacion conserva el DNI enviado y su codigo de autorizacion.
Las entradas anteriores se conservaron y no hay IDs duplicados.

Los saldos cambiaron +44.000 ARS y -29,04 USD, dentro de la tolerancia de
aritmetica de punto flotante del codigo actual. EUR, BRL y cotizaciones no
cambiaron. La consulta posterior al agente de la VM encontro cero reservas
pendientes; su instante queda en vm-after-10.0.2.4.json.

La latencia mediana HTTP fue 1.085,9 ms. Las aprobaciones tuvieron media
1.141,5 ms y los errores media 178,1 ms: los errores rapidos bajan la media
global (884,6 ms), por lo que una menor media no implica mejor servicio.

Artillery completo 60 usuarios y salio con codigo 0 porque las respuestas
de error cumplen el contrato del escenario. Eso no significa 60 cambios
aprobados: el throughput de negocio fue 44/60 = 0,733 aprobaciones/s sobre
la fase de 60 segundos, frente a una llegada de 1 solicitud/s.

La prediccion de al menos 80 % de aprobaciones no se cumplio. El limite del
20 % de errores era una hipotesis basada en una muestra funcional pequeña;
esta ejecucion observo 26,67 %. No se modifica la prediccion original.

Esta prueba confirma comportamiento a baja carga. Los errores provienen de
ARCA, pero este resultado no demuestra saturacion ni permite identificar un
cuello de botella de capacidad. La siguiente medicion debe aumentar la carga
y correlacionar latencias, errores y uso de recursos.

## Evidencia

- Reporte y escenario: perf/results/1-nodo/20261119t024732z-1-nodo-exchange-low/.
- Snapshots originales: accounts-before/after.json, rates-before/after.json,
  log-before/after.json en esta carpeta.
- Validacion calculada: analysis.json.
- Verificacion posterior de la VM: vm-after-10.0.2.4.json.
- datadog-trafico-latencia-http.png: solicitudes, respuestas, latencias y errores HTTP.
- datadog-resultados-cpu-memoria.png: resultados, usuarios virtuales y recursos de la VM.
- datadog-arca-y-resultados-negocio.png: validaciones, errores y latencias de ARCA,
  e intercambios finalizados.
- datadog-volumen-y-flujo-neto.png: volumen y flujo neto por moneda.
- Falta incorporar el JSON exportado del dashboard realmente utilizado.

Las capturas muestran 18/11/2026 23:47 a 23:50 (Argentina), rango que contiene
toda la ejecucion. Solo la primera captura incluye la cabecera completa.
La actividad del reporte va de 23:47:44 a 23:48:44 aproximadamente.
Filtros de Artillery: test=exchange-low, case=1-nodo,
run=20261119t024732z-1-nodo-exchange-low.
Filtros de aplicacion: env=azure y host=tp2vmss000000.

## Lectura de las capturas

La CPU de la VM se ve muy baja en la escala de 0 a 100 % y la memoria no
disponible ronda el 19 %. No se observa saturacion de la VM en estas capturas.
Esto no mide los recursos de ARCA ni de Redis.

Los picos por intervalo del dashboard no representan la capacidad maxima
del sistema. Para los totales y la tasa media de esta ejecucion se usa el
reporte crudo de 60 solicitudes y 44 aprobaciones en la fase de 60 segundos.
Los percentiles del dashboard son por intervalo; el p95 global de 1.300,1 ms
proviene del agregado del reporte.

El panel de resultados de cambios capturado muestra aprobados, no aprobados
y respuestas fuera de contrato; no muestra la serie de pendientes agregada
al template local. Antes de la siguiente medicion, actualizar ese panel con
la consulta de tp2_exchange_pending y exportar el dashboard utilizado.
El cero de pendientes de esta prueba esta respaldado por el reporte y la
consulta posterior a Redis, no por esa captura.

Las curvas ARCA/negocio se muestran como lineas y se extienden antes del
primer evento del reporte. No se usa ese tramo visual para afirmar trafico
previo ni para calcular totales. El inicio y fin de actividad se toman de
los timestamps del reporte crudo.
