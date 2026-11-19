# Métricas de la aplicación

El cliente compartido envía UDP a DogStatsD en `127.0.0.1:8125`.
Se puede configurar con `DD_AGENT_HOST` y `DD_DOGSTATSD_PORT`.
Ansible fija esos valores para el Agent de cada VM y `DD_ENV=azure`.
Localmente se usa `env:local`; hace falta un Agent para ver datos en Datadog.
Los errores de envío se escriben en consola y no alteran el resultado del cambio.

Todas las métricas incluyen `service:arvault` y `env`.
El Agent agrega el host. No se usan DNI ni códigos de autorización como etiquetas.

| Métrica | Significado |
| --- | --- |
| `arvault.arca.requests` | Consultas efectivamente intentadas a ARCA; excluye DNI con formato inválido. |
| `arvault.arca.approved` | Validaciones fiscales aprobadas. |
| `arvault.arca.rejected` | Validaciones fiscales rechazadas con `ok:false`. |
| `arvault.arca.errors` | Errores; etiqueta `reason`: `http_5xx`, `http_4xx`, `timeout`, `network` o `invalid_response`. |
| `arvault.arca.duration_ms` | Timer en milisegundos para todos los intentos; etiqueta `outcome`: `approved`, `rejected` o `error`. |
| `arvault.business.exchanges` | Intercambios finalizados tras una aprobación de ARCA; `outcome:approved` o `outcome:not_approved`. Excluye excepciones y rechazos fiscales previos. |
| `arvault.business.volume.ARS`, `.USD`, `.EUR`, `.BRL` | Importe intercambiado con éxito por moneda. |
| `arvault.business.net.ARS`, `.USD`, `.EUR`, `.BRL` | Flujo neto por moneda: entrada positiva y salida negativa. No es el saldo de la cuenta. |

Los contadores de DogStatsD se almacenan como tasas: usar `as_rate()` para
unidades por segundo y `as_count()` para cantidades/importes por intervalo.
El timer genera, entre otras, `.avg` y `.95percentile`: representan agregados
por nodo, intervalo y etiquetas, no el percentil global de todas las VM.

En el dashboard, `test`, `case` y `run` filtran Artillery; `host` y `env`
filtran la aplicación. Para correlacionarlos, usar el mismo intervalo absoluto
sin otras pruebas simultáneas. Para ARCA/negocio, `host=*` incluye todos los nodos.

## Errores de ARCA en `/exchange`

El rechazo fiscal devuelve HTTP 403 y se registra con `arca.ok:false`.
Los fallos HTTP, de conexión o de formato devuelven 502; un timeout devuelve 504.
Se registran con `arca.ok:null`, el tipo en `arca.error.type` y el estado HTTP
original en `arca.error.upstreamStatus` (o `null` si no hubo respuesta HTTP).
Estas fallas ocurren antes de llamar al intercambio y no modifican saldos.

`logRecorded:true` confirma que se agregó la operación al historial.
Si falla esa escritura se responde 503 con `error:OPERATION_LOG_UNAVAILABLE`
y `logRecorded:false`; el tipo de fallo de ARCA permanece en el cuerpo.
La ruta de diagnóstico `GET /:dni` consulta ARCA sin registrar un intercambio.
