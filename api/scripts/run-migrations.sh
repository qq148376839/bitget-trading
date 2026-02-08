#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until node -e "
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
p.query('SELECT 1').then(() => { p.end(); process.exit(0); }).catch(() => { p.end(); process.exit(1); });
" 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done
echo "PostgreSQL is ready."

echo "Running migrations..."
for f in ./migrations/*.sql; do
  echo "  Applying: $f"
  node -e "
    const fs = require('fs');
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: process.env.DATABASE_URL });
    const sql = fs.readFileSync('$f', 'utf8');
    p.query(sql).then(() => { console.log('  Done: $f'); p.end(); }).catch(e => { console.error(e); p.end(); process.exit(1); });
  "
done

echo "Starting API server..."
exec node dist/server.js
