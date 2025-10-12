# Arquitetura do MicroBRSoil

## Visão Geral

O MicroBRSoil é uma plataforma abrangente de bioinformática para análise de microbioma do solo, projetada com uma arquitetura de microsserviços containerizada usando Docker. O sistema suporta múltiplas tecnologias de sequenciamento (Illumina, Ion Torrent, ITS) e oferece pipelines especializados para análise de dados de sequenciamento de DNA/RNA.

## Componentes da Arquitetura

### 1. Frontend (Interface Web)
- **Tecnologia**: HTML, CSS, JavaScript estático
- **Servidor**: Nginx (alpine)
- **Porta**: 8080 (padrão)
- **Função**: Interface web para upload de arquivos e visualização de resultados
- **Localização**: `./src/` montado em `/usr/share/nginx/html`

### 2. Backend API
- **Tecnologia**: Node.js com Express
- **Porta**: 3000 (padrão)
- **Container**: `microbrsoil-backend`
- **Função**: 
  - API REST para upload de arquivos
  - Gerenciamento de jobs e filas
  - Autenticação e autorização
  - Interface com banco de dados

**Principais Endpoints:**
- `POST /upload/illumina` - Upload para pipeline Illumina/16S rRNA
- `POST /upload/iontorrent` - Upload para pipeline Ion Torrent
- `POST /upload/its` - Upload para pipeline ITS (fungos)
- `/auth/*` - Endpoints de autenticação

### 3. Worker (Processador de Pipeline)
- **Tecnologia**: Node.js + R (rocker/r-ver:4.3.2)
- **Container**: `microbrsoil-worker`
- **Função**: 
  - Execução de pipelines bioinformáticos em background
  - Processamento de dados FASTQ
  - Integração com scripts R especializados
  - Geração de resultados de análise

**Scripts R Principais:**
- `pipeline_wrapper.R` - Wrapper principal do pipeline
- `check_system_deps.R` - Verificação de dependências
- `verify_r_packages.R` - Verificação de pacotes R

### 4. Banco de Dados
- **Tecnologia**: PostgreSQL 16 (alpine)
- **Container**: `microbrsoil-postgres`
- **Porta**: 5432
- **Função**: 
  - Armazenamento de metadados de uploads
  - Histórico de jobs e resultados
  - Dados de usuários e autenticação

**Configuração:**
- Volume persistente: `db-data`
- Scripts de inicialização: `./db/`
- Health check configurado

### 5. Sistema de Filas
- **Tecnologia**: Redis 7 (alpine)
- **Container**: `microbrsoil-redis`
- **Porta**: 6379
- **Função**: 
  - Gerenciamento de filas com BullMQ
  - Cache de sessões
  - Comunicação entre backend e worker

### 6. Proxy Reverso
- **Tecnologia**: Nginx
- **Função**:
  - Roteamento de requests
  - Balanceamento de carga
  - Proxy para backend API
  - Servir arquivos estáticos

## Fluxo de Dados

### 1. Upload e Processamento
```
Frontend → Nginx → Backend API → Redis Queue → Worker → Pipeline R → Resultados
```

1. **Upload**: Usuário faz upload via interface web
2. **API**: Backend valida e armazena arquivos em `./uploads/{upload-id}/`
3. **Queue**: Job é adicionado à fila Redis via BullMQ
4. **Worker**: Processa o job executando pipeline R apropriado
5. **Resultados**: Salvos em `./results/{upload-id}/`
6. **Database**: Metadados atualizados no PostgreSQL

### 2. Estrutura de Diretórios
```
uploads/
├── {upload-id}/
│   ├── sample1.fastq
│   ├── sample2.fastq
│   └── metadata.csv

results/
├── {upload-id}/
│   ├── otu_table.csv
│   ├── taxonomy_table.csv
│   ├── alpha_diversity_metrics.csv
│   └── pipeline_output.log
```

## Pipelines Suportados

### 1. Pipeline Illumina
- **Tecnologia**: Sequenciamento Illumina 16S rRNA
- **Entrada**: Arquivos FASTQ
- **Saída**: Tabelas OTU, taxonomia, métricas de diversidade

### 2. Pipeline Ion Torrent
- **Tecnologia**: Sequenciamento Ion Torrent
- **Entrada**: Arquivos FASTQ
- **Parâmetros**: Otimizados para tecnologia Ion Torrent

