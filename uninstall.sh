#!/usr/bin/env bash
# Entfernt die Ansicht "bootstrap" wieder aus dem Smart-Home-Dashboard.
#   sudo ./uninstall.sh [Ordner des Dashboards]
set -euo pipefail
ZIEL="${1:-/etc/openhab/html/dashboard}"
rm -rf "$ZIEL/bootstrap"
echo "Ansicht bootstrap entfernt."
