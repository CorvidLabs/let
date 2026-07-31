#!/usr/bin/env bash
# fledge plugin build hook — install deps and ship bun runner wrappers.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required to build the let plugin (https://bun.sh)" >&2
  exit 1
fi

bun install --frozen-lockfile 2>/dev/null || bun install
mkdir -p bin

# Fledge host entry (JSON-lines protocol)
cat > bin/fledge-let <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
PLUGIN_DIR="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"
if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required to run let (https://bun.sh)" >&2
  exit 1
fi
exec bun run "$PLUGIN_DIR/src/fledge-plugin.ts" "$@"
EOF
chmod +x bin/fledge-let

# Standalone CLI (direct stdout, no fledge protocol)
cat > bin/let <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"
if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required to run let (https://bun.sh)" >&2
  exit 1
fi
exec bun run "$ROOT/src/cli.ts" "$@"
EOF
chmod +x bin/let

echo "built bin/fledge-let (fledge host) and bin/let (standalone)"