### 3. Pipeline ITS
- **Tecnologia**: Análise de comunidades fúngicas (Internal Transcribed Spacer)
- **Entrada**: Arquivos FASTQ
- **Foco**: Identificação e análise de fungos

## Configuração de Rede

### Network: `backnet`
- **Driver**: Bridge
- **Função**: Comunicação interna entre containers

### Conectividade:
- Frontend (8080) ↔ Backend (3000)
- Backend ↔ PostgreSQL (5432)
- Backend ↔ Redis (6379)
- Worker ↔ PostgreSQL (5432)
- Worker ↔ Redis (6379)

## Volumes Persistentes

### 1. Dados de Aplicação
- `./uploads` → `/app/uploads` - Arquivos de entrada
- `./results` → `/app/results` - Resultados processados
- `./logs` → `/app/logs` - Logs da aplicação

### 2. Dados do Sistema
- `db-data` - Dados do PostgreSQL
- `redis-data` - Dados do Redis  
- `r-packages` - Pacotes R instalados

### 3. Código e Configuração
- `./pipeline-r` → `/app/pipeline-r` (read-only) - Scripts R
- `./db` → `/app/db` (read-only) - Scripts de banco
- `./nginx/default.conf` → `/etc/nginx/conf.d/default.conf` - Config Nginx

## Segurança e Autenticação

### 1. Autenticação
- **Método**: JWT (JSON Web Tokens)
- **Endpoints**: `/auth/*`
- **Secret**: Configurável via `JWT_SECRET`

### 2. Isolamento
- **Containers**: Isolamento por container
- **Network**: Rede interna isolada
- **Volumes**: Separação de dados sensíveis

### 3. Validação
- **Uploads**: Validação de tipos de arquivo
- **Input**: Sanitização de entrada
- **Size Limits**: Limite de 2GB por upload

## Monitoramento e Logs

### 1. Logs Estruturados
- **API**: `./logs/api-*.log`
- **Database**: `./logs/database-*.log` 
- **Worker**: `./logs/worker-*.log`

### 2. Health Checks
- **PostgreSQL**: `pg_isready` check
- **Redis**: Service startup check
- **API**: Dependency checks

### 3. Métricas
- **Queue**: Status de jobs via BullMQ
- **Database**: Conexões e performance
- **Storage**: Uso de disco para uploads/results

## Escalabilidade

### 1. Horizontal
- **Workers**: Múltiplas instâncias do worker para processamento paralelo
- **API**: Load balancer via Nginx
- **Database**: Read replicas (futuro)

### 2. Vertical
- **Resources**: CPU/Memory configuráveis por container
- **Storage**: Volumes expansíveis
- **Cache**: Redis para performance

## Tecnologias e Dependências

### Backend (Node.js)
- **Express**: Framework web
- **BullMQ**: Sistema de filas
- **PostgreSQL**: Driver de banco (`pg`)
- **R Integration**: Interface Node.js-R
- **Multer**: Upload de arquivos
- **JWT**: Autenticação

### Pipeline (R)
- **Base**: rocker/r-ver:4.3.2
- **Bioinformática**: Pacotes especializados para análise de microbioma
- **Sistema**: Dependências Linux para compilação

### Infraestrutura
- **Docker**: Containerização
- **Docker Compose**: Orquestração
- **Nginx**: Proxy reverso e servidor web
- **PostgreSQL**: Banco de dados relacional
- **Redis**: Cache e filas

## Deployment

### 1. Desenvolvimento
```bash
# Configurar variáveis de ambiente
cp .env.example .env

# Construir e iniciar serviços
docker-compose up --build
```

### 2. Produção
```bash
# Build otimizado
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Monitoramento
docker-compose logs -f
```

### 3. Configuração
- **Environment**: Variáveis em `.env`
- **Database**: Scripts de inicialização em `./db/`
- **R Packages**: Instalação automática via scripts

## Considerações de Performance

### 1. I/O
- **Uploads**: Processamento assíncrono
- **Results**: Cache em filesystem
- **Database**: Conexões pooled

### 2. Processamento
- **Queue**: Jobs em background
- **R Scripts**: Otimizados para grandes datasets
- **Memory**: Limite configurável por container

### 3. Network
- **Internal**: Comunicação via bridge network
- **External**: Rate limiting via Nginx
- **Caching**: Redis para sessões e cache