# ============================
# ITS DADA2 Pipeline (worker-safe)
# ============================

default_its_ref <- Sys.getenv(
  "ITS_REFERENCE_PATH",
  "/app/pipeline-r/references/sh_general_release_dynamic_19.02.2025.fasta"
)

# Optional knobs (default NA = disabled)
its_ref_max_seqs <- suppressWarnings(as.integer(Sys.getenv("ITS_REFERENCE_MAX_SEQS", "NA")))
its_ref_len_band <- suppressWarnings(as.integer(Sys.getenv("ITS_REFERENCE_LENGTH_BAND", "NA")))
its_species_path <- Sys.getenv("ITS_SPECIES_PATH", "")  # optional UNITE species file

detect_cgroup_limit_bytes <- function() {
  candidates <- c("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes")
  for (f in candidates) {
    if (file.exists(f)) {
      raw <- tryCatch(readLines(f, warn = FALSE), error = function(e) NA_character_)
      raw <- if (length(raw)) trimws(raw[1]) else NA_character_
      if (!is.na(raw) && nzchar(raw) && raw != "max") {
        val <- suppressWarnings(as.numeric(raw))
        if (!is.na(val) && is.finite(val) && val > 0) return(val)
      }
    }
  }
  NA_real_
}

detect_host_mem_bytes <- function() {
  if (.Platform$OS.type == "unix") {
    line <- tryCatch(system("awk '/MemTotal/ {print $2}' /proc/meminfo", intern = TRUE), error = function(e) NA_character_)
    kb <- suppressWarnings(as.numeric(line))
    if (!is.na(kb)) return(kb * 1024)
  }
  NA_real_
}

effective_mem_gb <- function() {
  host <- detect_host_mem_bytes()
  cg <- detect_cgroup_limit_bytes()
  vals <- c(host, cg)
  vals <- vals[!is.na(vals) & is.finite(vals) & vals > 0]
  if (!length(vals)) return(NA_real_)
  min(vals) / (1024^3)
}

require_or_stop <- function(pkg) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    stop(
      "Pacote R ausente no container: '", pkg,
      "'. Install in the Dockerfile/environment (do not install at runtime)."
    )
  }
}

write_status <- function(outdir, status_list) {
  if (is.null(outdir) || !nzchar(outdir)) return(invisible(NULL))
  suppressWarnings(dir.create(outdir, recursive = TRUE, showWarnings = FALSE))
  if (requireNamespace("jsonlite", quietly = TRUE)) {
    try(jsonlite::write_json(
      status_list,
      file.path(outdir, "pipeline_status.json"),
      auto_unbox = TRUE,
      pretty = TRUE
    ), silent = TRUE)
  }
}

safe_unlink <- function(p) {
  try(unlink(p, recursive = TRUE, force = TRUE), silent = TRUE)
}

