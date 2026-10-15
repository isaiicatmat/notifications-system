#!/bin/sh
# Runs the unit and integration test suites inside Docker against the db service.
set -e
cd "$(dirname "$0")"

[ -f .env.docker ] || cp .env.docker.example .env.docker

docker compose --profile test up --build --abort-on-container-exit --exit-code-from test test