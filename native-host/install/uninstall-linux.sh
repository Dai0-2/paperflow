#!/bin/sh
set -eu

runtime_dir="${XDG_DATA_HOME:-$HOME/.local/share}/paperflow-ai"
manifest_path="${XDG_CONFIG_HOME:-$HOME/.config}/google-chrome/NativeMessagingHosts/com.paperflow.ai.json"

rm -f "$manifest_path" "$runtime_dir/paperflow-host"
rmdir "$runtime_dir" 2>/dev/null || true

printf 'PaperFlow native host uninstalled.\n'
printf 'API and vault credentials were preserved in Secret Service.\n'
