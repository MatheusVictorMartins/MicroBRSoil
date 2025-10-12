run_dada2_pipeline <- function(path1, path2 = "/app/pipeline-r/references/silva_nr99_v138.1_train_set.fa", outdir = NULL, type = "illumina") {
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
  result_path <- if (!is.null(outdir)) outdir else file.path(getwd(), "resultados")
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

  # Check if any samples were completely filtered out
  filtered_samples <- out[,"reads.out"] > 0
  if (sum(filtered_samples) == 0) {
    stop("All samples were filtered out. Check filtering parameters.")
  }
  
  # Update file lists and sample names to only include successfully filtered samples
  if (sum(filtered_samples) < length(filtFs)) {
    warning(paste("Removing", length(filtFs) - sum(filtered_samples), "samples that were completely filtered out"))
    filtFs <- filtFs[filtered_samples]
    filtRs <- filtRs[filtered_samples]
    sample.names <- sample.names[filtered_samples]
    cat("Remaining samples:", paste(sample.names, collapse = ", "), "\n")
  }

  # Aprendizado de erro
  errF <- learnErrors(filtFs, multithread = TRUE)
  errR <- learnErrors(filtRs, multithread = TRUE)

  # Inferência
  derepFs <- derepFastq(filtFs, verbose = TRUE)
  derepRs <- derepFastq(filtRs, verbose = TRUE)
  # Ensure derep objects have consistent names
  names(derepFs) <- sample.names
  names(derepRs) <- sample.names
  
  # Debug: Print sample names to verify consistency
  cat("Sample names:", paste(sample.names, collapse = ", "), "\n")
  cat("derepFs names:", paste(names(derepFs), collapse = ", "), "\n")
  cat("derepRs names:", paste(names(derepRs), collapse = ", "), "\n")
  
  dadaFs <- dada(derepFs, err = errF, multithread = TRUE)
  dadaRs <- dada(derepRs, err = errR, multithread = TRUE)

  # Mesclagem
  mergers <- mergePairs(dadaFs, derepFs, dadaRs, derepRs, verbose = TRUE)
  # Ensure consistent sample names across all objects
  names(mergers) <- sample.names

  # Tabela de sequência
  seqtab <- makeSequenceTable(mergers)
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = TRUE)
  
  # Ensure row names match sample.names consistently
  rownames(seqtab.nochim) <- sample.names

  # Atribuição taxonômica
  taxa <- assignTaxonomy(seqtab.nochim, path2, multithread = TRUE)

  # Criar phyloseq - ensure all components have matching sample names
  seqtab.nochim <- as.matrix(seqtab.nochim)
  taxa <- as.matrix(taxa)
  # Verify that all sample names match before creating phyloseq object
  samples <- data.frame(sample = sample.names, row.names = sample.names)
  
  # Double-check sample name consistency
  if (!all(rownames(seqtab.nochim) == rownames(samples))) {
    warning("Sample names don't match between OTU table and sample data. Fixing...")
    rownames(seqtab.nochim) <- sample.names
  }
  
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

  # === Exportações adicionais ===
  write.csv(as.data.frame(otu_table(ps)), file.path(result_path, "otu_table.csv"))
  write.csv(as.data.frame(tax_table(ps)), file.path(result_path, "tax_table.csv"))
  write.csv(as.data.frame(sample_data(ps)), file.path(result_path, "sample_metadata.csv"))

  # Create success status file to indicate pipeline completed without errors
  success_status <- list(
    status = "success",
    message = "Pipeline finalizado com sucesso",
    timestamp = Sys.time(),
    pipeline_type = "illumina",
    files_created = c(
      "alpha_diversity_metrics.csv",
      "otu_table.csv", 
      "tax_table.csv",
      "sample_metadata.csv",
      "phyloseq_object.rds"
    )
  )
  
  # Write status file as JSON-like format
  writeLines(
    c(
      "{",
      paste0('  "status": "', success_status$status, '",'),
      paste0('  "message": "', success_status$message, '",'),
      paste0('  "timestamp": "', success_status$timestamp, '",'),
      paste0('  "pipeline_type": "', success_status$pipeline_type, '",'),
      '  "files_created": [',
      paste0('    "', success_status$files_created, '"', collapse = ",\n"),
      '  ]',
      "}"
    ),
    file.path(result_path, "pipeline_status.json")
  )

  cat("Pipeline completed successfully - no errors detected\n")
  return("Pipeline finalizado com sucesso.")
}