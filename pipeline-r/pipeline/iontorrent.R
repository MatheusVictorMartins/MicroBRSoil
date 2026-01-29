default_silva_path <- Sys.getenv(
  "SILVA_REFERENCE_PATH",
  "/app/pipeline-r/references/silva_nr99_v138.1_train_set.fa"
)

run_dada2_pipeline <- function(path1,
                               barcodes_path = NULL,
                               metadata_path = NULL,
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
    library(parallel)
  })
  
  # Ensure vsearch binary path inside worker runtime (do not rely on PATH)
  if (!nzchar(Sys.getenv("VSEARCH_BIN", "")) && file.exists("/app/pipeline-r/vsearch")) {
    Sys.setenv(VSEARCH_BIN = "/app/pipeline-r/vsearch")
  }
  cat("VSEARCH_BIN:", Sys.getenv("VSEARCH_BIN", ""), "\n")
  
  # ==================================================
  # Step 0 — Robust input detection (Ion Torrent)
  # Accepts multiplexed OR demultiplexed FASTQs
  # ==================================================

  cat("Step 0: Detecting input type (multiplexed vs demultiplexed)\n")

  if (is.null(outdir)) {
    outdir <- getwd()
  }
  outdir <- normalizePath(outdir, mustWork = FALSE)

  # Detect whether path1 is file or directory
  input_is_dir <- dir.exists(path1)

  if (input_is_dir) {
    input_dir <- normalizePath(path1)
  } else {
    input_dir <- normalizePath(dirname(path1))
  }

  # List FASTQs safely
  input_fastqs <- list.files(
    input_dir,
    pattern = "\\.(fastq|fq)(\\.gz)?$",
    full.names = TRUE,
    ignore.case = TRUE
  )

  if (length(input_fastqs) == 0) {
    stop("No FASTQ files found in input path: ", input_dir)
  }

  # Decide demultiplexed vs multiplexed
  use_demultiplexed <- FALSE

  if (input_is_dir && length(input_fastqs) >= 1) {
    use_demultiplexed <- TRUE
    cat("  → Input directory with FASTQs detected (demultiplexed data)\n")
  } else if (!input_is_dir && length(input_fastqs) > 1) {
    use_demultiplexed <- TRUE
    cat("  → Multiple FASTQs detected in upload directory (demultiplexed data)\n")
  } else {
    use_demultiplexed <- FALSE
    cat("  → Single FASTQ detected (assumed multiplexed data)\n")
  }

  # Define internal paths
  demux_path <- if (use_demultiplexed) input_dir else file.path(outdir, "demultiplexed")
  filt_path  <- file.path(outdir, "filtered")

  dir.create(outdir, recursive = TRUE, showWarnings = FALSE)
  dir.create(filt_path, recursive = TRUE, showWarnings = FALSE)

  # Safety check for multiplexed data
  if (!use_demultiplexed) {
    dir.create(demux_path, recursive = TRUE, showWarnings = FALSE)

    if (is.null(barcodes_path) || !nzchar(barcodes_path) || !file.exists(barcodes_path)) {
      stop(
        "Multiplexed FASTQ detected, but barcodes_path was not provided or does not exist."
      )
    }
  }

  # Ensure vsearch binary path inside worker runtime (do not rely on PATH)
  if (!nzchar(Sys.getenv("VSEARCH_BIN", "")) && file.exists("/app/pipeline-r/vsearch")) {
    Sys.setenv(VSEARCH_BIN = "/app/pipeline-r/vsearch")
  }
  cat("VSEARCH_BIN:", Sys.getenv("VSEARCH_BIN", ""), "\n")


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

  collect_runtime_info <- function() {
    r_ver <- R.version
    pkg_list <- sessionInfo()$otherPkgs
    pkg_names <- names(pkg_list)
    packages <- lapply(pkg_names, function(pkg) {
      version <- tryCatch(as.character(pkg_list[[pkg]]$Version), error = function(e) NA_character_)
      list(name = pkg, version = version)
    })
    list(
      r_version = paste0(r_ver$major, ".", r_ver$minor),
      r_version_full = r_ver$version.string,
      platform = r_ver$platform,
      os = r_ver$os,
      arch = r_ver$arch,
      packages = packages
    )
  }

  write_runtime_info <- function(outdir, runtime_info) {
    if (is.null(outdir) || !nzchar(outdir)) return(invisible(NULL))
    try(jsonlite::write_json(
      runtime_info,
      file.path(outdir, "pipeline_runtime.json"),
      auto_unbox = TRUE,
      pretty = TRUE
    ), silent = TRUE)
  }

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

  if (!file.exists(path1) && !dir.exists(path1)) {
    stop("Input not found (expected FASTQ file or directory): ", path1)
  }

  result_path <- if (!is.null(outdir)) outdir else file.path(getwd(), "resultados_iontorrent")
  dir.create(result_path, recursive = TRUE, showWarnings = FALSE)

  input_is_dir <- dir.exists(path1)
  input_dir <- if (input_is_dir) normalizePath(path1) else normalizePath(dirname(path1))
  input_fastqs <- list.files(input_dir, pattern = "\\.(fastq|fq)(\\.gz)?$", full.names = TRUE)
  has_multiple_fastqs <- length(input_fastqs) > 1
  use_demultiplexed <- input_is_dir || has_multiple_fastqs

  demux_path <- if (use_demultiplexed) input_dir else file.path(result_path, "demultiplexed")
  filt_path  <- file.path(result_path, "filtered")

  # Safer single-thread mode
  use_multithread <- FALSE

  # Clean previous runs (never delete user's input directory)
  if (!use_demultiplexed && dir.exists(demux_path)) unlink(demux_path, recursive = TRUE, force = TRUE)
  if (dir.exists(filt_path))  unlink(filt_path,  recursive = TRUE, force = TRUE)
  if (!dir.exists(demux_path)) dir.create(demux_path, showWarnings = FALSE, recursive = TRUE)
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
  # Step 0: Input FASTQs
  #   - If we detect multiple FASTQs or a directory: treat as already demultiplexed
  #   - Otherwise, demultiplex by barcode (requires barcodes_path)
  # --------------------------------------------------
  if (use_demultiplexed) {
    if (!input_is_dir) {
      cat("Step 0: Multiple FASTQs detected in upload directory; skipping demultiplexing\n")
    } else {
      cat("Step 0: Using already-demultiplexed FASTQ files from directory\n")
    }
  } else {
    if (is.null(barcodes_path) || !nzchar(barcodes_path) || !file.exists(barcodes_path)) {
      stop("Barcode reference not found or missing. Provide barcodes_path for multiplexed FASTQ input.")
    }
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
  }

  # --------------------------------------------------
  # Step 0.1: List demultiplexed outputs (IMPORTANT)
  # --------------------------------------------------
  fnFs <- list.files(demux_path, pattern = "\\.fastq(\\.gz)?$", full.names = TRUE)
  if (length(fnFs) == 0) stop("No FASTQ files found in: ", demux_path)
  sample.names <- gsub("\\.(fastq|fq)(\\.gz)?$", "", basename(fnFs), ignore.case = TRUE)

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
  # IonTorrent: be more conservative; length != quality (tail often degrades)
  trunc_len_est <- min(250L, max(80L, floor(stats::quantile(lens, 0.85))))
}
if (is.na(trunc_len_est) || trunc_len_est <= 0) trunc_len_est <- 220L

