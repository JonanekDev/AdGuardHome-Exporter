#!/bin/sh
set -e

SECRETS_DST="/app/secrets"

mkdir -p "$SECRETS_DST"

for name in $(env | cut -d= -f1); do
  case "$name" in
    ADGUARD_*_FILE_*)
      value="$(eval echo "\$$name")"

      if [ ! -f "$value" ]; then
        echo "ERROR: Secret file referenced by $name not found: $value" >&2
        exit 1
      fi

      # Named after the variable: secret files from different directories may share a name.
      dst="$SECRETS_DST/$name"

      cp "$value" "$dst"
      chown node:node "$dst"
      chmod 400 "$dst"

      export "$name=$dst"
      ;;
  esac
done

exec su-exec node "$@"
