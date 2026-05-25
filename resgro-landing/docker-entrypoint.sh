#!/bin/sh
set -eu

if [ -z "${DJANGO_BACKEND_URL:-}" ]; then
  echo "Warning: DJANGO_BACKEND_URL unset — copying static nginx config (no /admin proxy)"
  cp /etc/nginx/nginx.conf.static /etc/nginx/conf.d/default.conf
else
  export DJANGO_BACKEND_URL="${DJANGO_BACKEND_URL%/}"
  export DJANGO_BACKEND_HOST="${DJANGO_BACKEND_HOST:-$(echo "$DJANGO_BACKEND_URL" | sed -E 's|https?://||; s|/.*||')}"
  envsubst '${DJANGO_BACKEND_URL} ${DJANGO_BACKEND_HOST}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
