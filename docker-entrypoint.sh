#!/bin/sh
set -e

SECRETS_DST="/app/secrets"

mkdir -p "$SECRETS_DST"

found_any=0

for name in $(env | cut -d= -f1); do
  case "$name" in
    *_FILE|*_FILE_*)
      found_any=1
      value="$(eval echo "\$$name")"

      if [ ! -f "$value" ]; then
        echo "ERROR: Secret file referenced by $name not found: $value" >&2
        exit 1
      fi

      base="$(basename "$value")"
      dst="$SECRETS_DST/$base"

      cp "$value" "$dst"
      chown node:node "$dst"
      chmod 400 "$dst"

      export "$name=$dst"
      ;;
  esac
done

if [ "$found_any" -eq 0 ]; then
  echo "WARN: No *_FILE or *_FILE_<n> environment variables found" >&2
fi

exec su-exec node "$@"
