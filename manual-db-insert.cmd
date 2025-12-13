@echo off
REM Manual Database Insert - Executa dentro do container Docker
REM Uso: manual-db-insert.cmd [runId] [pipelineType] [userId]
REM      manual-db-insert.cmd --list
REM      manual-db-insert.cmd --check [runId]

docker exec -it microbrsoil-backend node /app/db/scripts/manual-db-insert.js %*
