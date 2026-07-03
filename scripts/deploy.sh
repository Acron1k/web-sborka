#!/usr/bin/env bash
# Сборка локально -> доставка образа по SSH -> перезапуск на сервере.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=vps-ru-1
IMAGE=sbory-app:latest

echo "== build =="
docker build --platform linux/amd64 -t "$IMAGE" .

echo "== ship image =="
docker save "$IMAGE" | gzip | ssh "$HOST" 'gunzip | docker load'

echo "== sync configs =="
scp deploy/docker-compose.yml db/schema.sql "$HOST":/opt/sbory/

echo "== restart =="
ssh "$HOST" 'cd /opt/sbory && docker compose up -d && docker image prune -f'

echo "== done =="
ssh "$HOST" 'cd /opt/sbory && docker compose ps'
