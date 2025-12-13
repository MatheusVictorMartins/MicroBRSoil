default_silva_path <- Sys.getenv(
  "SILVA_REFERENCE_PATH",
  "/app/pipeline-r/references/silva_nr99_v138.1_train_set.fa"
)

run_dada2_pipeline <- function(path1, path2 = default_silva_path, outdir = NULL, type = "illumina") {
  suppressPackageStartupMessages({
    library(dada2)
    library(phyloseq)
    library(ggplot2)
    library(vegan)
    library(microbiome)
  })
  
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    install.packages("jsonlite", repos = "https://cloud.r-project.org")
  }
  library(jsonlite)
  
  cat("\n========================================\n")
  cat("Illumina DADA2 pipeline\n")
  cat("========================================\n")
  cat("Timestamp:", as.character(Sys.time()), "\n\n")
  
  # Configure log sink to capture progress (cat/print) into file for tracking
  if (!is.null(outdir)) {
    log_file <- file.path(outdir, "pipeline_progress.log")
    sink(log_file, append = TRUE, split = TRUE)
    on.exit({
      try(sink(NULL), silent = TRUE)
      try(sink(NULL), silent = TRUE)
    }, add = TRUE)
  }
  
  # Resolve input path (directory or file)
  if (dir.exists(path1)) {
    path <- path1
  } else if (file.exists(path1)) {
    path <- dirname(path1)
  } else {
    stop("Input path does not exist: ", path1)
  }
  
  # Detect paired-end FASTQ files (strict Illumina pattern)
  fnFs <- sort(list.files(path, pattern = "(_R1_001|_R1)[.]fastq([.]gz)?$", full.names = TRUE, ignore.case = TRUE))
  fnRs <- sort(list.files(path, pattern = "(_R2_001|_R2)[.]fastq([.]gz)?$", full.names = TRUE, ignore.case = TRUE))
  
  if (length(fnFs) == 0 || length(fnRs) == 0) {
    stop("No FASTQ files found matching *_R1_001.fastq.gz and *_R2_001.fastq.gz patterns in: ", path)
  }
  if (length(fnFs) != length(fnRs)) {
    stop("Number of forward (R1) and reverse (R2) files does not match.")
  }
  
  sample.names <- sapply(strsplit(basename(fnFs), "_"), `[`, 1)
  rs.names <- sapply(strsplit(basename(fnRs), "_"), `[`, 1)
  rs.map <- setNames(fnRs, rs.names)
  fnRs <- rs.map[sample.names]
  
  if (any(is.na(fnRs))) {
    stop("Could not pair all R1/R2 files by sample name. Check file naming.")
  }
  
  cat("Found", length(sample.names), "paired samples\n")
  cat("Samples:", paste(sample.names, collapse = ", "), "\n\n")
  
  # Prepare output dirs
  result_path <- if (!is.null(outdir)) outdir else file.path(getwd(), "resultados")
  dir.create(result_path, recursive = TRUE, showWarnings = FALSE)
  
  filt_path <- file.path(result_path, "filtered")
  dir.create(filt_path, recursive = TRUE, showWarnings = FALSE)
  
  filtFs <- file.path(filt_path, paste0(sample.names, "_F_filt.fastq.gz"))
  filtRs <- file.path(filt_path, paste0(sample.names, "_R_filt.fastq.gz"))
  
  # Step 1: Filter/trim
  cat("Step 1: Filter and trim\n")
  out <- filterAndTrim(fnFs, filtFs, fnRs, filtRs,
                       truncLen = c(240, 160),
                       maxN = 0, maxEE = c(2, 2), truncQ = 2,
                       rm.phix = TRUE, compress = TRUE, multithread = TRUE)
  print(out)
  cat("\n")
  
  keep <- out[, "reads.out"] > 0
  if (sum(keep) == 0) stop("All samples were filtered out.")
  if (!all(keep)) {
    cat("Removing", sum(!keep), "samples with zero reads after filtering\n")
    filtFs <- filtFs[keep]
    filtRs <- filtRs[keep]
    sample.names <- sample.names[keep]
  }
  
  # Step 2: Learn errors
  cat("Step 2: Learn errors\n")
  errF <- learnErrors(filtFs, multithread = TRUE)
  errR <- learnErrors(filtRs, multithread = TRUE)
  
  # Step 3: Denoise and merge
  cat("Step 3: Denoise and merge\n")
  derepFs <- derepFastq(filtFs, verbose = TRUE)
  derepRs <- derepFastq(filtRs, verbose = TRUE)
  names(derepFs) <- sample.names
  names(derepRs) <- sample.names
  
  dadaFs <- dada(derepFs, err = errF, multithread = TRUE)
  dadaRs <- dada(derepRs, err = errR, multithread = TRUE)
  mergers <- mergePairs(dadaFs, derepFs, dadaRs, derepRs, verbose = TRUE)
  
  # Step 4: Sequence table and chimera removal
  cat("Step 4: Sequence table and chimera removal\n")
  seqtab <- makeSequenceTable(mergers)
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = TRUE)
  rownames(seqtab.nochim) <- sample.names
  
  # Step 5: Taxonomy
  cat("Step 5: Taxonomy assignment\n")
  valid_ref <- !is.null(path2) && file.exists(path2)
  taxa <- tryCatch({
    if (valid_ref) {
      assignTaxonomy(seqtab.nochim, path2, multithread = TRUE)
    } else {
      stop("Reference missing")
    }
  }, error = function(e) {
    warning("assignTaxonomy failed: ", e$message)
    matrix(
      NA_character_,
      nrow = ncol(seqtab.nochim),
      ncol = 7,
      dimnames = list(colnames(seqtab.nochim),
                      c("kingdom", "phylum", "class", "order", "family", "genus", "species"))
    )
  })
  
  # Step 6: Phyloseq object
  cat("Step 6: Create phyloseq object\n")
  samples <- data.frame(sample = sample.names, sampleid = sample.names, row.names = sample.names)
  ps <- phyloseq(
    otu_table(seqtab.nochim, taxa_are_rows = FALSE),
    tax_table(as.matrix(taxa)),
    sample_data(samples)
  )
  saveRDS(ps, file = file.path(result_path, "phyloseq_object.rds"))
  
  # Step 7: Alpha diversity
  cat("Step 7: Alpha diversity\n")
  alpha_div <- estimate_richness(ps, measures = c("Observed", "Shannon", "Simpson"))
  alpha_div$Chao1 <- estimate_richness(ps, measures = "Chao1")[, 1]
  alpha_div$Goods <- 1 - (rowSums(otu_table(ps) == 1) / pmax(rowSums(otu_table(ps)), 1))
  alpha_export <- data.frame(
    sample = rownames(alpha_div),
    observed = alpha_div$Observed,
    shannon = alpha_div$Shannon,
    simpson = alpha_div$Simpson,
    chao1 = alpha_div$Chao1,
    goods = alpha_div$Goods
  )
  write.csv(alpha_export, file.path(result_path, "alpha_diversity_metrics.csv"), row.names = FALSE)
  
  # Step 8: Taxonomic barplot
  cat("Step 8: Taxonomic barplot\n")
  try({
    ps_genus <- tax_glom(ps, taxrank = "Genus")
    ps_genus_rel <- transform_sample_counts(ps_genus, function(x) x / sum(x))
    g1 <- plot_bar(ps_genus_rel, fill = "Genus") +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 90, hjust = 1))
    ggsave(file.path(result_path, "taxa_barplot_genus.png"), g1, width = 10, height = 6)
  }, silent = TRUE)
  
  # Step 9: Beta diversity
  cat("Step 9: Beta diversity (PCoA Bray-Curtis)\n")
  try({
    ord_bc <- ordinate(ps, method = "PCoA", distance = "bray")
    g2 <- plot_ordination(ps, ord_bc, color = "sample") +
      geom_point(size = 3) +
      theme_minimal()
    ggsave(file.path(result_path, "beta_diversity_pcoa.png"), g2, width = 8, height = 6)
  }, silent = TRUE)
  
  # Step 10: Exports
  cat("Step 10: Export tables\n")
  otu_export <- data.frame(
    sequence = colnames(seqtab.nochim),
    t(seqtab.nochim),
    check.names = FALSE
  )
  write.csv(otu_export, file.path(result_path, "otu_table.csv"), row.names = FALSE)
  
  tax_export <- data.frame(
    sequence = rownames(taxa),
    taxa,
    check.names = FALSE
  )
  write.csv(tax_export, file.path(result_path, "tax_table.csv"), row.names = FALSE)
  
  metadata_export <- data.frame(sample = sample.names, sampleid = sample.names, row.names = NULL)
  write.csv(metadata_export, file.path(result_path, "sample_metadata.csv"), row.names = FALSE)
  
  summary_stats <- data.frame(
    metric = c("total_samples", "total_taxa", "total_reads"),
    value = c(nsamples(ps), ntaxa(ps), sum(otu_table(ps)))
  )
  write.csv(summary_stats, file.path(result_path, "pipeline_summary_stats.csv"), row.names = FALSE)
  
  status <- list(
    status = "success",
    message = "Pipeline finalizado com sucesso",
    pipeline_type = type,
    timestamp = Sys.time(),
    files_created = c(
      "alpha_diversity_metrics.csv",
      "otu_table.csv",
      "tax_table.csv",
      "sample_metadata.csv",
      "phyloseq_object.rds",
      "taxa_barplot_genus.png",
      "beta_diversity_pcoa.png",
      "pipeline_summary_stats.csv"
    )
  )
  jsonlite::write_json(status, file.path(result_path, "pipeline_status.json"), auto_unbox = TRUE, pretty = TRUE)
  
  cat("Output directory:", result_path, "\n")
  cat("========================================\n\n")
  
  return("Pipeline finalizado com sucesso.")
}
