run_dada2_pipeline <- function(path1, path2) {
  # Carregar pacotes necessários
  library(dada2)
  library(phyloseq)
  library(ggplot2)
  library(vegan)
  library(microbiome)

  # Diretório base onde estão os arquivos FASTQ
  path <- dirname(path1)
  fnFs <- sort(list.files(path, pattern = "_R1_001.fastq.gz", full.names = TRUE))
  fnRs <- sort(list.files(path, pattern = "_R2_001.fastq.gz", full.names = TRUE))
  sample.names <- sapply(strsplit(basename(fnFs), "_"), `[`, 1)

  # Diretório raiz de resultados
  result_path <- file.path(getwd(), "resultados")
  dir.create(result_path, showWarnings = FALSE)

  # Subpasta de arquivos filtrados
  filt_path <- file.path(result_path, "filtered")
  dir.create(filt_path, showWarnings = FALSE)
  filtFs <- file.path(filt_path, paste0(sample.names, "_F_filt.fastq.gz"))
  filtRs <- file.path(filt_path, paste0(sample.names, "_R_filt.fastq.gz"))

  # Filtro e trimagem
  out <- filterAndTrim(fnFs, filtFs, fnRs, filtRs,
                       truncLen = c(240, 160),
                       maxN = 0, maxEE = c(2, 2), truncQ = 2,
                       rm.phix = TRUE, compress = TRUE, multithread = TRUE)

  # Aprendizado de erro
  errF <- learnErrors(filtFs, multithread = TRUE)
  errR <- learnErrors(filtRs, multithread = TRUE)

  # Inferência
  derepFs <- derepFastq(filtFs, verbose = TRUE)
  derepRs <- derepFastq(filtRs, verbose = TRUE)
  names(derepFs) <- sample.names
  names(derepRs) <- sample.names
  dadaFs <- dada(derepFs, err = errF, multithread = TRUE)
  dadaRs <- dada(derepRs, err = errR, multithread = TRUE)

  # Mesclagem
  mergers <- mergePairs(dadaFs, derepFs, dadaRs, derepRs, verbose = TRUE)

  # Tabela de sequência
  seqtab <- makeSequenceTable(mergers)
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = TRUE)

  # Atribuição taxonômica
  taxa <- assignTaxonomy(seqtab.nochim, path2, multithread = TRUE)

  # Criar phyloseq
  seqtab.nochim <- as.matrix(seqtab.nochim)
  taxa <- as.matrix(taxa)
  samples <- data.frame(sample = sample.names, row.names = sample.names)
  ps <- phyloseq(
    otu_table(seqtab.nochim, taxa_are_rows = FALSE),
    tax_table(taxa),
    sample_data(samples)
  )

  # Salvar objeto phyloseq
  saveRDS(ps, file = file.path(result_path, "phyloseq_object.rds"))

  # Diversidade alfa
  alpha_div <- estimate_richness(ps, measures = c("Observed", "Shannon", "Simpson"))
  alpha_div$Chao1 <- estimate_richness(ps, measures = "Chao1")[, 1]
  alpha_div$Goods <- 1 - (rowSums(otu_table(ps) == 1) / rowSums(otu_table(ps)))
  write.csv(alpha_div, file.path(result_path, "alpha_diversity_metrics.csv"))

  # Barplot da composição taxonômica no nível de Gênero
  ps_genus <- tax_glom(ps, taxrank = "Genus")
  ps_genus_rel <- transform_sample_counts(ps_genus, function(x) x / sum(x))
  g1 <- plot_bar(ps_genus_rel, fill = "Genus") +
    theme_minimal() +
    theme(axis.text.x = element_text(angle = 90, hjust = 1))
  ggsave(file.path(result_path, "taxa_barplot_genus.png"), g1, width = 10, height = 6)

  # Diversidade beta (Bray-Curtis com PCoA)
  ord_bc <- ordinate(ps, method = "PCoA", distance = "bray")
  g2 <- plot_ordination(ps, ord_bc, color = "sample") +
    geom_point(size = 3) +
    theme_minimal()
  ggsave(file.path(result_path, "beta_diversity_pcoa.png"), g2, width = 8, height = 6)

  return("Pipeline finalizado com sucesso.")
}
