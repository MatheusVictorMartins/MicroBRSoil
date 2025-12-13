#!/bin/bash
# Manual Database Insert - Executa dentro do container Docker
# Uso: ./manual-db-insert.sh [runId] [pipelineType] [userId]
#      ./manual-db-insert.sh --list
#      ./manual-db-insert.sh --check [runId]

docker exec -it microbrsoil-backend node /app/db/scripts/manual-db-insert.js "$@"
