#!/usr/bin/env bash
set -euo pipefail

# clear_supabase_data.sh
#
# Safely truncate all tables in the public schema of a Postgres database (Supabase)
# while preserving table definitions, functions, and other schema objects.
#
# Usage:
#   ./scripts/clear_supabase_data.sh <DATABASE_URL>
#
# Example:
#   ./scripts/clear_supabase_data.sh "postgres://user:pass@db.host:5432/postgres"
#
# Requirements:
# - psql must be installed and available on PATH
# - The provided connection string must have permission to TRUNCATE tables
#
# Warning: This is destructive for data (deletes all rows). It will not drop tables.
# You must type CONFIRM when prompted to proceed.

if [ "$#" -lt 1 ]; then
  echo "Error: DATABASE_URL is required as the first argument."
  echo "Usage: $0 <DATABASE_URL>"
  exit 2
fi

DATABASE_URL="$1"

echo "This will TRUNCATE all tables in the public schema of the database you provided."
echo "Tables (schema objects) will be kept; all rows will be deleted and sequences restarted."
echo "If you understand and want to proceed, type exactly: CONFIRM"
read -r CONFIRMATION

if [ "$CONFIRMATION" != "CONFIRM" ]; then
  echo "Aborted by user. No changes made."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql not found on PATH. Please install PostgreSQL client tools."
  exit 3
fi

echo "Gathering list of tables in public schema..."

SQL_LIST=$(psql "$DATABASE_URL" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public';")

if [ -z "$SQL_LIST" ]; then
  echo "No tables found in public schema or unable to connect."
  exit 4
fi

TRUNCATE_CMD=""
IFS=$'\n'
for t in $SQL_LIST; do
  # skip if empty
  if [ -n "$t" ]; then
	if [ -z "$TRUNCATE_CMD" ]; then
	  TRUNCATE_CMD="TRUNCATE \"$t\""
	else
	  TRUNCATE_CMD+=", \"$t\""
	fi
  fi
done
unset IFS

FULL_SQL="$TRUNCATE_CMD RESTART IDENTITY CASCADE;"

echo "The following SQL will be executed against the provided database:"
echo
echo "$FULL_SQL"
echo
read -p "Proceed to execute the above truncate statement? (y/N) " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted by user. No changes made."
  exit 0
fi

echo "Executing truncate..."
psql "$DATABASE_URL" -c "$FULL_SQL"

echo "Done. All data in public schema truncated, sequences restarted."
