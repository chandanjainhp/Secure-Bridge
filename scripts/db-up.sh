#!/bin/bash
set -e

echo "Starting Secure Bridge database..."
docker compose up -d mongodb

echo "Waiting for MongoDB to be ready..."
sleep 5

echo "Checking MongoDB health..."
docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"

echo ""
echo "MongoDB is running at: mongodb://localhost:27017/Secure-Bridge"
echo "Database name: Secure-Bridge"
echo ""
echo "To start backend:"
echo "  cd server && npm run dev"
echo ""
echo "To view database UI (optional):"
echo "  docker compose --profile tools up -d mongo-express"
echo "  Then open: http://localhost:8081"
echo ""
echo "To stop database:"
echo "  ./scripts/db-down.sh"