# IonTorrent: slightly more conservative default maxEE
max_ee_est <- if (trunc_len_est >= 220) 2 else 3

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
      trimLeft = as.integer(Sys.getenv("TRIM_LEFT", "22")),
      truncLen = trunc_len_est,
      maxN = 0,
      maxEE = max_ee_est,
      truncQ = 10,      # IonTorrent: trim earlier on low-Q tail
      minLen = 150,     # avoid very short reads (esp. important if truncLen=0 in fallback)
      rm.phix = TRUE,
      compress = TRUE
    )
  ),
  list(
    name = "relaxed_no_trunc",
    args = list(
      trimLeft = as.integer(Sys.getenv("TRIM_LEFT", "22")),    # keep primer/adapter removal consistent
      truncLen = 0,
      maxN = 0,
      maxEE = 5,
      truncQ = 8,       # still trim low-Q tail, but slightly less strict than default
      minLen = 150,
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
errF <- learnErrors(filtFs, multithread = use_multithread, nbases = 5e7)

# --------------------------------------------------
# Step 3: Denoising with DADA2 (Ion Torrent ROBUST)
# --------------------------------------------------
cat("Step 3: Denoising with DADA2 (Ion Torrent ROBUST)\n")

# -----------------------------
# Dereplication
# -----------------------------
derepFs <- derepFastq(filtFs, verbose = TRUE)
names(derepFs) <- sample.names

cat("  Dereplication completed for", length(derepFs), "samples\n")

# -----------------------------
# DADA denoising (STRICTLY SEQUENTIAL)
# -----------------------------
dadaFs <- list()

for (i in seq_along(derepFs)) {
  sname <- names(derepFs)[i]
  cat("  Denoising sample:", sname, "\n")

  dd <- tryCatch(
    dada(
      derepFs[[i]],
      err = errF,
      selfConsist = TRUE,
      multithread = FALSE
    ),
    error = function(e) {
      warning("DADA failed for sample ", sname, ": ", e$message)
      NULL
    }
  )

  # HARD validation (Ion Torrent safe)
  if (
    !is.null(dd) &&
    inherits(dd, "dada") &&
    !is.null(dd$denoised) &&
    length(dd$denoised) > 0
  ) {
    dadaFs[[sname]] <- dd
  } else {
    warning("Sample ", sname, " removed: invalid DADA result")
  }
}

# -----------------------------
# Post-denoising validation
# -----------------------------
if (length(dadaFs) < 2) {
  stop(
    "Less than 2 samples survived denoising.\n",
    "Ion Torrent error model may be too strict or read depth too low.\n",
    "Consider increasing maxEE, reducing truncLen, or skipping truncation."
  )
}

cat("  Samples retained after denoising:", length(dadaFs), "\n")

sample.names <- names(dadaFs)

# -----------------------------
# Build sequence table (SAFE)
# -----------------------------
seqtab <- makeSequenceTable(dadaFs)

cat(
  "  Sequence table constructed:",
  nrow(seqtab),
  "samples x",
  ncol(seqtab),
  "ASVs\n"
)

  # --------------------------------------------------
  # Step 4: Sequence table and chimera removal
  # --------------------------------------------------
  cat("Step 4: Sequence table and chimera removal\n")
  seqtab <- makeSequenceTable(dadaFs)
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = use_multithread)
  rownames(seqtab.nochim) <- sample.names

# --------------------------------------------------
# Step 5: Taxonomy assignment (vsearch) - FIXED + produces tax_table.csv reliably
# Step 6: Create phyloseq object (uses the same rank names as Step 5)
# --------------------------------------------------
cat("Step 5: Taxonomy assignment (vsearch)\n")

stopifnot(!is.null(path2), file.exists(path2))
stopifnot(dir.exists(result_path))

# threads
n_cores_tax <- if (isTRUE(use_multithread)) min(8, max(1, parallel::detectCores() - 2)) else 1
cat("  Taxonomy threads:", n_cores_tax, "\n")

# vsearch binary (robust)
v_bin <- Sys.getenv("VSEARCH_BIN", "")
if (!nzchar(v_bin) && file.exists("/app/pipeline-r/vsearch")) v_bin <- "/app/pipeline-r/vsearch"
if (!nzchar(v_bin)) v_bin <- Sys.which("vsearch")
cat("  vsearch binary:", v_bin, "\n")
stopifnot(nzchar(v_bin), file.exists(v_bin))
if (file.access(v_bin, 1) != 0) stop("vsearch exists but is not executable: ", v_bin, " (chmod +x)")

# --------------------------------------------------
# Helpers
# --------------------------------------------------
TAX_RANKS <- c("Kingdom","Phylum","Class","Order","Family","Genus","Species")

parse_tax_to_matrix <- function(tax_strings) {
  out <- matrix(NA_character_, nrow = length(tax_strings), ncol = length(TAX_RANKS),
                dimnames = list(NULL, TAX_RANKS))
  tax_strings[is.na(tax_strings)] <- NA_character_
  spl <- strsplit(tax_strings, ";", fixed = TRUE)

  for (i in seq_along(spl)) {
    parts <- trimws(spl[[i]])
    parts <- parts[nzchar(parts)]
    if (!length(parts)) next
    parts <- parts[seq_len(min(length(TAX_RANKS), length(parts)))]
    out[i, seq_along(parts)] <- parts
  }
  out
}

#build_ref_from_trainset <- function(train_fa, ref_fa_out, tax_tsv_out) {
#  in_con <- file(train_fa, "r")
#  fa_con <- file(ref_fa_out, "w")
#  tx_con <- file(tax_tsv_out, "w")
#  on.exit({
#    try(close(in_con), silent = TRUE)
#    try(close(fa_con), silent = TRUE)
#    try(close(tx_con), silent = TRUE)
#  }, add = TRUE)
#
#  writeLines("FeatureID\tTaxon", tx_con)
#
#  i <- 0L
#  repeat {
#    l <- readLines(in_con, n = 1L)
#    if (!length(l)) break
#    if (startsWith(l, ">")) {
#      i <- i + 1L
#      id <- paste0("REF_", i)
#      tax <- trimws(sub("^>", "", l))
#      writeLines(paste0(">", id), fa_con)
#      writeLines(paste(id, tax, sep = "\t"), tx_con)
#    } else {
#      writeLines(l, fa_con)
#    }
#  }
#  if (i == 0) stop("Reference train_set FASTA appears empty: ", train_fa)
#  i
#}

write_query_fasta <- function(asv_seqs, query_fa_out) {
  q_ids <- paste0("ASV_", seq_along(asv_seqs))
  con <- file(query_fa_out, "w")
  on.exit(try(close(con), silent = TRUE), add = TRUE)
  for (i in seq_along(asv_seqs)) {
    writeLines(paste0(">", q_ids[i]), con)
    writeLines(asv_seqs[i], con)
  }
  q_ids
}

# --------------------------------------------------
# Step 5: Run vsearch taxonomy -> produces `taxa` + writes tax_table.csv
# --------------------------------------------------
taxa <- tryCatch({

  ref_fa   <- "/app/pipeline-r/references/silva_v138_vsearch.fa"
  ref_tax  <- "/app/pipeline-r/references/silva_v138_vsearch.tsv"
  query_fa <- file.path(result_path, "vsearch_query.fasta")
  blast6   <- file.path(result_path, "vsearch_hits.blast6")
  vlog     <- file.path(result_path, "vsearch_run.log")
  out_tax_table_csv <- file.path(result_path, "tax_table.csv")

# sanity checks (important)
  stopifnot(file.exists(ref_fa))
  stopifnot(file.exists(ref_tax))

  cat("  Using vsearch reference:", ref_fa, "\n")
  cat("  Using vsearch taxonomy :", ref_tax, "\n")

  # ASVs (DNA strings) from DADA2
  asv_seqs <- colnames(seqtab.nochim)
  if (is.null(asv_seqs) || length(asv_seqs) == 0) stop("No ASVs found in colnames(seqtab.nochim)")

  cat(sprintf("  ASV length: min=%d median=%d max=%d\n",
              min(nchar(asv_seqs)), stats::median(nchar(asv_seqs)), max(nchar(asv_seqs))))

  # Write query fasta (ASV_# -> DNA sequence)
  q_ids <- write_query_fasta(asv_seqs, query_fa)
  cat("  Query fasta bytes:", file.info(query_fa)$size, "\n")

  # Run vsearch (IonTorrent-friendly defaults)
  if (file.exists(blast6)) file.remove(blast6)
  if (file.exists(vlog)) file.remove(vlog)

  args <- c(
    "--usearch_global", query_fa,
    "--db", ref_fa,
    "--strand", "both",
    "--iddef", "2",          # identity based on alignment (Ion Torrent safe)
    "--id", "0.90",          # relaxed identity (handles indels)
    "--query_cov", "0.78",   # tolerant to trimmed reads
    "--mincols", "128",      # avoids short spurious hits
    "--top_hits_only",
    "--maxaccepts", "1",
    "--maxrejects", "64",
    "--maxhits", "1",
    "--blast6out", blast6,
    "--threads", as.character(n_cores_tax)
  )

  vmsg <- system2(v_bin, args = args, stdout = TRUE, stderr = TRUE)
  writeLines(c(paste0("CMD: ", paste(c(v_bin, args), collapse = " ")), vmsg), vlog)

  if (!file.exists(blast6) || file.info(blast6)$size == 0) {
    stop("vsearch produced no hits. See: ", vlog)
  }
  cat("  BLAST6 bytes:", file.info(blast6)$size, "\n")

  # Read hits (best hit per query id)
  hits <- utils::read.table(blast6, sep = "\t", stringsAsFactors = FALSE,
                            quote = "", comment.char = "", fill = TRUE)
  if (ncol(hits) < 2) stop("Unexpected BLAST6 output (qid,sid missing)")
  colnames(hits)[1:2] <- c("qid","sid")
  hits <- hits[!duplicated(hits$qid), c("qid","sid"), drop = FALSE]
  cat(sprintf("  vsearch hits: %d / %d ASVs\n", nrow(hits), length(asv_seqs)))

  # Read ref taxonomy map (REF -> Taxon string)
  ref_tab <- utils::read.table(ref_tax, sep = "\t", header = TRUE, stringsAsFactors = FALSE,
                               quote = "", comment.char = "")
  
  # Normalize reference IDs (QIIME2 SILVA fix)
  ref_tab$FeatureID <- gsub("^silva_\\d+_", "", ref_tab$FeatureID)
  tax_map <- setNames(ref_tab$Taxon, ref_tab$FeatureID)

  # Normalize subject IDs from vsearch
  hits$sid <- gsub("^silva_\\d+_", "", hits$sid)

  # Map ASV_# -> REF_# -> tax string (keep order of ASVs)
  sid_by_qid <- setNames(hits$sid, hits$qid)
  best_sid <- unname(sid_by_qid[q_ids])
  tax_str <- unname(tax_map[best_sid])

  cat(sprintf("  ASVs mapped to taxonomy: %.1f%%\n",
              100 * mean(!is.na(tax_str))))

  # --------------------------------------------------
  # FAIL-SAFE: stop if taxonomy completely failed
  # --------------------------------------------------
  if (all(is.na(tax_str))) {
    stop("All ASVs failed taxonomy mapping (check SILVA ID normalization and vsearch params).")
  }

  # Build taxa matrix with rownames = DNA sequences (phyloseq expects taxa names = OTU/ASV names)
  taxa_mat <- matrix(NA_character_, nrow = length(asv_seqs), ncol = length(TAX_RANKS),
                     dimnames = list(asv_seqs, TAX_RANKS))
  taxa_mat[,] <- parse_tax_to_matrix(tax_str)

  # Write tax_table.csv (FeatureID is the DNA sequence; matches your manual reconstruction)
  tax_df <- data.frame(
    FeatureID = asv_seqs,
    taxa_mat,
    stringsAsFactors = FALSE,
    check.names = FALSE
  )
  utils::write.csv(tax_df, out_tax_table_csv, row.names = FALSE, quote = TRUE)

  taxa_mat

}, error = function(e) {
  warning("Taxonomy assignment failed: ", e$message)

  matrix(
    NA_character_,
    nrow = ncol(seqtab.nochim),
    ncol = length(TAX_RANKS),
    dimnames = list(colnames(seqtab.nochim), TAX_RANKS)
  )
})

# --------------------------------------------------
# Rank coverage summary (same behavior as before)
# --------------------------------------------------
numer_of_taxa_assigned_by_rank <- tryCatch({
  colSums(!is.na(taxa))
}, error = function(e) NULL)

rank_name <- "Genus"
if (!is.null(numer_of_taxa_assigned_by_rank) && length(numer_of_taxa_assigned_by_rank) > 0) {
  idx <- tail(which(numer_of_taxa_assigned_by_rank >= 2), 1)
  if (!length(idx)) idx <- which.max(numer_of_taxa_assigned_by_rank)
  rank_name <- names(numer_of_taxa_assigned_by_rank)[idx]
}
cat("Rank chosen to plot:", rank_name, "\n")

# --------------------------------------------------
# Step 6: Create phyloseq object (FIXED)
#   - guarantees taxa rownames match OTU table taxa names (ASV DNA sequences)
#   - uses the same rank names (Kingdom..Species)
# --------------------------------------------------
cat("Step 6: Create phyloseq object\n")

# Sample data
samples <- data.frame(sample = sample.names, sampleid = sample.names, row.names = sample.names)

# IMPORTANT: make sure the OTU table taxa names match taxa rownames
# Here OTU taxa are ASV DNA sequences in colnames(seqtab.nochim)
otu <- otu_table(seqtab.nochim, taxa_are_rows = FALSE)

# Ensure taxa matrix rownames align to OTU taxa names
tax_mat <- as.matrix(taxa)
if (!all(taxa_names(otu) %in% rownames(tax_mat))) {
  warning("Some OTU taxa names are missing in taxonomy table. Filling missing rows with NA.")
  missing <- setdiff(taxa_names(otu), rownames(tax_mat))
  if (length(missing) > 0) {
    add <- matrix(NA_character_, nrow = length(missing), ncol = ncol(tax_mat),
                  dimnames = list(missing, colnames(tax_mat)))
    tax_mat <- rbind(tax_mat, add)
  }
}
tax_mat <- tax_mat[taxa_names(otu), , drop = FALSE]

ps <- phyloseq(
  otu,
  tax_table(tax_mat),
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
# Step 8: Taxonomic barplot (Top 30 + Others, better palette, no cropping)
# --------------------------------------------------
cat("Step 8: Taxonomic barplot\n")
try({

  # Helper: keep top N taxa (by mean relative abundance), group rest as "Others"
  collapse_topN <- function(ps_obj, taxrank = "Genus", topN = 30, others_label = "Others") {
    ps_glom <- tax_glom(ps_obj, taxrank = taxrank, NArm = FALSE)

    # relative abundance per sample
    ps_rel <- transform_sample_counts(ps_glom, function(x) if (sum(x) > 0) x / sum(x) else x)

    # compute mean rel. abundance across samples for each taxon
    otu_mat <- as(otu_table(ps_rel), "matrix")
    if (!taxa_are_rows(ps_rel)) otu_mat <- t(otu_mat)
    mean_abund <- rowMeans(otu_mat, na.rm = TRUE)

    top_taxa <- names(sort(mean_abund, decreasing = TRUE))[seq_len(min(topN, length(mean_abund)))]
    ps_top <- prune_taxa(top_taxa, ps_rel)
    ps_oth <- prune_taxa(setdiff(taxa_names(ps_rel), top_taxa), ps_rel)

    # merge Others into a single taxon
    if (ntaxa(ps_oth) > 0) {
      oth_counts <- colSums(as(otu_table(ps_oth), "matrix"))
      if (taxa_are_rows(ps_oth)) {
        oth_counts <- rowSums(as(otu_table(ps_oth), "matrix"))
      }
      # Build a minimal phyloseq object for Others with same samples
      oth_otu <- matrix(0, nrow = 1, ncol = nsamples(ps_rel),
                        dimnames = list(others_label, sample_names(ps_rel)))
      if (taxa_are_rows(ps_rel)) {
        oth_otu[1, ] <- colSums(as(otu_table(ps_oth), "matrix"))
        oth_otu <- otu_table(oth_otu, taxa_are_rows = TRUE)
      } else {
        oth_otu[1, ] <- rowSums(as(otu_table(ps_oth), "matrix"))
        oth_otu <- otu_table(t(oth_otu), taxa_are_rows = FALSE)
      }

      # tax table row for Others
      taxm <- as(tax_table(ps_rel), "matrix")
      oth_tax <- matrix(NA_character_, nrow = 1, ncol = ncol(taxm),
                        dimnames = list(others_label, colnames(taxm)))
      if (taxrank %in% colnames(oth_tax)) oth_tax[1, taxrank] <- others_label
      oth_tax <- tax_table(oth_tax)

      ps_others <- phyloseq(oth_otu, oth_tax, sample_data(ps_rel))
      ps_rel <- merge_phyloseq(ps_top, ps_others)
    } else {
      ps_rel <- ps_top
    }

    # Ensure the rank column exists and set NA to "Unassigned"
    tx <- as(tax_table(ps_rel), "matrix")
    if (!(taxrank %in% colnames(tx))) stop("taxrank not found in tax_table: ", taxrank)
    tx[, taxrank] <- ifelse(is.na(tx[, taxrank]) | tx[, taxrank] == "", "Unassigned", tx[, taxrank])
    tax_table(ps_rel) <- tax_table(tx)

    ps_rel
  }

  # Better, high-contrast discrete palette (30+ colors)
  # (Okabe-Ito inspired + extended; stable + readable)
  better_palette <- function(n) {
    base <- c(
      "#1b9e77","#d95f02","#7570b3","#e7298a","#66a61e","#e6ab02",
      "#a6761d","#666666","#377eb8","#4daf4a","#984ea3","#ff7f00",
      "#a6cee3","#b2df8a","#fb9a99","#fdbf6f","#cab2d6","#ffff99",
      "#b15928","#8dd3c7","#ffffb3","#bebada","#fb8072","#80b1d3",
      "#fdb462","#b3de69","#fccde5","#d9d9d9","#bc80bd","#ccebc5",
      "#ffed6f","#7fc97f","#beaed4","#fdc086","#386cb0","#f0027f"
    )
    if (n <= length(base)) return(base[seq_len(n)])
    grDevices::colorRampPalette(base)(n)
  }

  # ---------- Genus: Top 30 + Others ----------
  ps_genus_rel_top <- collapse_topN(ps, taxrank = "Genus", topN = 30, others_label = "Others")

  n_gen <- length(unique(as(tax_table(ps_genus_rel_top), "matrix")[, "Genus"]))
  g1 <- plot_bar(ps_genus_rel_top, x = "sample", fill = "Genus") +
    theme_minimal(base_size = 11) +
    theme(
      axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5),
      plot.margin = margin(10, 25, 10, 10),     # avoid cropping
      legend.position = "right",
      legend.text = element_text(size = 8),
      legend.title = element_text(size = 9)
    ) +
    guides(fill = guide_legend(ncol = 1)) +
    scale_fill_manual(values = better_palette(n_gen))

  # Increase width to prevent x labels/legend cropping
  ggsave(file.path(result_path, "taxa_barplot_genus.png"),
         g1, width = 14, height = 7, dpi = 300, limitsize = FALSE)

  # ---------- Best-covered rank (rank_name): Top 30 + Others ----------
  ps_rank_rel_top <- collapse_topN(ps, taxrank = rank_name, topN = 30, others_label = "Others")

  # number of groups for palette
  tx_rank <- as(tax_table(ps_rank_rel_top), "matrix")
  n_rank <- length(unique(tx_rank[, rank_name]))

  g_rank <- plot_bar(ps_rank_rel_top, x = "sample", fill = rank_name) +
    theme_minimal(base_size = 11) +
    theme(
      axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5),
      plot.margin = margin(10, 25, 10, 10),
      legend.position = "right",
      legend.text = element_text(size = 8),
      legend.title = element_text(size = 9)
    ) +
    guides(fill = guide_legend(ncol = 1)) +
    scale_fill_manual(values = better_palette(n_rank))

  ggsave(file.path(result_path, "taxa_barplot.png"),
         g_rank, width = 14, height = 7, dpi = 300, limitsize = FALSE)

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

  runtime_info <- collect_runtime_info()
  write_runtime_info(result_path, runtime_info)

  cat("Runtime info:\n")
  cat("R:", runtime_info$r_version_full, "\n")
  if (length(runtime_info$packages) > 0) {
    cat("Packages:\n")
    for (pkg in runtime_info$packages) {
      cat(" -", pkg$name, pkg$version, "\n")
    }
  }

  status <- list(
    status = "success",
    message = "Pipeline completed successfully",
    pipeline_type = type,
    timestamp = Sys.time(),
    runtime = runtime_info,
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
      "pipeline_runtime.json",
      "pipeline_summary_stats.csv"
    )
  )
  jsonlite::write_json(status, file.path(result_path, "pipeline_status.json"), auto_unbox = TRUE, pretty = TRUE)

  cat("Output directory:", result_path, "\n")
  cat("========================================\n\n")
  return("Pipeline completed successfully.")
}
