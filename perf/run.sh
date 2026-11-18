#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }

if (( $# < 2 || $# > 3 )); then
  fail "Uso: bash perf/run.sh <root|rates|exchange-low|exchange-ramp> <caso> [run-id]"
fi

scenario="${1%.yaml}"
case_name="$2"
case "$scenario" in
  root|rates|exchange-low|exchange-ramp) ;;
  *) fail "Escenario desconocido: $scenario" ;;
esac
[[ "$case_name" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "Caso inválido; por ejemplo: 1-nodo o 2-nodos"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/.." && pwd)"

if [[ -z "${TARGET:-}" && -f "$repo_dir/node/lb_dns" ]]; then
  export TARGET="http://$(tr -d '\r\n' < "$repo_dir/node/lb_dns")"
fi
[[ "${TARGET:-}" =~ ^https?://[^[:space:]]+$ ]] || fail "Falta TARGET con la URL http(s) de la aplicación"
export TARGET
[[ -n "${DATADOG_API_KEY:-}" ]] || fail "Falta exportar DATADOG_API_KEY"

export DATADOG_SITE="${DATADOG_SITE:-us5.datadoghq.com}"
[[ "$DATADOG_SITE" =~ ^[a-z0-9.-]+$ ]] || fail "DATADOG_SITE inválido"
case "$DATADOG_SITE" in
  api.*|app.*) fail "DATADOG_SITE debe ser el sitio: por ejemplo us5.datadoghq.com o datadoghq.com" ;;
esac
export TP2_CASE="$case_name"
export TP2_RUN_ID="${3:-$(date -u +%Y%m%dt%H%M%Sz)-$case_name-$scenario}"
[[ "$TP2_RUN_ID" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "run-id debe usar minúsculas, números, guiones o guiones bajos"

if [[ "$scenario" == exchange-* ]]; then
  [[ "${TP2_DNI:-}" =~ ^[1-9][0-9]{6,7}$ ]] || fail "Exportá TP2_DNI con un DNI de prueba válido y verificado con ARCA"
  export TP2_DNI
fi

command -v node >/dev/null || fail "Falta Node.js en esta terminal"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 18) ? 0 : 1)' \
  || fail "Artillery requiere Node.js >= 22.18.0"

# En WSL se puede usar la instalación que ya funcionó dentro de /home.
tools_dir="${TP2_PERF_TOOLS:-$script_dir}"
artillery_cli="$tools_dir/node_modules/artillery/bin/run"
[[ -f "$artillery_cli" ]] || fail "Falta Artillery. Instalá con npm ci en perf/ o configurá TP2_PERF_TOOLS con tu carpeta de herramientas"

results_dir="$script_dir/results/$case_name/$TP2_RUN_ID"
mkdir -p -- "$script_dir/results/$case_name"
mkdir -- "$results_dir" || fail "Ya existe la ejecución $TP2_RUN_ID; elegí otro identificador"

# Solo se guardan metadatos públicos. La API key nunca se escribe en el reporte.
{
  printf 'scenario=%s\ncase=%s\nrun=%s\ntarget=%s\ndatadog_site=%s\n' \
    "$scenario" "$case_name" "$TP2_RUN_ID" "$TARGET" "$DATADOG_SITE"
  printf 'node=%s\n' "$(node --version)"
  printf 'artillery=%s\n' "$(node -p 'require(process.argv[1]).version' "$tools_dir/node_modules/artillery/package.json")"
  printf 'git_commit=%s\n' "$(git -C "$repo_dir" rev-parse HEAD)"
  printf 'tracked_changes_begin\n'
  git -C "$repo_dir" diff --name-only HEAD
  printf 'tracked_changes_end\n'
  if [[ "$scenario" == exchange-* ]]; then
    printf 'dni_prueba=%s\nbase_currency=ARS\ncounter_currency=USD\nbase_amount=1000\n' "$TP2_DNI"
  fi
} > "$results_dir/metadata.txt"
cp -- "$script_dir/$scenario.yaml" "$results_dir/scenario.yaml"
cp -- "$script_dir/processor.js" "$results_dir/processor.js"

finish() {
  status=$?
  trap - EXIT
  date -u +'%Y-%m-%dT%H:%M:%SZ' > "$results_dir/fin-utc.txt"
  printf '%s\n' "$status" > "$results_dir/exit-code.txt"
  printf '\nResultados: %s\nCódigo de salida: %s\n' "$results_dir" "$status"
  exit "$status"
}
trap finish EXIT

printf 'Escenario: %s | Caso: %s | Run: %s\n' "$scenario" "$case_name" "$TP2_RUN_ID"
date -u +'%Y-%m-%dT%H:%M:%SZ' > "$results_dir/inicio-utc.txt"
# El DEBUG del publicador puede imprimir credenciales en esta versión.
unset DEBUG
node "$artillery_cli" run "$script_dir/$scenario.yaml" --output "$results_dir/report.json"
