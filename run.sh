#!/usr/bin/env bash
#
# One-step wrapper: points the Node CLI at the Python venv and forwards all args.
#
# Usage:
#   ./run.sh --file ./decks/yours.pptx --dry-run
#   ./run.sh --file ./decks/yours.pptx
#   ./run.sh --file ./decks/yours.pptx --slide 2
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY_DIR="$ROOT/python"
NODE_DIR="$ROOT/node"

# Locate the venv's python (Windows Git Bash uses Scripts/, *nix uses bin/).
if [ -x "$PY_DIR/venv/Scripts/python.exe" ]; then
  VENV_PY="$PY_DIR/venv/Scripts/python.exe"
elif [ -x "$PY_DIR/venv/bin/python" ]; then
  VENV_PY="$PY_DIR/venv/bin/python"
else
  echo "Error: Python venv not found under $PY_DIR/venv" >&2
  echo "Create it first:" >&2
  echo "  cd python && python -m venv venv && venv/Scripts/activate && pip install -r requirements.txt" >&2
  exit 1
fi

if [ ! -d "$NODE_DIR/node_modules" ]; then
  echo "Error: Node dependencies not installed." >&2
  echo "Run: (cd node && npm install)" >&2
  exit 1
fi

# The CLI reads PYTHON_BIN to choose the parser interpreter.
export PYTHON_BIN="$VENV_PY"

cd "$NODE_DIR"
exec node src/cli.js "$@"
