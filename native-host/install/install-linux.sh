#!/bin/sh
set -eu

host_name="com.paperflow.ai"
extension_id="dffiahjmpkmellmjijffpcofoahbccoc"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
native_host_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
source_binary=${1:-}

if [ -z "$source_binary" ]; then
  if [ -x "$script_dir/paperflow-host" ]; then
    source_binary="$script_dir/paperflow-host"
  else
    source_binary="$native_host_dir/target/release/paperflow-host"
    if [ ! -x "$source_binary" ]; then
      if ! command -v cargo >/dev/null 2>&1; then
        printf '%s\n' \
          'PaperFlow Native Host is needed only for ChatGPT/Codex subscription mode.' \
          'OpenAI-compatible API mode does not need Cargo or the Native Host.' \
          '' \
          'To use ChatGPT/Codex, install Rust from https://rustup.rs/,' \
          'restart the terminal, verify "cargo --version", then run this installer again.' >&2
        exit 1
      fi
      printf 'Building the PaperFlow Native Host...\n'
      cargo build --release --locked --manifest-path "$native_host_dir/Cargo.toml"
    fi
  fi
fi

if [ ! -x "$source_binary" ]; then
  printf 'PaperFlow native host binary not found: %s\n' "$source_binary" >&2
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
