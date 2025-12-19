# MicroBRSoil

Fullstack platform for upload, tracking, and processing of soil microbiome pipelines (Illumina, IonTorrent, ITS).

## Architecture (summary)
- Frontend: static HTML/CSS/JS served by nginx (`frontend`).
- Backend API: Node.js/Express (`backend-api`) with BullMQ/Redis queues.
- Worker: Node + R pipelines (`worker`).
- Database: PostgreSQL.
- Cache/Queue: Redis.

## Start from scratch (Linux)
1) Clone and enter the project:
```bash
git clone <your-fork-or-repo> microbrsoil
cd microbrsoil
```

2) Copy `.env` and adjust values (DB, ports, JWT_SECRET, etc). Do not commit real secrets:
```bash
cp .env .env.local
# edit .env.local
```

3) Start services:
```bash
docker compose up -d
```

4) Main endpoints:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000
- Health API: http://localhost:3000/health

## Start from scratch (Windows / PowerShell)
1) Clone and enter the project:
```powershell
git clone <your-fork-or-repo> microbrsoil
cd microbrsoil
```

2) Copy `.env` and adjust values (DB, ports, JWT_SECRET, etc). Do not commit real secrets:
```powershell
Copy-Item .env .env.local
# edit .env.local
```

3) Start services:
```powershell
docker compose up -d
```

4) Main endpoints:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000
- Health API: http://localhost:3000/health

## Authentication and roles
- Guest (not authenticated): read-only pages and public GET endpoints.
- User: can upload and run pipelines.
- Admin: can access `/register` and create users. "NEW USER" is visible only for admins.
- Upload/pipeline POST routes use `requireAuth`. User creation and `/register` use `requireAdmin`.

## Create or promote admin (Linux)
Goal: generate a password hash and store it in the DB.

1) Generate a bcrypt hash (example password: `MinhaSenha123!`):
```bash
docker exec microbrsoil-backend node -e "const bcrypt=require('bcrypt'); const pwd='MinhaSenha123!'; console.log(bcrypt.hashSync(pwd,10));"
```
Copy the hash (60 chars, starts with `$2b$10$`).

2) Save the hash for the admin user (default: `admin@microbrsoil.local`):
```bash
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c "update microbrsoil_db.users set password_hash=\$\$COLE_SEU_HASH_AQUI\$\$, role_id=1 where user_email=\$\$admin@microbrsoil.local\$\$;"
```

3) Confirm the hash length is 60:
```bash
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c "select user_email, length(password_hash), password_hash from microbrsoil_db.users where user_email='admin@microbrsoil.local';"
```

4) Login in the browser:
- Email: `admin@microbrsoil.local`
- Password: the plain password used in step 1

## Create or promote admin (Windows / PowerShell)
PowerShell expands `$`, so use single quotes and `$$`.

1) Generate a bcrypt hash (example password: `MinhaSenha123!`):
```powershell
docker exec microbrsoil-backend node -e "const bcrypt=require('bcrypt'); const pwd='MinhaSenha123!'; console.log(bcrypt.hashSync(pwd,10));"
```
Copy the hash (60 chars, starts with `$2b$10$`).

2) Save the hash for the admin user (default: `admin@microbrsoil.local`):
```powershell
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c 'update microbrsoil_db.users set password_hash=$$COLE_SEU_HASH_AQUI$$, role_id=1 where user_email=$$admin@microbrsoil.local$$;'
```

3) Confirm the hash length is 60:
```powershell
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c "select user_email, length(password_hash), password_hash from microbrsoil_db.users where user_email='admin@microbrsoil.local';"
```

4) Login in the browser:
- Email: `admin@microbrsoil.local`
- Password: the plain password used in step 1

## Upload and pipeline flow (UI)
- Page: `/upload`.
- Choose the pipeline type (Illumina, IonTorrent, ITS) and upload files.
- UI calls `/upload/illumina`, `/upload/iontorrent`, or `/upload/its`.
- Backend creates a `runId`, stores files in `uploads/{runId}`, and queues a job.
- Track it at `/pipeline-status` with the `runId`.

## Protected routes (backend)
- Upload: `POST /upload/illumina`, `POST /upload/iontorrent`, `POST /upload/its` (auth required).
- Pipeline enqueue: `POST /pipeline/illumina|its|barcodes` (auth required).
- Status: `GET /pipeline/status/:runId` (public read).
- Results: `GET /pipeline/results/:runId` (public read).
- `/register` page and `POST /auth/register`: admin only.

## Useful directories
- `backend/`: Express API and BullMQ queues.
- `src/`: static HTML/CSS/JS.
- `pipeline-r/`: R scripts.
- `uploads/`: uploaded files (volume).
- `results/`: pipeline outputs (volume).

## Troubleshooting
- "Senha incorreta": hash saved wrong. Ensure hash length is 60 and update returned `UPDATE 1`.
- Logs: `docker logs microbrsoil-backend` or `docker logs microbrsoil-worker`.
- DB shell: `docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil`.

### Windows / PowerShell: "senha incorreta"
This usually happens because PowerShell expands `$` and breaks the hash. Use `$$` and single quotes:

1) Generate a new hash (replace the password):
```powershell
docker exec microbrsoil-backend node -e "const bcrypt=require('bcrypt'); const pwd='MinhaSenha123!'; console.log(bcrypt.hashSync(pwd,10));"
```
Copy the full hash (starts with `$2b$10$`).

2) Save the hash using single quotes and `$$`:
```powershell
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c 'update microbrsoil_db.users set password_hash=$$COLE_SEU_HASH_AQUI$$, role_id=1 where user_email=$$admin@microbrsoil.local$$;'
```

3) Confirm the hash length is 60:
```powershell
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c "select user_email, length(password_hash), password_hash from microbrsoil_db.users where user_email='admin@microbrsoil.local';"
```

4) Login with:
- Email: `admin@microbrsoil.local`
- Password: the plain password used in step 1

## Production notes
- Set strong `JWT_SECRET`, DB credentials, and restrict access to `.env` files.
- Use persistent volumes for `db-data`, `uploads`, `results`, `logs`.
- Put HTTPS in front of nginx (reverse proxy with TLS).
