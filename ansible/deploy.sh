#!/bin/bash
set -euo pipefail

DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DIR/.." && pwd)"

if [[ -z "${ARCA_URI:-}" ]]; then
  arca_ip="$(printf '%s\n' 'azurerm_container_group.tp2_container.ip_address' \
    | terraform -chdir="$REPO_DIR" console -no-color | tr -d '\"\r\n')"
  [[ "$arca_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || {
    printf '%s\n' 'No se pudo obtener la IP de ARCA del estado de Terraform' >&2
    exit 1
  }
  export ARCA_URI="http://$arca_ip:8080"
fi
export ARCA_URI
[[ "$ARCA_URI" =~ ^https?://[^[:space:]]+$ ]] || {
  printf '%s\n' 'ARCA_URI debe ser una URL http(s) valida' >&2
  exit 1
}

cd "$DIR"
../node/zip
ansible-playbook -i vmss_hosts --private-key ../key.pem -u azureuser vmss_deploy.yml
