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
  result_path <- if (!is.null(outdir)) outdir else file.path(getwd(), "results")
  dir.create(result_path, recursive = TRUE, showWarnings = FALSE)
  
  filt_path <- file.path(result_path, "filtered")
  dir.create(filt_path, recursive = TRUE, showWarnings = FALSE)
  
  filtFs <- file.path(filt_path, paste0(sample.names, "_F_filt.fastq.gz"))
  filtRs <- file.path(filt_path, paste0(sample.names, "_R_filt.fastq.gz"))
  
  # Step 1: Filter/trim
  cat("Step 1: Filter and trim\n")
  out <- filterAndTrim(fnFs, filtFs, fnRs, filtRs,
                       truncLen = c(145, 135),
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
  
 # Step 8: Taxonomic barplot (Genus) — Top N + Others + legend bottom (FIXED)
cat("Step 8: Taxonomic barplot\n")
try({

  # --- Settings (adjust if you want) ---
  TOP_N <- 30                  # number of dominant genera to keep
  OTHER_LABEL <- "Others"
  OUT_W <- 14                  # inches
  OUT_H <- 10                  # inches (increase height helps a lot)
  OUT_DPI <- 300

  # 1) Agglomerate at Genus
  ps_genus <- tax_glom(ps, taxrank = "Genus", NArm = TRUE)

  # 2) Relative abundance
  ps_genus_rel <- transform_sample_counts(ps_genus, function(x) x / sum(x))

  # 3) Compute mean abundance per TAXON robustly (taxa as rows no matter what)
  otu_mat <- as(otu_table(ps_genus_rel), "matrix")
  if (!taxa_are_rows(ps_genus_rel)) {
    otu_mat <- t(otu_mat)  # ensure taxa are rows
  }
  mean_ab <- rowMeans(otu_mat)  # mean relative abundance per taxon

  TOP_N <- min(TOP_N, length(mean_ab))
  top_taxa <- names(sort(mean_ab, decreasing = TRUE))[seq_len(TOP_N)]
  other_taxa <- setdiff(rownames(otu_mat), top_taxa)

  # 4) Create "Genus2" taxonomy rank: keep top genera, collapse the rest to Others
  tx <- as.data.frame(tax_table(ps_genus_rel))
  tx$Genus2 <- as.character(tx$Genus)

  # handle NA/empty genus
  tx$Genus2[is.na(tx$Genus2) | tx$Genus2 == ""] <- "Unclassified"

  # collapse everything not in top_taxa to Others (based on taxon IDs)
  tx$Genus2[rownames(tx) %in% other_taxa] <- OTHER_LABEL
  tax_table(ps_genus_rel) <- tax_table(as.matrix(tx))

  # 5) Re-glom by Genus2 to actually SUM Others into one category
  ps_genus_top <- tax_glom(ps_genus_rel, taxrank = "Genus2", NArm = FALSE)

  # 6) Plot (force "Others" to be stacked together)
  df <- psmelt(ps_genus_top)

  # Guarantee factor order: top taxa first, Others last (on top of the stack)
  df$Genus2 <- as.character(df$Genus2)
  df$Genus2[df$Genus2 == "" | is.na(df$Genus2)] <- "Unclassified"

  # Put Others last (top of stack). If you want it at the bottom, put it first.
  taxa_levels <- setdiff(sort(unique(df$Genus2)), OTHER_LABEL)
  df$Genus2 <- factor(df$Genus2, levels = c(taxa_levels, OTHER_LABEL))

  g1 <- ggplot(df, aes(x = Sample, y = Abundance, fill = Genus2)) +
    geom_bar(stat = "identity", position = "stack", width = 0.9) +
    theme_minimal() +
    theme(
      axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5),
      legend.position = "bottom",
      legend.title = element_text(size = 9),
      legend.text  = element_text(size = 7),
      legend.key.size = unit(0.35, "cm"),
      plot.margin = margin(10, 10, 10, 10)
    ) +
    guides(fill = guide_legend(ncol = 4)) +
    labs(x = NULL, y = "Relative abundance", fill = "Genus")

  # 7) Save PNG + PDF
  ggsave(
    filename = file.path(result_path, "taxa_barplot_genus.png"),
    plot = g1,
    width = OUT_W, height = OUT_H, units = "in", dpi = OUT_DPI,
    limitsize = FALSE
  )

  ggsave(
    filename = file.path(result_path, "taxa_barplot_genus.pdf"),
    plot = g1,
    width = OUT_W, height = OUT_H, units = "in",
    limitsize = FALSE
  )

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
    message = "Pipeline completed successfully",
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
  
  return("Pipeline completed successfully.")
}
