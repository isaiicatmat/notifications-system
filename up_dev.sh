#!/bin/sh
# Builds and starts db, migrations, api and worker. Press Ctrl+C to stop everything.
set -e
cd "$(dirname "$0")"

[ -f .env.docker ] || cp .env.docker.example .env.docker

docker compose up --build --force-recreate