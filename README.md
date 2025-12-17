# MicroBRSoil

Plataforma fullstack para upload, rastreamento e processamento de pipelines de microbioma de solo (Illumina, IonTorrent, ITS).

## Arquitetura (resumo)
- **Frontend**: HTML/CSS/JS servido por nginx (`frontend`).
- **Backend API**: Node.js/Express (`backend-api`) com filas BullMQ/Redis.
- **Worker**: Node + R executando as pipelines (`worker`).
- **Banco**: PostgreSQL.
- **Cache/Fila**: Redis.

## Subir o ambiente (Linux, do zero)
1. Clone e entre no projeto:
   ```bash
   git clone <seu-fork-ou-repo> microbrsoil
   cd microbrsoil
   ```
2. Copie o `.env` de exemplo (já existe na raiz) e ajuste para seu ambiente (DB, portas, senhas, JWT_SECRET, etc.). Não versionar credenciais reais:
   ```bash
   cp .env .env.local
   # edite .env.local com seus valores
   ```
3. Suba os serviços:
   ```bash
   docker compose up -d
   ```
4. Endpoints principais:
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:3000
   - Health API: http://localhost:3000/health

## Autenticação e papéis
- **Guest (não autenticado)**: apenas leitura de páginas públicas; não pode fazer upload nem iniciar pipelines.
- **User**: pode fazer upload/rodar pipelines.
- **Admin**: único que acessa `/register` e cria usuários. Botão "NEW USER" só aparece para admin.
- Rotas de upload/pipeline POST estão protegidas por `requireAuth`. Rotas de criação de usuário e página `/register` usam `requireAdmin`.

## Criar ou promover um admin (Linux, passo a passo bem simples)
Ideia: gerar a senha que você quer, gravar o hash no banco e testar.

1) Gere o hash da senha desejada (ex.: `Admin123!`) dentro do backend:
   ```bash
   docker exec microbrsoil-backend node -e "const bcrypt=require('bcrypt'); const pwd='Admin123!'; console.log(bcrypt.hashSync(pwd,10));"
   ```
   Copie o hash exibido (deve ter 60 caracteres e começar com `$2b$10$`).

2) Salve esse hash para o usuário admin (padrão `admin@microbrsoil.local`):
   ```bash
   docker exec microbrsoil-postgres psql -U micro -d microbrsoil -c "update microbrsoil_db.users set password_hash='$2b$10$SEU_HASH_AQUI' where user_email='admin@microbrsoil.local';"
   ```
   - Substitua `$2b$10$SEU_HASH_AQUI` pelo hash que você copiou.
   - Se quiser outro e-mail, altere em `where user_email='...'`.

   Para criar um admin novo (em vez de atualizar):
   ```bash
   docker exec microbrsoil-postgres psql -U micro -d microbrsoil -c "insert into microbrsoil_db.users (user_email, password_hash, role_id) values ('admin@microbrsoil.local','$2b$10$SEU_HASH_AQUI',1) on conflict (user_email) do nothing;"
   ```

3) Confira se ficou admin (role_id deve ser 1):
   ```bash
   docker exec microbrsoil-postgres psql -U micro -d microbrsoil -c "select user_email, role_id from microbrsoil_db.users where user_email='admin@microbrsoil.local';"
   ```

4) Teste no navegador (use aba anônima se necessário):
   - E-mail: o que você definiu (ex.: `admin@microbrsoil.local`)
   - Senha: a senha em texto puro que usou no passo 1

## Fluxo de upload/pipeline (UI)
- Página: `/upload`.
- Escolha o tipo (Illumina, IonTorrent, ITS) e envie os arquivos pedidos.
- Ao enviar, a UI chama as rotas `/upload/illumina`, `/upload/iontorrent` ou `/upload/its`.
- O backend cria um `runId`, armazena arquivos em `uploads/{runId}` e enfileira o job.
- Acompanhe em `/pipeline-status` via `runId`.

## Rotas e proteção (backend)
- Upload: `POST /upload/illumina`, `POST /upload/iontorrent`, `POST /upload/its` (auth obrigatória).
- Pipeline (legacy enqueue): `POST /pipeline/illumina|its|barcodes` (auth obrigatória).
- Status: `GET /pipeline/status/:runId` (público para leitura).
- Resultados: `GET /pipeline/results/:runId` (público para leitura de status/resultados).
- Página de registro `/register` e API `/auth/register`: apenas admin.

## Diretórios relevantes
- `backend/`: API Express e filas BullMQ.
- `frontend (src/)`: HTML/CSS/JS estático.
- `pipeline-r/`: scripts R das pipelines.
- `uploads/`: arquivos enviados (persistidos via volume).
- `results/`: saídas dos pipelines.

## Dicas de troubleshooting
- Senha recusada: verifique se o hash foi gravado inteiro (60 caracteres) e se o update retornou `UPDATE 1`.
- Ver logs: `docker logs microbrsoil-backend` ou `docker logs microbrsoil-worker`.
- Banco: `docker exec -it microbrsoil-postgres psql -U micro -d microbrsoil`.

## Produção (resumo)
- Ajuste `JWT_SECRET`, senhas e credenciais no `.env`.
- Use volumes persistentes para `db-data`, `uploads`, `results`, `logs`.
- Coloque HTTPS na frente do nginx ou use um proxy reverso com TLS.
