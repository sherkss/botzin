#!/bin/bash
# Applies database/schema.sql to both botzin and botzin_test.
# Runs during container first-start (initdb.d), after 01-databases.sql.
set -euo pipefail

MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql -uroot botzin      < /docker-schema.sql
MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql -uroot botzin_test < /docker-schema.sql

echo "[botzin] Schema applied to botzin and botzin_test."
