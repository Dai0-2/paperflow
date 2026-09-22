#!/bin/bash
set -euo pipefail

runtime_dir="$HOME/Library/Application Support/PaperFlow AI"
manifest_path="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.paperflow.ai.json"

rm -f "$manifest_path" "$runtime_dir/paperflow-host"
rmdir "$runtime_dir" 2>/dev/null || true

printf 'PaperFlow native host uninstalled.\n'
printf 'API and vault credentials were preserved in macOS Keychain.\n'
