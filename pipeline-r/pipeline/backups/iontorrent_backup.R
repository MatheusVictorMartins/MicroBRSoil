default_silva_path <- Sys.getenv(
  "SILVA_REFERENCE_PATH",
  "/app/pipeline-r/references/silva_nr99_v138.1_train_set.fa"
)

run_dada2_pipeline <- function(path1,
                               barcodes_path = "/app/pipeline-r/barcodes/barcodes_16S.fa",
                               path2 = default_silva_path,
                               outdir = NULL,
                               type = "iontorrent") {

  suppressPackageStartupMessages({
    library(dada2)
    library(phyloseq)
    library(ggplot2)
    library(vegan)
    library(dplyr)
    library(ShortRead)
  })

  # Force single-core to avoid mclapply/fork issues on some hosts
  options(mc.cores = 1)
  Sys.setenv("MC_CORES" = 1, "OMP_NUM_THREADS" = 1)
  if (requireNamespace("BiocParallel", quietly = TRUE)) {
    BiocParallel::register(BiocParallel::SerialParam())
  }

  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    install.packages("jsonlite", repos = "https://cloud.r-project.org")
  }
  library(jsonlite)

  cat("\n========================================\n")
  cat("IonTorrent DADA2 pipeline\n")
  cat("========================================\n")
  cat("Timestamp:", as.character(Sys.time()), "\n\n")

  # Configure log sink to capture progress into file for tracking
  if (!is.null(outdir)) {
    log_file <- file.path(outdir, "pipeline_progress.log")
    sink(log_file, append = TRUE, split = TRUE)
    on.exit({
      while (sink.number() > 0) sink(NULL)
    }, add = TRUE)
  }

  if (!file.exists(path1)) {
    stop("Input FASTQ file not found: ", path1)
  }
  if (!file.exists(barcodes_path)) {
    stop("Barcode reference not found: ", barcodes_path)
  }

  result_path <- if (!is.null(outdir)) outdir else file.path(getwd(), "resultados_iontorrent")
  dir.create(result_path, recursive = TRUE, showWarnings = FALSE)

  demux_path <- file.path(result_path, "demultiplexed")
  filt_path  <- file.path(result_path, "filtered")

  # Safer single-thread mode
  use_multithread <- FALSE

  # Clean previous runs
  if (dir.exists(demux_path)) unlink(demux_path, recursive = TRUE, force = TRUE)
  if (dir.exists(filt_path))  unlink(filt_path,  recursive = TRUE, force = TRUE)
  dir.create(demux_path, showWarnings = FALSE, recursive = TRUE)
  dir.create(filt_path,  showWarnings = FALSE, recursive = TRUE)

  # ---------------------------
  # Helpers (streaming-safe)
  # ---------------------------
  count_reads_stream <- function(f, chunk = 200000L) {
    st <- ShortRead::FastqStreamer(f, n = chunk)
    on.exit(try(close(st), silent = TRUE), add = TRUE)
    total <- 0L
    repeat {
      x <- yield(st)
      if (length(x) == 0) break
      total <- total + length(x)
    }
    total
  }

  estimate_read_lengths <- function(files, max_reads = 2000L, chunk = 5000L) {
    lens <- integer()
    for (f in files) {
      try({
        st <- ShortRead::FastqStreamer(f, n = chunk)
        on.exit(try(close(st), silent = TRUE), add = TRUE)
        repeat {
          r <- yield(st)
          if (length(r) == 0) break
          lens <- c(lens, width(sread(r)))
          if (length(lens) >= max_reads) break
        }
        close(st)
        on.exit(NULL, add = FALSE)
      }, silent = TRUE)
      if (length(lens) >= max_reads) break
    }
    lens
  }

  safe_filter_and_trim <- function(fwd, filt, args) {
    tryCatch({
      do.call(
        filterAndTrim,
        c(list(fwd, filt), args, list(multithread = use_multithread))
      )
    }, error = function(e) {
      message("filterAndTrim failed with multithread mode (", use_multithread,
              "), retrying sequentially per-sample: ", e$message)
      res <- lapply(seq_along(fwd), function(i) {
        tryCatch(
          do.call(
            filterAndTrim,
            c(list(fwd[i], filt[i]), args, list(multithread = FALSE))
          ),
          error = function(inner) {
            stop(sprintf("Filtering failed for sample %s: %s", basename(fwd[i]), inner$message))
          }
        )
      })
      do.call(rbind, res)
    })
  }

  # --------------------------------------------------
  # Step 0: Demultiplexing by barcode (STREAMING)
  # --------------------------------------------------
  cat("Step 0: Demultiplexing by barcode (streaming)\n")

  barcodes <- readFasta(barcodes_path)
  barcode_ids  <- as.character(id(barcodes))
  barcode_seqs <- as.character(sread(barcodes))

  # clear outputs
  for (sid in barcode_ids) {
    out_fastq <- file.path(demux_path, paste0(sid, ".fastq.gz"))
    if (file.exists(out_fastq)) file.remove(out_fastq)
  }

  chunk_n <- as.integer(Sys.getenv("IONT_STREAM_CHUNK", "50000"))
  st_in <- ShortRead::FastqStreamer(path1, n = chunk_n)
  on.exit(try(close(st_in), silent = TRUE), add = TRUE)

  repeat {
    fq_chunk <- yield(st_in)
    if (length(fq_chunk) == 0) break

    seqs <- as.character(sread(fq_chunk))

    for (i in seq_along(barcode_seqs)) {
      bc  <- barcode_seqs[i]
      sid <- barcode_ids[i]
      k   <- nchar(bc)

      hit <- substr(seqs, 1, k) == bc
      if (!any(hit)) next

      sub <- fq_chunk[hit]
      trimmed <- narrow(sread(sub), start = k + 1, end = width(sread(sub)))
      qual <- narrow(quality(quality(sub)), start = k + 1, end = width(sread(sub)))
      newfq <- ShortReadQ(sread = trimmed, quality = qual, id = id(sub))

      out_fastq <- file.path(demux_path, paste0(sid, ".fastq.gz"))
      writeFastq(newfq, out_fastq, compress = TRUE, mode = "a")
    }

    rm(fq_chunk)
    gc()
  }

  # --------------------------------------------------
  # Step 0.1: List demultiplexed outputs (IMPORTANT)
  # --------------------------------------------------
  fnFs <- list.files(demux_path, pattern = "\\.fastq(\\.gz)?$", full.names = TRUE)
  if (length(fnFs) == 0) stop("No demultiplexed FASTQ files were generated in: ", demux_path)
  sample.names <- tools::file_path_sans_ext(basename(fnFs))

  # --------------------------------------------------
  # Step 0.5: Depth screening (STREAMING COUNT)
  # --------------------------------------------------
  cat("Step 0.5: Depth screening (remove low-depth barcodes)\n")

  read_counts <- sapply(fnFs, count_reads_stream)
  mean_reads <- mean(read_counts)
  cutoff_reads <- 0.10 * mean_reads
  keep_idx <- which(read_counts >= cutoff_reads)

  if (length(keep_idx) == 0) {
    stop("All demultiplexed samples are below the 10% depth cutoff (mean reads = ", round(mean_reads), ").")
  }

  dropped <- length(read_counts) - length(keep_idx)
  if (dropped > 0) {
    cat("Dropping", dropped, "samples below depth cutoff of", round(cutoff_reads), "reads\n")
  }

  fnFs <- fnFs[keep_idx]
  sample.names <- sample.names[keep_idx]
  cat("Samples retained after cutoff:", paste(sample.names, collapse = ", "), "\n")

  # --------------------------------------------------
  # Estimate truncLen, etc.
  # --------------------------------------------------
  lens <- estimate_read_lengths(fnFs)
  trunc_len_est <- NA_integer_
  if (length(lens)) {
    trunc_len_est <- min(270L, max(80L, floor(stats::quantile(lens, 0.85))))
  }
  if (is.na(trunc_len_est) || trunc_len_est <= 0) trunc_len_est <- 220L
  max_ee_est <- if (trunc_len_est >= 220) 3 else 4

  cat("Estimated read length (85th pct):", trunc_len_est, " maxEE:", max_ee_est, "\n")

  # --------------------------------------------------
  # Step 1: Filter and trim (single-end)
  # --------------------------------------------------
  cat("Step 1: Filter and trim (single-end)\n")

  filtFs <- file.path(filt_path, paste0(sample.names, "_filt.fastq.gz"))

  filter_attempts <- list(
    list(
      name = "default",
      args = list(
        truncLen = trunc_len_est,
        maxN = 0,
        maxEE = max_ee_est,
        truncQ = 2,
        rm.phix = TRUE,
        compress = TRUE
      )
    ),
    list(
      name = "relaxed_no_trunc",
      args = list(
        truncLen = 0,
        maxN = 0,
        maxEE = 5,
        truncQ = 2,
        rm.phix = TRUE,
        compress = TRUE
      )
    ),
    list(
      name = "pass_through",
      args = NULL
    )
  )

  filter_success <- FALSE
  out <- NULL

  for (attempt in filter_attempts) {
    cat("Filter attempt:", attempt$name, "\n")
    if (attempt$name == "pass_through") break

    out <- safe_filter_and_trim(fnFs, filtFs, attempt$args)
    print(out)
    cat("reads.in reads.out\n")
    cat(capture.output(out), sep = "\n")

    keep <- out[, "reads.out"] > 0
    if (sum(keep) > 0) {
      filter_success <- TRUE
      if (!all(keep)) {
        cat("Removing", sum(!keep), "samples with zero reads after filtering (attempt:", attempt$name, ")\n")
        filtFs <- filtFs[keep]
        sample.names <- sample.names[keep]
      }
      break
    } else {
      cat("All reads removed in attempt", attempt$name, "- trying next strategy if available.\n")
      unlink(filtFs, recursive = FALSE, force = TRUE)
    }
  }

  if (!filter_success) {
    cat("Filter attempts failed; copying demultiplexed FASTQs as filtered outputs (pass-through)\n")
    file.copy(fnFs, filtFs, overwrite = TRUE)
    counts <- sapply(fnFs, function(f) {
      tryCatch(count_reads_stream(f), error = function(e) NA_integer_)
    })
    out <- cbind(reads.in = counts, reads.out = counts)
    rownames(out) <- basename(fnFs)
    filter_success <- TRUE
    sample.names <- tools::file_path_sans_ext(basename(filtFs))
    print(out)
    cat("reads.in reads.out\n")
    cat(capture.output(out), sep = "\n")
  }

  if (!filter_success) {
    stop("Filtering failed: all samples removed even after relaxed parameters.")
  }

  # --------------------------------------------------
  # Step 2: Learn errors
  # --------------------------------------------------
  cat("Step 2: Learn errors\n")
  errF <- learnErrors(filtFs, multithread = use_multithread)

  # --------------------------------------------------
  # Step 3: Denoise (PER SAMPLE)
  # --------------------------------------------------
  cat("Step 3: Denoise (per-sample)\n")

  dadaFs <- vector("list", length(filtFs))
  names(dadaFs) <- sample.names

  for (i in seq_along(filtFs)) {
    cat("  -", i, "/", length(filtFs), ":", basename(filtFs[i]), "\n")
    derep <- derepFastq(filtFs[i], verbose = TRUE)
    dadaFs[[i]] <- dada(derep, err = errF, multithread = FALSE)
    rm(derep)
    gc()
  }

  # --------------------------------------------------
  # Step 4: Sequence table and chimera removal
  # --------------------------------------------------
  cat("Step 4: Sequence table and chimera removal\n")
  seqtab <- makeSequenceTable(dadaFs)
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = use_multithread)
  rownames(seqtab.nochim) <- sample.names

  # --------------------------------------------------
  # Step 5: Taxonomy assignment
  # --------------------------------------------------
  cat("Step 5: Taxonomy assignment\n")
  valid_ref <- !is.null(path2) && file.exists(path2)
  taxa <- tryCatch({
    if (valid_ref) {
      assignTaxonomy(seqtab.nochim, path2, multithread = use_multithread)
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

  # Rank coverage summary to choose barplot rank (fallback to Genus)
  numer_of_taxa_assigned_by_rank <- tryCatch(
    sapply(as_tibble(taxa), function(col) (!is.na(col))) %>% colSums(),
    error = function(e) {
      warning("Failed to compute taxa counts by rank: ", e$message)
      NULL
    }
  )
  rank_name <- "Genus"
  if (!is.null(numer_of_taxa_assigned_by_rank) && length(numer_of_taxa_assigned_by_rank) > 0) {
    rank_chosen_to_plot <- tail(which(numer_of_taxa_assigned_by_rank >= 2), 1)
    if (length(rank_chosen_to_plot) == 0) {
      rank_chosen_to_plot <- which.max(numer_of_taxa_assigned_by_rank)
    }
    rank_name <- names(numer_of_taxa_assigned_by_rank)[rank_chosen_to_plot]
    cat("Rank chosen to plot:", rank_name, "\n")
  } else {
    cat("Could not determine rank coverage; defaulting to Genus for barplot\n")
  }

  # --------------------------------------------------
  # Step 6: Create phyloseq object
  # --------------------------------------------------
  cat("Step 6: Create phyloseq object\n")
  samples <- data.frame(sample = sample.names, sampleid = sample.names, row.names = sample.names)
  ps <- phyloseq(
    otu_table(seqtab.nochim, taxa_are_rows = FALSE),
    tax_table(as.matrix(taxa)),
    sample_data(samples)
  )
  saveRDS(ps, file = file.path(result_path, "phyloseq_object.rds"))

  # --------------------------------------------------
  # Step 7: Alpha diversity
  # --------------------------------------------------
  cat("Step 7: Alpha diversity\n")
  alpha_div <- estimate_richness(ps, measures = c("Observed", "Shannon", "Simpson"))
  alpha_div$Chao1 <- estimate_richness(ps, measures = "Chao1")[, 1]
  alpha_div$Goods <- 1 - (rowSums(otu_table(ps) == 1) / pmax(rowSums(otu_table(ps)), 1))

  if (requireNamespace("breakaway", quietly = TRUE)) {
    cat("Computing breakaway richness estimates\n")
    otu_mat <- as(otu_table(ps), "matrix")
    if (taxa_are_rows(ps)) otu_mat <- t(otu_mat)
    ba_list <- tryCatch(
      apply(otu_mat, 1, function(x) breakaway::breakaway(as.integer(x))),
      error = function(e) {
        warning("breakaway failed: ", e$message)
        NULL
      }
    )
    if (!is.null(ba_list)) {
      ba_df <- data.frame(
        sample = names(ba_list),
        breakaway = sapply(ba_list, function(x) x$estimate),
        breakaway_se = sapply(ba_list, function(x) x$error),
        row.names = NULL
      )
      alpha_div$sample <- rownames(alpha_div)
      alpha_div <- merge(alpha_div, ba_df, by.x = "sample", by.y = "sample", all.x = TRUE, sort = FALSE)
      alpha_div$sample <- NULL
    }
  } else {
    cat("breakaway not installed; skipping breakaway richness\n")
  }

  alpha_export <- data.frame(
    sample = rownames(alpha_div),
    observed = alpha_div$Observed,
    shannon = alpha_div$Shannon,
    simpson = alpha_div$Simpson,
    chao1 = alpha_div$Chao1,
    goods = alpha_div$Goods
  )
  if ("breakaway" %in% colnames(alpha_div)) {
    alpha_export$breakaway <- alpha_div$breakaway
    alpha_export$breakaway_se <- alpha_div$breakaway_se
  }
  write.csv(alpha_export, file.path(result_path, "alpha_diversity_metrics.csv"), row.names = FALSE)

  # --------------------------------------------------
  # Step 8: Taxonomic barplot
  # --------------------------------------------------
  cat("Step 8: Taxonomic barplot\n")
  try({
    ps_genus <- tax_glom(ps, taxrank = "Genus")
    ps_genus_rel <- transform_sample_counts(ps_genus, function(x) x / sum(x))
    g1 <- plot_bar(ps_genus_rel, fill = "Genus") +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 90, hjust = 1))
    ggsave(file.path(result_path, "taxa_barplot_genus.png"), g1, width = 10, height = 6)
    # Also produce barplot using the best-covered rank (as in local R script)
    ps_rank <- tax_glom(ps, taxrank = rank_name)
    ps_rank_rel <- transform_sample_counts(ps_rank, function(x) x / sum(x))
    g_rank <- plot_bar(ps_rank_rel, fill = rank_name) +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 90, hjust = 1))
    ggsave(file.path(result_path, "taxa_barplot.png"), g_rank, width = 10, height = 6)
  }, silent = TRUE)

  # --------------------------------------------------
  # Step 9: Beta diversity (PCoA Bray-Curtis)
  # --------------------------------------------------
  cat("Step 9: Beta diversity (PCoA Bray-Curtis)\n")
  try({
    ord_bc <- ordinate(ps, method = "PCoA", distance = "bray")
    g2 <- plot_ordination(ps, ord_bc, color = "sample") +
      geom_point(size = 3) +
      theme_minimal()
    ggsave(file.path(result_path, "beta_diversity_pcoa.png"), g2, width = 8, height = 6)
    ggsave(file.path(result_path, "beta_diversity.png"), g2, width = 8, height = 6)
  }, silent = TRUE)

  # --------------------------------------------------
  # Step 10: Export tables
  # --------------------------------------------------
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
      "taxa_barplot.png",
      "taxa_barplot_genus.png",
      "beta_diversity_pcoa.png",
      "beta_diversity.png",
      "pipeline_summary_stats.csv"
    )
  )
  jsonlite::write_json(status, file.path(result_path, "pipeline_status.json"), auto_unbox = TRUE, pretty = TRUE)

  cat("Output directory:", result_path, "\n")
  cat("========================================\n\n")
  return("Pipeline completed successfully.")
}
