default_its_ref <- Sys.getenv(
  "ITS_REFERENCE_PATH",
  "/app/pipeline-r/references/sh_general_release_dynamic_19.02.2025.fasta"
)

run_pipeline_its <- function(path1, path2 = default_its_ref, outdir = NULL, type = "its") {
  suppressPackageStartupMessages({
    library(dada2)
    library(phyloseq)
    library(ggplot2)
    library(vegan)
  })
  
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    install.packages("jsonlite", repos = "https://cloud.r-project.org")
  }
  library(jsonlite)
  
  cat("\n========================================\n")
  cat("ITS DADA2 pipeline\n")
  cat("========================================\n")
  cat("Timestamp:", as.character(Sys.time()), "\n\n")
  
  # Configure log sink to capture progress into file for tracking
  if (!is.null(outdir)) {
    log_file <- file.path(outdir, "pipeline_progress.log")
    sink(log_file, append = TRUE, split = TRUE)
    on.exit({
      try(sink(NULL), silent = TRUE)
      try(sink(NULL), silent = TRUE)
    }, add = TRUE)
  }
  
  if (dir.exists(path1)) {
    path <- path1
  } else if (file.exists(path1)) {
    path <- dirname(path1)
  } else {
    stop("Input path does not exist: ", path1)
  }
  
  fnFs <- sort(list.files(path, pattern = "_R1_001[.]fastq([.]gz)?$", full.names = TRUE))
  fnRs <- sort(list.files(path, pattern = "_R2_001[.]fastq([.]gz)?$", full.names = TRUE))
  if (length(fnFs) == 0 || length(fnRs) == 0) {
    stop("No FASTQ files found matching *_R1_001.fastq.gz and *_R2_001.fastq.gz in: ", path)
  }
  sample.names <- sapply(strsplit(basename(fnFs), "_"), `[`, 1)
  rs.names <- sapply(strsplit(basename(fnRs), "_"), `[`, 1)
  fnRs <- setNames(fnRs, rs.names)[sample.names]
  if (any(is.na(fnRs))) stop("Could not pair all R1/R2 files by sample name.")
  
  cat("Found", length(sample.names), "paired samples\n")
  cat("Samples:", paste(sample.names, collapse = ", "), "\n\n")
  
  result_path <- if (!is.null(outdir)) outdir else file.path(getwd(), "resultados_its")
  dir.create(result_path, recursive = TRUE, showWarnings = FALSE)
  
  filt_path <- file.path(result_path, "filtered")
  dir.create(filt_path, recursive = TRUE, showWarnings = FALSE)
  
  filtFs <- file.path(filt_path, paste0(sample.names, "_F_filt.fastq.gz"))
  filtRs <- file.path(filt_path, paste0(sample.names, "_R_filt.fastq.gz"))
  
  cat("Step 1: Filter and trim\n")
  out <- filterAndTrim(fnFs, filtFs, fnRs, filtRs,
                       truncLen = c(150, 150),
                       maxN = 0, maxEE = c(2, 2), truncQ = 2,
                       rm.phix = TRUE, compress = TRUE, multithread = TRUE)
  print(out)
  keep <- out[, "reads.out"] > 0
  if (sum(keep) == 0) stop("All samples were filtered out.")
  if (!all(keep)) {
    cat("Removing", sum(!keep), "samples with zero reads after filtering\n")
    filtFs <- filtFs[keep]
    filtRs <- filtRs[keep]
    sample.names <- sample.names[keep]
  }
  
  cat("Step 2: Learn errors\n")
  errF <- learnErrors(filtFs, multithread = TRUE)
  errR <- learnErrors(filtRs, multithread = TRUE)
  
  cat("Step 3: Denoise and merge\n")
  derepFs <- derepFastq(filtFs, verbose = TRUE)
  derepRs <- derepFastq(filtRs, verbose = TRUE)
  names(derepFs) <- sample.names
  names(derepRs) <- sample.names
  dadaFs <- dada(derepFs, err = errF, multithread = TRUE)
  dadaRs <- dada(derepRs, err = errR, multithread = TRUE)
  mergers <- mergePairs(dadaFs, derepFs, dadaRs, derepRs, verbose = TRUE)
  
  cat("Step 4: Sequence table and chimera removal\n")
  seqtab <- makeSequenceTable(mergers)
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = TRUE, verbose = TRUE)
  rownames(seqtab.nochim) <- sample.names
  
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
  
  cat("Step 6: Create phyloseq object\n")
  samples <- data.frame(sample = sample.names, sampleid = sample.names, row.names = sample.names)
  ps <- phyloseq(
    otu_table(seqtab.nochim, taxa_are_rows = FALSE),
    tax_table(as.matrix(taxa)),
    sample_data(samples)
  )
  saveRDS(ps, file = file.path(result_path, "phyloseq_object.rds"))
  
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
  
  cat("Step 8: Taxonomic barplot\n")
  try({
    ps_genus <- tax_glom(ps, taxrank = "Genus")
    ps_genus_rel <- transform_sample_counts(ps_genus, function(x) x / sum(x))
    g1 <- plot_bar(ps_genus_rel, fill = "Genus") +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 90, hjust = 1))
    ggsave(file.path(result_path, "taxa_barplot_genus.png"), g1, width = 10, height = 6)
  }, silent = TRUE)
  
  cat("Step 9: Beta diversity (PCoA Bray-Curtis)\n")
  try({
    ord_bc <- ordinate(ps, method = "PCoA", distance = "bray")
    g2 <- plot_ordination(ps, ord_bc, color = "sample") +
      geom_point(size = 3) +
      theme_minimal()
    ggsave(file.path(result_path, "beta_diversity_pcoa.png"), g2, width = 8, height = 6)
  }, silent = TRUE)
  
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
    message = "Pipeline ITS executado com sucesso",
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
  
  return("Pipeline ITS executado com sucesso.")
}
