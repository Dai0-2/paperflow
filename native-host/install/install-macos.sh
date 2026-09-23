#!/bin/bash
set -euo pipefail

host_name="com.paperflow.ai"
extension_id="dffiahjmpkmellmjijffpcofoahbccoc"
script_dir="$(cd "$(dirname "$0")" && pwd)"
source_binary="${1:-}"

if [[ -z "$source_binary" ]]; then
  if [[ -x "$script_dir/paperflow-host" ]]; then
    source_binary="$script_dir/paperflow-host"
  else
    source_binary="$script_dir/../target/release/paperflow-host"
  fi
fi

if [[ ! -x "$source_binary" ]]; then
  printf 'PaperFlow native host binary not found: %s\n' "$source_binary" >&2
  printf 'Build it with: cargo build --release --manifest-path native-host/Cargo.toml\n' >&2
  exit 1
fi

runtime_dir="$HOME/Library/Application Support/PaperFlow AI"
runtime_binary="$runtime_dir/paperflow-host"
manifest_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
manifest_path="$manifest_dir/$host_name.json"

mkdir -p "$runtime_dir" "$manifest_dir"
chmod 700 "$runtime_dir"
install -m 755 "$source_binary" "$runtime_binary"

escaped_binary=${runtime_binary//\\/\\\\}
escaped_binary=${escaped_binary//\"/\\\"}
printf '%s\n' \
  '{' \
  "  \"name\": \"$host_name\"," \
  '  "description": "PaperFlow AI secure native host",' \
  "  \"path\": \"$escaped_binary\"," \
  '  "type": "stdio",' \
  '  "allowed_origins": [' \
  "    \"chrome-extension://$extension_id/\"" \
  '  ]' \
  '}' > "$manifest_path"
chmod 600 "$manifest_path"

printf 'PaperFlow native host installed.\n'
printf 'Binary: %s\n' "$runtime_binary"
printf 'Manifest: %s\n' "$manifest_path"
printf 'Reload PaperFlow AI from chrome://extensions.\n'
