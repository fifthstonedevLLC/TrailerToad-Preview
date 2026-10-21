#!/bin/sh
# Runs from /docker-entrypoint.d before nginx starts: launch the quote API in the background
# as the unprivileged nginx user, restarting it if it ever exits.
(
  while true; do
    su -s /bin/sh nginx -c "node /opt/api/server.mjs"
    echo "trailertoad-api exited; restarting in 2s" >&2
    sleep 2
  done
) &
