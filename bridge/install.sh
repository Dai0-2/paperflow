#!/bin/bash
set -euo pipefail

echo "DEPRECATED: this installs the v0.7 Python compatibility host."
echo "New installations should use native-host/install/install-macos.sh."

bridge_dir="$(cd "$(dirname "$0")" && pwd)"
host_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
host_manifest="$host_dir/com.paperflow.ai.json"
runtime_dir="$HOME/Library/Application Support/PaperFlow AI"
runtime_script="$runtime_dir/paperflow_bridge.py"

mkdir -p "$host_dir" "$runtime_dir"
chmod 700 "$runtime_dir"
install -m 755 "$bridge_dir/paperflow_bridge.py" "$runtime_script"

/usr/bin/python3 - "$host_manifest" "$runtime_script" <<'PY'
import json
import sys

manifest_path, bridge_path = sys.argv[1:]
manifest = {
    "name": "com.paperflow.ai",
    "description": "PaperFlow AI local Codex bridge",
    "path": bridge_path,
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://baddhdmpdljpcmnbpfgiegmgkmdbodie/",
        "chrome-extension://pgldggnllkmkigmdiakhjnpicpefkkij/"
    ]
}
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2)
    handle.write("\n")
PY

echo "PaperFlow Bridge installed for Chrome."
echo "Extension ID: baddhdmpdljpcmnbpfgiegmgkmdbodie"
echo "Runtime: $runtime_script"
