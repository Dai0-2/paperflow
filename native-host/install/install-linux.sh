#!/bin/sh
set -eu

host_name="com.paperflow.ai"
extension_id="baddhdmpdljpcmnbpfgiegmgkmdbodie"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_binary=${1:-}

if [ -z "$source_binary" ]; then
  if [ -x "$script_dir/paperflow-host" ]; then
    source_binary="$script_dir/paperflow-host"
  else
    source_binary="$script_dir/../target/release/paperflow-host"
  fi
fi

if [ ! -x "$source_binary" ]; then
  printf 'PaperFlow native host binary not found: %s\n' "$source_binary" >&2
  printf 'Build it with: cargo build --release --manifest-path native-host/Cargo.toml\n' >&2
  exit 1
fi

runtime_dir="${XDG_DATA_HOME:-$HOME/.local/share}/paperflow-ai"
runtime_binary="$runtime_dir/paperflow-host"
manifest_dir="${XDG_CONFIG_HOME:-$HOME/.config}/google-chrome/NativeMessagingHosts"
manifest_path="$manifest_dir/$host_name.json"

mkdir -p "$runtime_dir" "$manifest_dir"
chmod 700 "$runtime_dir"
install -m 755 "$source_binary" "$runtime_binary"

escaped_binary=$(printf '%s' "$runtime_binary" | sed 's/\\/\\\\/g; s/"/\\"/g')
{
  printf '%s\n' '{'
  printf '  "name": "%s",\n' "$host_name"
  printf '%s\n' '  "description": "PaperFlow AI secure native host",'
  printf '  "path": "%s",\n' "$escaped_binary"
  printf '%s\n' '  "type": "stdio",'
  printf '%s\n' '  "allowed_origins": ['
  printf '    "chrome-extension://%s/"\n' "$extension_id"
  printf '%s\n' '  ]'
  printf '%s\n' '}'
} > "$manifest_path"
chmod 600 "$manifest_path"

printf 'PaperFlow native host installed.\n'
printf 'Binary: %s\n' "$runtime_binary"
printf 'Manifest: %s\n' "$manifest_path"
printf 'A running Secret Service is required for persistent credentials.\n'
