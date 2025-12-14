### MicroBRSoil - Documentação

O **MicroBRSoil** é um sistema **fullstack** para gerenciamento e análise de dados genéticos.
O objetivo do serviço é oferecer uma plataforma centralizada para **armazenamento, processamento e consulta de amostras biológicas de solo**, integrando uma **arquitetura CRUD**, execução de **R pipelines** e **visualização interativa dos dados**.

## Casos de Uso
- **Consulta de dados** armazenados, com filtros simples, busca taxonômica, busca por sequência e localização geográfica (mapa interativo).
- **Download de dados** e arquivos previamente processados.
- **Upload de dados** (FASTQ, BARCODES E Metadados em CSV), com processamento automático em pipelines.
- **Gerenciamento de usuários** com autenticação via JWT e controle de permissões.

## Pipeline de Processamento
- Entrada principal: arquivo **FASTQ**.
- Três pipelines disponíveis: **ILLUMINA 16S**, **ITS** e **Ion Torrent**.
- Resultados: 
  - tabelas de taxonomia (OTU),
  - métricas de diversidade alfa,
  - CSVs e gráficos (incluindo PNG para ITS),
  - demultiplexação no caso do Ion Torrent.