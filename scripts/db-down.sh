#!/bin/bash
set -e

echo "Stopping Secure Bridge database..."
docker compose down

echo "Database stopped."
echo ""
echo "To start again: ./scripts/db-up.sh"
echo ""
echo "Note: Data is preserved in Docker volume 'mongodb_data'."
echo "To completely remove data: docker compose down -v"