run_pipeline_its <- function(path1, path2 = default_its_ref, outdir = NULL, type = "its") {

  # ---- packages (NO runtime installs) ----
  suppressPackageStartupMessages({
    require_or_stop("dada2")
    require_or_stop("phyloseq")
    require_or_stop("ggplot2")
    require_or_stop("vegan")
    require_or_stop("jsonlite")
    require_or_stop("Biostrings")
  })

  # Resolve output dir early (so we can write status on any failure)
  result_path <- if (!is.null(outdir) && nzchar(outdir)) outdir else file.path(getwd(), "resultados_its")
  dir.create(result_path, recursive = TRUE, showWarnings = FALSE)

  # ---- Logging sink ----
  log_file <- file.path(result_path, "pipeline_progress.log")
  sink(log_file, append = TRUE, split = TRUE)
  on.exit({
    try(sink(NULL), silent = TRUE)
    try(sink(NULL), silent = TRUE)
  }, add = TRUE)

  cat("\n========================================\n")
  cat("ITS DADA2 pipeline\n")
  cat("========================================\n")
  cat("Timestamp:", as.character(Sys.time()), "\n")
  cat("Input path1:", path1, "\n")
  cat("Reference path2:", path2, "\n")
  cat("Output dir:", result_path, "\n")
  cat("Knobs: ITS_REFERENCE_MAX_SEQS=", ifelse(is.na(its_ref_max_seqs), "NA", its_ref_max_seqs),
      " ITS_REFERENCE_LENGTH_BAND=", ifelse(is.na(its_ref_len_band), "NA", its_ref_len_band), "\n")
  eff_mem <- effective_mem_gb()
  cat("Detected memory ceiling (GB):", ifelse(is.na(eff_mem), "unknown", sprintf("%.1f", eff_mem)),
      " | R_MAX_VSIZE=", Sys.getenv("R_MAX_VSIZE", ""), "\n")
  cat("========================================\n\n")

  # ---- Main tryCatch to always emit status ----
  tryCatch({

    # Resolve input folder
    if (dir.exists(path1)) {
      path <- path1
    } else if (file.exists(path1)) {
      path <- dirname(path1)
    } else {
      stop("Input path does not exist: ", path1)
    }

    # Find FASTQs
    fnFs <- sort(list.files(path, pattern = "_R1_001[.]fastq([.]gz)?$", full.names = TRUE))
    fnRs <- sort(list.files(path, pattern = "_R2_001[.]fastq([.]gz)?$", full.names = TRUE))
    if (length(fnFs) == 0 || length(fnRs) == 0) {
      stop("No FASTQ files found matching *_R1_001.fastq(.gz) and *_R2_001.fastq(.gz) in: ", path)
    }

    sample.names <- sapply(strsplit(basename(fnFs), "_"), `[`, 1)
    rs.names <- sapply(strsplit(basename(fnRs), "_"), `[`, 1)
    fnRs <- setNames(fnRs, rs.names)[sample.names]
    if (any(is.na(fnRs))) stop("Could not pair all R1/R2 files by sample name.")

    cat("Found", length(sample.names), "paired samples\n")
    cat("Samples:", paste(sample.names, collapse = ", "), "\n\n")

    # Output subdirs
    filt_path <- file.path(result_path, "filtered")
    dir.create(filt_path, recursive = TRUE, showWarnings = FALSE)

    filtFs <- file.path(filt_path, paste0(sample.names, "_F_filt.fastq.gz"))
    filtRs <- file.path(filt_path, paste0(sample.names, "_R_filt.fastq.gz"))

    # Step 1
    cat("Step 1: Filter and trim\n")
    out <- dada2::filterAndTrim(
      fnFs, filtFs, fnRs, filtRs,
      truncLen = c(150, 150),
      maxN = 0, maxEE = c(2, 2), truncQ = 2,
      rm.phix = TRUE, compress = TRUE, multithread = FALSE
    )
    print(out)
    rm(fnFs, fnRs); gc()

    keep <- out[, "reads.out"] > 0
    if (sum(keep) == 0) stop("All samples were filtered out.")
    if (!all(keep)) {
      cat("Removing", sum(!keep), "samples with zero reads after filtering\n")
      filtFs <- filtFs[keep]
      filtRs <- filtRs[keep]
      sample.names <- sample.names[keep]
    }

    # Step 2
    cat("Step 2: Learn errors\n")
    errF <- dada2::learnErrors(filtFs, multithread = FALSE)
    errR <- dada2::learnErrors(filtRs, multithread = FALSE)
    gc()

    # Step 3
    cat("Step 3: Denoise and merge\n")
    derepFs <- dada2::derepFastq(filtFs, verbose = TRUE)
    derepRs <- dada2::derepFastq(filtRs, verbose = TRUE)
    names(derepFs) <- sample.names
    names(derepRs) <- sample.names

    dadaFs <- dada2::dada(derepFs, err = errF, multithread = FALSE)
    dadaRs <- dada2::dada(derepRs, err = errR, multithread = FALSE)

    mergers <- dada2::mergePairs(dadaFs, derepFs, dadaRs, derepRs, verbose = TRUE)

    rm(errF, errR, derepFs, derepRs, dadaFs, dadaRs); gc()

    # Step 4
    cat("Step 4: Sequence table and chimera removal\n")
    seqtab <- dada2::makeSequenceTable(mergers)
    seqtab.nochim <- dada2::removeBimeraDenovo(seqtab, method = "consensus", multithread = FALSE, verbose = TRUE)
    rownames(seqtab.nochim) <- sample.names
    rm(mergers, seqtab); gc()

    if (ncol(seqtab.nochim) == 0) stop("No sequences remaining after chimera removal.")

    # ---- Step 5: Taxonomy ----
    cat("Step 5: Taxonomy assignment\n")
    valid_ref <- !is.null(path2) && nzchar(path2) && file.exists(path2)
    if (!valid_ref) stop("ITS reference missing: ", path2)

    make_ref_subset <- function(full_ref_path, result_path, seqtab_nochim,
                                max_seqs = NA_integer_, len_band = NA_integer_) {

      ref_dna <- Biostrings::readDNAStringSet(full_ref_path)
      original_n <- length(ref_dna)
      used_subset <- FALSE

      # length filter only if configured
      if (!is.na(len_band)) {
        seq_lengths <- nchar(colnames(seqtab_nochim))
        len_min <- max(50, min(seq_lengths) - len_band)
        len_max <- max(seq_lengths) + len_band
        cat(" - Reference length window:", len_min, "-", len_max, "bp\n")

        keep_len <- Biostrings::width(ref_dna) >= len_min & Biostrings::width(ref_dna) <= len_max
        if (any(keep_len) && sum(keep_len) < original_n) {
          ref_dna <- ref_dna[keep_len]
          cat(" - Length-filtered reference:", length(ref_dna), "of", original_n, "\n")
          used_subset <- TRUE
        }
      }

      # downsample only if configured
      if (!is.na(max_seqs) && length(ref_dna) > max_seqs) {
        set.seed(1)
        ref_dna <- ref_dna[sample(seq_len(length(ref_dna)), max_seqs)]
        cat(" - Downsampled reference to", max_seqs, "records\n")
        used_subset <- TRUE
      }

      if (!used_subset) {
        rm(ref_dna); gc()
        return(list(ref_path = full_ref_path, used_subset = FALSE))
      }

      ref_path <- file.path(result_path, "its_reference_subset.fasta")
      Biostrings::writeXStringSet(ref_dna, ref_path, compress = FALSE)
      rm(ref_dna); gc()
      list(ref_path = ref_path, used_subset = TRUE)
    }

    # Decide whether to subset reference to reduce memory footprint
    auto_len_band <- its_ref_len_band
    auto_max_seqs <- its_ref_max_seqs
    subset_reason <- NULL

    if (is.na(auto_len_band) && !is.na(eff_mem) && eff_mem <= 8) {
      auto_len_band <- 120L
      subset_reason <- "limited memory"
    }
    if (is.na(auto_max_seqs) && !is.na(eff_mem) && eff_mem <= 8) {
      auto_max_seqs <- 300000L
      subset_reason <- "limited memory"
    }

    if (!is.na(auto_len_band) || !is.na(auto_max_seqs)) {
      cat(" - Using reference subset",
          if (!is.null(subset_reason)) paste0(" (", subset_reason, ")") else "",
          " len_band=", ifelse(is.na(auto_len_band), "NA", auto_len_band),
          " max_seqs=", ifelse(is.na(auto_max_seqs), "NA", auto_max_seqs), "\n", sep = "")
    }

    subset_info <- make_ref_subset(path2, result_path, seqtab.nochim,
                                   max_seqs = auto_max_seqs, len_band = auto_len_band)
    tax_ref_path <- subset_info$ref_path

    gc()
    taxa_best <- dada2::assignTaxonomy(seqtab.nochim, tax_ref_path,
                                       multithread = FALSE, tryRC = TRUE, minBoot = 30)
    best_na <- mean(is.na(taxa_best))
    cat(sprintf(" - NA fraction: %.1f%%\n", 100 * best_na))

    if (subset_info$used_subset && file.exists(subset_info$ref_path) && subset_info$ref_path != path2) {
      safe_unlink(subset_info$ref_path)
    }

    # Optional addSpecies (if you have a UNITE species assignment file)
    if (nzchar(its_species_path) && file.exists(its_species_path)) {
      cat(" - Adding species with addSpecies()\n")
      taxa_best <- tryCatch(
        dada2::addSpecies(taxa_best, its_species_path),
        error = function(e) {
          warning("addSpecies failed: ", conditionMessage(e))
          taxa_best
        }
      )
    }

    taxa <- taxa_best
    rm(taxa_full, taxa_best); gc()

    # Step 6: phyloseq
    cat("Step 6: Create phyloseq object\n")
    samples <- data.frame(sample = sample.names, sampleid = sample.names, row.names = sample.names)
    ps <- phyloseq::phyloseq(
      phyloseq::otu_table(seqtab.nochim, taxa_are_rows = FALSE),
      phyloseq::tax_table(as.matrix(taxa)),
      phyloseq::sample_data(samples)
    )
    saveRDS(ps, file = file.path(result_path, "phyloseq_object.rds"))

    # Step 7: alpha diversity
    cat("Step 7: Alpha diversity\n")
    alpha_div <- phyloseq::estimate_richness(ps, measures = c("Observed", "Shannon", "Simpson"))
    alpha_div$Chao1 <- phyloseq::estimate_richness(ps, measures = "Chao1")[, 1]
    alpha_div$Goods <- 1 - (rowSums(phyloseq::otu_table(ps) == 1) / pmax(rowSums(phyloseq::otu_table(ps)), 1))
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
      ps_genus <- phyloseq::tax_glom(ps, taxrank = "Genus")
      ps_genus_rel <- phyloseq::transform_sample_counts(ps_genus, function(x) x / sum(x))
      g1 <- phyloseq::plot_bar(ps_genus_rel, fill = "Genus") +
        ggplot2::theme_minimal() +
        ggplot2::theme(axis.text.x = ggplot2::element_text(angle = 90, hjust = 1))
      ggplot2::ggsave(file.path(result_path, "taxa_barplot_genus.png"), g1, width = 10, height = 6)
    }, silent = TRUE)

    # Step 9: Beta diversity
    cat("Step 9: Beta diversity (PCoA Bray-Curtis)\n")
    try({
      ord_bc <- phyloseq::ordinate(ps, method = "PCoA", distance = "bray")
      g2 <- phyloseq::plot_ordination(ps, ord_bc, color = "sample") +
        ggplot2::geom_point(size = 3) +
        ggplot2::theme_minimal()
      ggplot2::ggsave(file.path(result_path, "beta_diversity_pcoa.png"), g2, width = 8, height = 6)
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
      value = c(phyloseq::nsamples(ps), phyloseq::ntaxa(ps), sum(phyloseq::otu_table(ps)))
    )
    write.csv(summary_stats, file.path(result_path, "pipeline_summary_stats.csv"), row.names = FALSE)

    status <- list(
      status = "success",
      message = "ITS pipeline completed successfully",
      pipeline_type = type,
      timestamp = as.character(Sys.time()),
      files_created = c(
        "alpha_diversity_metrics.csv",
        "otu_table.csv",
        "tax_table.csv",
        "sample_metadata.csv",
        "phyloseq_object.rds",
        "taxa_barplot_genus.png",
        "beta_diversity_pcoa.png",
        "pipeline_summary_stats.csv",
        "pipeline_progress.log",
        "pipeline_status.json"
      )
    )
    jsonlite::write_json(status, file.path(result_path, "pipeline_status.json"),
                         auto_unbox = TRUE, pretty = TRUE)

    cat("Output directory:", result_path, "\n")
    cat("========================================\n\n")

    return("ITS pipeline completed successfully.")

  }, error = function(e) {

    msg <- paste0("ITS pipeline failed: ", conditionMessage(e))
    cat("\n❌ ERROR:\n", msg, "\n")

    write_status(result_path, list(
      status = "error",
      message = msg,
      pipeline_type = type,
      timestamp = as.character(Sys.time()),
      hint = "Check pipeline_progress.log for details."
    ))

    stop(e)
  })
}
