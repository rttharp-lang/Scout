#!/usr/bin/env bash
# Runs supabase/tests/mood_rls_test.sql against a throwaway database on a local
# Postgres (needs psql + a server you can connect to as a superuser, e.g.
# PGUSER=postgres). Usage: scripts/mood-rls-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="mood_rls_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
psql -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/mood_rls_test.sql 2>&1 | sed -e "s/^psql:[^ ]* NOTICE:  //" -e "/^$/d"
