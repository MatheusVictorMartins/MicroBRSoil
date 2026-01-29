# MicroBRSoil Docker

MicroBRSoil is a full-stack platform to upload sequencing files, run microbiome pipelines (Illumina, IonTorrent, ITS), and browse results.

## Architecture
- frontend: nginx serving static HTML/CSS/JS
- backend-api: Node.js/Express API + BullMQ + Redis
- worker: Node + R pipelines
- postgres: metadata/results storage
- redis: queue/cache

## Requirements
- Docker Desktop (Windows/macOS) or Docker Engine + Docker Compose v2
- 4 GB RAM minimum (8+ recommended for R pipelines)
- 10 GB free disk minimum (20+ recommended)
- Windows: WSL2 enabled

## Quick start (Docker)

### 1) Clone
```bash
git clone <repo-url> microbrsoil
cd microbrsoil
```

### 2) Configure environment
This project uses `.env` for Docker Compose. You can edit it directly or create a local override file.

Option A (edit .env):
```powershell
notepad .env
```
macOS (TextEdit):
```bash
open -e .env
```
Linux (terminal editor):
```bash
nano .env
```

Option B (.env.local):
```powershell
Copy-Item .env .env.local
```
```bash
cp .env .env.local
```

Important:
- JWT_SECRET must be at least 16 characters.
- If you want admins to view saved passwords later, set a stable PASSWORD_VIEW_SECRET (optional). If you do not set it, JWT_SECRET is used.

If you use .env.local, start Docker Compose with:
```bash
docker compose --env-file .env.local up -d --build
```

### 3) Build and start
```bash
docker compose build
docker compose up -d
```

First build can take several minutes because the worker installs R packages.

### 4) Verify
```bash
docker compose ps
```

Open:
- Frontend: http://localhost:8080
- Backend health: http://localhost:3000/health

## Create the first admin user
There is no default admin account. Create one manually in the database.

### Linux/macOS
1) Generate a bcrypt hash:
```bash
docker exec microbrsoil-backend node -e "const bcrypt=require('bcrypt'); const pwd='ChangeMe123!'; console.log(bcrypt.hashSync(pwd,10));"
```

2) Insert or update the admin user:
```bash
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c "INSERT INTO microbrsoil_db.users (user_email, password_hash, role_id) VALUES ('admin@microbrsoil.local', 'PASTE_HASH_HERE', (SELECT role_id FROM microbrsoil_db.roles WHERE role_name='admin')) ON CONFLICT (user_email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role_id = EXCLUDED.role_id;"
```

### Windows PowerShell
PowerShell expands `$`. Use single quotes and `$$`.

1) Generate a bcrypt hash:
```powershell
docker exec microbrsoil-backend node -e "const bcrypt=require('bcrypt'); const pwd='ChangeMe123!'; console.log(bcrypt.hashSync(pwd,10));"
```

2) Insert or update the admin user:
```powershell
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c 'INSERT INTO microbrsoil_db.users (user_email, password_hash, role_id) VALUES ($$admin@microbrsoil.local$$, $$PASTE_HASH_HERE$$, (SELECT role_id FROM microbrsoil_db.roles WHERE role_name=$$admin$$)) ON CONFLICT (user_email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role_id = EXCLUDED.role_id;'
```

Then log in at http://localhost:8080/login

## Create users
- Log in as admin.
- Go to http://localhost:8080/register and create users.

## Change user email or password (after creation)
- Password: admin can change a non-admin user's password from the Users table on http://localhost:8080/register.
- Email: there is no UI for email changes yet. Use one of these options:
  - Delete the user in the Users table and create a new one with the new email, or
  - Update directly in the database (example):

Linux/macOS:
```bash
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c "UPDATE microbrsoil_db.users SET user_email = 'new@email.com' WHERE user_id = 123;"
```

Windows PowerShell:
```powershell
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c 'UPDATE microbrsoil_db.users SET user_email = $$new@email.com$$ WHERE user_id = 123;'
```

Avoid changing admin or system users by email.

### Admin password change (no UI)
The UI does not allow changing the admin password. Use the database instead.

1) Generate a bcrypt hash for the new password:
```bash
docker exec microbrsoil-backend node -e "const bcrypt=require('bcrypt'); const pwd='NewAdminPass123!'; console.log(bcrypt.hashSync(pwd,10));"
```

2) Update the admin password hash and clear password_view (so it refreshes on next login):

Linux/macOS:
```bash
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c "UPDATE microbrsoil_db.users SET password_hash = 'PASTE_HASH_HERE', password_view = NULL WHERE user_email = 'admin@microbrsoil.local';"
```

Windows PowerShell:
```powershell
docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil -c 'UPDATE microbrsoil_db.users SET password_hash = $$PASTE_HASH_HERE$$, password_view = NULL WHERE user_email = $$admin@microbrsoil.local$$;'
```

3) Log in once with the new password so the UI shows it.

## Using the pipelines
- Upload page: http://localhost:8080/upload
- Pipeline status: http://localhost:8080/pipeline-status
- Sample details: http://localhost:8080/individual_page?soilId=<id>

## Worker options
You can change the worker Dockerfile in `.env`:
- Dockerfile.worker (default)
- Dockerfile.worker.rocker
- Dockerfile.worker.optimized

Example:
```env
WORKER_DOCKERFILE=Dockerfile.worker.optimized
```

Rebuild after changing:
```bash
docker compose build worker
```

## Data directories
These folders are bind-mounted into containers:
- uploads/  - raw upload files
- results/  - pipeline outputs
- logs/     - backend/worker logs

## Stop and reset
```bash
docker compose down
docker compose build
docker compose up -d
```

Reset everything (including database):
```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

Optional: delete uploads/, results/, logs/ if you want a clean workspace.

## Migrations (when upgrading)
If you are upgrading an existing database, apply migrations:

Linux/macOS:
```bash
docker exec -i microbrsoil-postgres psql -U micro -d microbrsoil < db/migrations/add_idempotency_constraints.sql
```

Windows PowerShell:
```powershell
Get-Content db/migrations/add_idempotency_constraints.sql -Raw | docker exec -i microbrsoil-postgres psql -U micro -d microbrsoil
```

## Troubleshooting
- JWT_SECRET error: set JWT_SECRET to 16+ characters and restart.
- Port already in use: change BACKEND_PORT or FRONTEND_PORT in .env.
- Pipeline builds take long: first worker build installs R packages. This is normal.
- Check logs:
```bash
docker logs microbrsoil-backend
docker logs microbrsoil-worker
```
