# Pruebas de rendimiento

Ejecutar desde la raíz del repositorio, en Ubuntu, con Node.js >= 22.18.

## Configuración

Instalar las dependencias una vez:

```bash
(cd perf && npm ci)
```

Configurar la terminal:

```bash
export TARGET="http://losvkupkav.eastus2.cloudapp.azure.com"
export DATADOG_SITE="us5.datadoghq.com"
read -rsp "API key de Datadog: " DATADOG_API_KEY
echo
export DATADOG_API_KEY
```

## Ejecutar una prueba

Antes de cada medición, registrar y commitear su predicción en `perf/predicciones.md`.
Para los cambios, confirmar que ARCA y Redis estén integrados y configurar
`TP2_DNI` con un DNI de prueba verificado.

```bash
bash perf/run.sh root 1-nodo
bash perf/run.sh rates 1-nodo

export TP2_DNI="1000000"
bash perf/run.sh exchange-low 1-nodo
bash perf/run.sh exchange-ramp 1-nodo
```

Son pruebas independientes. Usar `2-nodos` cuando esa configuración esté desplegada.
Los reportes y horarios se guardan en `perf/results/<caso>/<run>/`.

El DNI 1000000 fue aprobado fiscalmente en las verificaciones. El simulador
de ARCA también puede fallar con ese DNI; los HTTP 5xx siguen siendo errores.
El generador distingue aprobados, no aprobados y operaciones pendientes
EXCHANGE_PENDING. Una respuesta pendiente con formato válido no se cuenta
como intercambio aprobado ni como respuesta fuera de contrato.

## Carga alta

`exchange-high.yaml` usa el mismo flujo de intercambio y sube la carga
hasta 50 solicitudes por segundo:

| Tramo | Duración | Solicitudes por segundo |
|---|---:|---:|
| Inicio | 30 s | 10 |
| Subida | 30 s | 10 a 25 |
| Sostenido | 60 s | 25 |
| Subida | 30 s | 25 a 50 |
| Sostenido | 60 s | 50 |

Son 3 minutos y 30 segundos de carga; el proceso termina cuando finalizan
los usuarios que siguen activos. El total previsto es de unas 6.450
solicitudes y el límite es de 200 usuarios activos por fase. Si se alcanza
ese límite, revisar los usuarios omitidos y la carga que realmente se envió.

La primera ejecución corresponde a P-06 y usa los dos nodos actuales.
Commitear el escenario y la predicción antes de medir. Confirmar que ambos
nodos usen Redis y tengan la misma versión; cotización ARS/USD de 0,00066,
al menos 5.000 USD disponibles y cero reservas pendientes.

Guardar saldos, cotizaciones e historial antes y después en
`evidence/2-nodos/<run>/`, junto con la configuración desplegada y el JSON
del dashboard usado. Comparar cada tramo sostenido por separado.

```bash
export TP2_DNI="1000000"
bash perf/run.sh exchange-high 2-nodos
```

Si aparecen operaciones pendientes, errores nuevos o timeouts, revisar los
saldos, el historial y las reservas antes de repetir la prueba. Para comparar
con un nodo, usar el mismo escenario y registrar su predicción antes de medir.
