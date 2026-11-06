#!/usr/bin/env bash
# Applies the real migration to a throwaway Postgres (on thin Supabase stubs)
# and asserts the row-level security rules and notification triggers.
#
#   supabase/tests/run.sh
#
# Needs Docker running. Every line should say "pass"; a failure exits non-zero.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CONTAINER=viom-pgtest

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
elif [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != "true" ]; then
  docker start "$CONTAINER" >/dev/null
fi

until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

# pg_net only exists on hosted Supabase; the stubs provide a recording fake.
sed '/create extension if not exists pg_net;/d' \
  "$ROOT/supabase/migrations/0001_init.sql" > "$HERE/.migration.sql"
cp "$ROOT/supabase/migrations/0002_notifications.sql" "$HERE/.migration2.sql"
cp "$ROOT/supabase/migrations/0003_tenant_review.sql" "$HERE/.migration3.sql"

docker exec "$CONTAINER" psql -U postgres -q \
  -c 'drop database if exists t' -c 'create database t' >/dev/null

status=0
for f in 00_stubs .migration .migration2 .migration3 01_seed 02_rls; do
  docker cp "$HERE/$f.sql" "$CONTAINER:/tmp/" >/dev/null
  if out=$(docker exec "$CONTAINER" psql -U postgres -d t -q -t -v ON_ERROR_STOP=1 \
           -f "/tmp/$f.sql" 2>&1); then :; else status=1; fi
  echo "$out" | grep -E "pass|FAIL|ERROR" | sed 's/^psql:[^ ]* //;s/NOTICE:  //' || true
done

rm -f "$HERE/.migration.sql" "$HERE/.migration2.sql" "$HERE/.migration3.sql"
echo
if [ "$status" -eq 0 ]; then echo "All checks passed."; else echo "FAILURES — see above."; fi
exit "$status"
