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
