run_dada2_pipeline <- function(path1, path2 = "/app/pipeline-r/references/silva_nr99_v138.1_train_set.fa", outdir = NULL, type = "illumina") {
  # Carregar pacotes necessários
  library(dada2)
  library(phyloseq)
  library(ggplot2)
  library(vegan)
  library(microbiome)
  
  # Load jsonlite for JSON export (install if needed)
  if (!require(jsonlite, quietly = TRUE)) {
    install.packages("jsonlite")
    library(jsonlite)
  }

  # Initialize error logging
  cat("\n========================================\n")
  cat("Starting Illumina DADA2 Pipeline\n")
  cat("========================================\n")
  cat("Timestamp:", as.character(Sys.time()), "\n\n")

  # Diretório base onde estão os arquivos FASTQ
  path <- dirname(path1)
  fnFs <- sort(list.files(path, pattern = "_R1_001.fastq.gz", full.names = TRUE))
  fnRs <- sort(list.files(path, pattern = "_R2_001.fastq.gz", full.names = TRUE))
  
  if (length(fnFs) == 0 || length(fnRs) == 0) {
    stop("No FASTQ files found matching pattern _R1_001.fastq.gz and _R2_001.fastq.gz")
  }
  
  sample.names <- sapply(strsplit(basename(fnFs), "_"), `[`, 1)
  cat("Found", length(fnFs), "sample pairs\n")
  cat("Sample names:", paste(sample.names, collapse = ", "), "\n\n")

  # Diretório raiz de resultados  
  result_path <- if (!is.null(outdir)) outdir else file.path(getwd(), "resultados")
  dir.create(result_path, showWarnings = FALSE, recursive = TRUE)

  # Subpasta de arquivos filtrados
  filt_path <- file.path(result_path, "filtered")
  dir.create(filt_path, showWarnings = FALSE, recursive = TRUE)
  filtFs <- file.path(filt_path, paste0(sample.names, "_F_filt.fastq.gz"))
  filtRs <- file.path(filt_path, paste0(sample.names, "_R_filt.fastq.gz"))

  # Filtro e trimagem - adjusted parameters for better merging
  # For paired-end Illumina 2x250 or 2x300, typical settings:
  # truncLen should leave enough overlap (recommended: ~20-50bp)
  cat("Step 1: Filtering and Trimming\n")
  cat("Truncation lengths: Forward=240, Reverse=200\n")
  cat("This allows ~10-40bp overlap for merging (assuming 250-300bp amplicons)\n\n")
  
  out <- filterAndTrim(fnFs, filtFs, fnRs, filtRs,
                       truncLen = c(240, 200),  # Increased reverse length for better overlap
                       maxN = 0, maxEE = c(2, 2), truncQ = 2,
                       rm.phix = TRUE, compress = TRUE, multithread = TRUE)
  
  # Log filtering results
  cat("Filtering results:\n")
  print(out)
  cat("\n")

  
  # Log filtering results
  cat("Filtering results:\n")
  print(out)
  cat("\n")

  # Check if any samples were completely filtered out
  filtered_samples <- out[,"reads.out"] > 0
  if (sum(filtered_samples) == 0) {
    stop("All samples were filtered out. Check filtering parameters and input quality.")
  }
  
  # Update file lists and sample names to only include successfully filtered samples
  if (sum(filtered_samples) < length(filtFs)) {
    n_removed <- length(filtFs) - sum(filtered_samples)
    cat("WARNING: Removing", n_removed, "sample(s) that were completely filtered out\n")
    filtFs <- filtFs[filtered_samples]
    filtRs <- filtRs[filtered_samples]
    sample.names <- sample.names[filtered_samples]
    cat("Remaining samples:", paste(sample.names, collapse = ", "), "\n\n")
  }
  
  # Calculate and log retention rates
  retention_rates <- out[filtered_samples, "reads.out"] / out[filtered_samples, "reads.in"] * 100
  cat("Read retention rates (%):\n")
  for (i in seq_along(sample.names)) {
    cat(sprintf("  %s: %.1f%% (%d -> %d reads)\n", 
                sample.names[i], 
                retention_rates[i],
                out[filtered_samples, "reads.in"][i],
                out[filtered_samples, "reads.out"][i]))
  }
  cat("\n")

  # Aprendizado de erro
  cat("Step 2: Learning error rates\n")
  errF <- learnErrors(filtFs, multithread = TRUE)
  errR <- learnErrors(filtRs, multithread = TRUE)
  cat("Error learning completed\n\n")

  # Inferência
  cat("Step 3: Sample inference (dereplication and denoising)\n")
  derepFs <- derepFastq(filtFs, verbose = TRUE)
  derepRs <- derepFastq(filtRs, verbose = TRUE)
  # Ensure derep objects have consistent names
  names(derepFs) <- sample.names
  names(derepRs) <- sample.names
  
  # Debug: Print sample names to verify consistency
  cat("Sample names:", paste(sample.names, collapse = ", "), "\n")
  cat("derepFs names:", paste(names(derepFs), collapse = ", "), "\n")
  cat("derepRs names:", paste(names(derepRs), collapse = ", "), "\n\n")
  
  dadaFs <- dada(derepFs, err = errF, multithread = TRUE)
  dadaRs <- dada(derepRs, err = errR, multithread = TRUE)
  cat("Denoising completed\n\n")

  # Mesclagem with improved logging
  cat("Step 4: Merging paired-end reads\n")
  cat("Note: Merging requires sufficient overlap between forward and reverse reads\n")
  cat("Checking merge parameters...\n\n")
  
  mergers <- mergePairs(dadaFs, derepFs, dadaRs, derepRs, verbose = TRUE, minOverlap = 12, maxMismatch = 0)
  # Ensure consistent sample names across all objects
  names(mergers) <- sample.names
  
  # Calculate and log merge rates
  merge_rates <- sapply(mergers, function(m) {
    if (is.data.frame(m) && nrow(m) > 0) {
      return(sum(m$abundance) / sum(dadaFs[[1]]$denoised) * 100)
    } else {
      return(0)
    }
  })
  
  cat("\nMerge success rates:\n")
  for (i in seq_along(sample.names)) {
    n_merged <- if(is.data.frame(mergers[[i]])) sum(mergers[[i]]$abundance) else 0
    cat(sprintf("  %s: %.1f%% merged (%d sequences)\n", 
                sample.names[i], 
                merge_rates[i],
                n_merged))
  }
  
  avg_merge_rate <- mean(merge_rates)
  cat(sprintf("\nAverage merge rate: %.1f%%\n", avg_merge_rate))
  
  if (avg_merge_rate < 10) {
    warning("VERY LOW merge rate (<10%). Consider:\n",
            "  1. Adjusting truncLen to allow more overlap\n",
            "  2. Checking if amplicon length matches expected size\n",
            "  3. Verifying read quality and orientation\n")
  } else if (avg_merge_rate < 50) {
    warning("Low merge rate (<50%). Results may be suboptimal.\n")
  }
  cat("\n")

  cat("\n")

  # Tabela de sequência
  cat("Step 5: Creating sequence table and removing chimeras\n")
  seqtab <- makeSequenceTable(mergers)
  cat("Sequence table dimensions before chimera removal:", dim(seqtab), "\n")
  
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = TRUE)
  cat("Sequence table dimensions after chimera removal:", dim(seqtab.nochim), "\n")
  
  chimera_fraction <- 1 - (sum(seqtab.nochim) / sum(seqtab))
  cat(sprintf("Chimeras removed: %.1f%% of sequences\n\n", chimera_fraction * 100))
  
  # Ensure row names match sample.names consistently
  rownames(seqtab.nochim) <- sample.names

  # Atribuição taxonômica
  cat("Step 6: Taxonomic assignment\n")
  cat("Reference database:", path2, "\n")
  taxa <- assignTaxonomy(seqtab.nochim, path2, multithread = TRUE)
  cat("Taxonomic assignment completed\n\n")

  # Criar phyloseq with metadata validation
  cat("Step 7: Creating phyloseq object\n")
  seqtab.nochim <- as.matrix(seqtab.nochim)
  taxa <- as.matrix(taxa)
  
  # Create sample metadata
  # Check if metadata file exists, otherwise create minimal metadata
  metadata_file <- file.path(dirname(path), "metadata.csv")
  
  if (file.exists(metadata_file)) {
    cat("Loading metadata from:", metadata_file, "\n")
    tryCatch({
      metadata <- read.csv(metadata_file, row.names = 1)
      
      # Validate metadata has samples
      if (nrow(metadata) == 0) {
        warning("Metadata file is empty. Using minimal metadata.\n")
        samples <- data.frame(
          SampleID = sample.names,
          row.names = sample.names
        )
      } else {
        # Ensure metadata samples match sequence table samples
        missing_samples <- setdiff(sample.names, rownames(metadata))
        if (length(missing_samples) > 0) {
          warning("Some samples missing from metadata: ", paste(missing_samples, collapse = ", "), "\n")
          warning("Adding missing samples with NA values\n")
          # Add missing samples with NA
          for (s in missing_samples) {
            metadata[s, ] <- NA
          }
        }
        
        # Subset and reorder metadata to match samples
        samples <- metadata[sample.names, , drop = FALSE]
        
        # Log metadata columns
        cat("Metadata columns:", paste(colnames(samples), collapse = ", "), "\n")
        cat("Metadata dimensions:", nrow(samples), "x", ncol(samples), "\n\n")
      }
    }, error = function(e) {
      warning("Error loading metadata: ", e$message, "\n")
      warning("Using minimal metadata\n")
      samples <<- data.frame(
        SampleID = sample.names,
        row.names = sample.names
      )
    })
  } else {
    cat("No metadata file found. Creating minimal metadata.\n")
    samples <- data.frame(
      SampleID = sample.names,
      row.names = sample.names
    )
  }
  
  # Verify that all sample names match before creating phyloseq object
  if (!all(rownames(seqtab.nochim) == rownames(samples))) {
    warning("Sample names don't match between OTU table and sample data. Fixing...")
    rownames(seqtab.nochim) <- sample.names
  }
  
  # Create phyloseq object with error handling
  tryCatch({
    ps <- phyloseq(
      otu_table(seqtab.nochim, taxa_are_rows = FALSE),
      tax_table(taxa),
      sample_data(samples)
    )
    cat("Phyloseq object created successfully\n")
    cat("  OTU table:", ntaxa(ps), "taxa x", nsamples(ps), "samples\n")
    cat("  Sample data:", nrow(sample_data(ps)), "samples x", ncol(sample_data(ps)), "variables\n\n")
  }, error = function(e) {
    stop("Failed to create phyloseq object: ", e$message)
  })

  # Salvar objeto phyloseq
  saveRDS(ps, file = file.path(result_path, "phyloseq_object.rds"))
  cat("Saved phyloseq object to: phyloseq_object.rds\n\n")

  # Salvar objeto phyloseq
  saveRDS(ps, file = file.path(result_path, "phyloseq_object.rds"))
  cat("Saved phyloseq object to: phyloseq_object.rds\n\n")

  # Diversidade alfa with singleton and edge case handling
  cat("Step 8: Alpha diversity estimation\n")
  
  tryCatch({
    # Check if we have enough data for richness estimation
    otu_matrix <- as.matrix(otu_table(ps))
    total_reads <- sum(otu_matrix)
    n_taxa <- ntaxa(ps)
    
    cat("Total reads in OTU table:", total_reads, "\n")
    cat("Number of unique taxa:", n_taxa, "\n")
    
    if (total_reads == 0 || n_taxa == 0) {
      warning("No reads or taxa remaining after filtering. Skipping alpha diversity.\n")
      alpha_div <- data.frame(
        Sample = sample.names,
        Observed = 0,
        Shannon = NA,
        Simpson = NA,
        Chao1 = NA,
        Goods = NA,
        row.names = sample.names
      )
    } else {
      # Count singletons per sample
      singletons_per_sample <- rowSums(otu_matrix == 1)
      cat("Singletons per sample:", paste(singletons_per_sample, collapse = ", "), "\n")
      
      # Estimate richness
      alpha_div <- estimate_richness(ps, measures = c("Observed", "Shannon", "Simpson"))
      
      # Only calculate Chao1 if singletons exist
      has_singletons <- any(singletons_per_sample > 0)
      if (has_singletons) {
        alpha_div$Chao1 <- estimate_richness(ps, measures = "Chao1")[, 1]
      } else {
        warning("No singletons detected. Chao1 estimation may be unreliable.\n")
        alpha_div$Chao1 <- alpha_div$Observed  # Fallback to observed richness
      }
      
      # Calculate Good's coverage
      alpha_div$Goods <- 1 - (rowSums(otu_table(ps) == 1) / rowSums(otu_table(ps)))
      
      cat("Alpha diversity calculated successfully\n")
    }
    
    write.csv(alpha_div, file.path(result_path, "alpha_diversity_metrics.csv"))
    cat("Saved alpha diversity to: alpha_diversity_metrics.csv\n\n")
    
  }, error = function(e) {
    warning("Alpha diversity estimation failed: ", e$message, "\n")
    warning("Creating empty alpha diversity file\n")
    alpha_div <- data.frame(
      Sample = sample.names,
      Observed = NA,
      Shannon = NA,
      Simpson = NA,
      Chao1 = NA,
      Goods = NA,
      row.names = sample.names
    )
    write.csv(alpha_div, file.path(result_path, "alpha_diversity_metrics.csv"))
  })

  # Barplot da composição taxonômica no nível de Gênero with error handling
  cat("Step 9: Creating taxonomic composition plots\n")
  
  tryCatch({
    ps_genus <- tax_glom(ps, taxrank = "Genus", NArm = TRUE)
    ps_genus_rel <- transform_sample_counts(ps_genus, function(x) x / sum(x))
    
    # Use modern ggplot2 syntax (not aes_string)
    g1 <- plot_bar(ps_genus_rel, fill = "Genus") +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5)) +
      labs(title = "Taxonomic Composition at Genus Level",
           x = "Sample",
           y = "Relative Abundance")
    
    ggsave(file.path(result_path, "taxa_barplot_genus.png"), g1, width = 10, height = 6)
    cat("Saved taxonomic barplot to: taxa_barplot_genus.png\n")
  }, error = function(e) {
    warning("Failed to create taxonomic barplot: ", e$message, "\n")
    warning("This may be due to missing taxonomic assignments or insufficient data\n")
  })
  cat("\n")

  # Diversidade beta (Bray-Curtis com PCoA) with covariate handling
  cat("Step 10: Beta diversity analysis\n")
  
  tryCatch({
    ord_bc <- ordinate(ps, method = "PCoA", distance = "bray")
    
    # Check for covariates in sample data
    sample_vars <- colnames(sample_data(ps))
    cat("Available sample variables:", paste(sample_vars, collapse = ", "), "\n")
    
    # Determine which variable to use for coloring
    # Priority: Treatment > Condition > Group > SampleID > none
    color_var <- NULL
    for (var_name in c("Treatment", "Condition", "Group", "Site", "Location")) {
      if (var_name %in% sample_vars) {
        color_var <- var_name
        break
      }
    }
    
    if (is.null(color_var) && "SampleID" %in% sample_vars) {
      color_var <- "SampleID"
    }
    
    # Create plot with or without color mapping
    if (!is.null(color_var)) {
      cat("Coloring plot by:", color_var, "\n")
      # Use modern tidy-eval syntax instead of aes_string
      g2 <- plot_ordination(ps, ord_bc, color = color_var) +
        geom_point(size = 3) +
        theme_minimal() +
        labs(title = "Beta Diversity (PCoA - Bray-Curtis)",
             caption = paste("Colored by", color_var))
    } else {
      cat("No grouping variable found. Creating uncolored plot.\n")
      g2 <- plot_ordination(ps, ord_bc) +
        geom_point(size = 3, color = "steelblue") +
        theme_minimal() +
        labs(title = "Beta Diversity (PCoA - Bray-Curtis)")
    }
    
    ggsave(file.path(result_path, "beta_diversity_pcoa.png"), g2, width = 8, height = 6)
    cat("Saved beta diversity plot to: beta_diversity_pcoa.png\n")
  }, error = function(e) {
    warning("Failed to create beta diversity plot: ", e$message, "\n")
    warning("This may be due to insufficient samples or distance calculation issues\n")
  })
  cat("\n")

  cat("\n")

  # === Exportações adicionais ===
  cat("Step 11: Exporting results\n")
  
  tryCatch({
    write.csv(as.data.frame(otu_table(ps)), file.path(result_path, "otu_table.csv"))
    cat("Exported: otu_table.csv\n")
  }, error = function(e) {
    warning("Failed to export OTU table: ", e$message, "\n")
  })
  
  tryCatch({
    write.csv(as.data.frame(tax_table(ps)), file.path(result_path, "tax_table.csv"))
    cat("Exported: tax_table.csv\n")
  }, error = function(e) {
    warning("Failed to export taxonomy table: ", e$message, "\n")
  })
  
  tryCatch({
    write.csv(as.data.frame(sample_data(ps)), file.path(result_path, "sample_metadata.csv"))
    cat("Exported: sample_metadata.csv\n")
  }, error = function(e) {
    warning("Failed to export sample metadata: ", e$message, "\n")
  })
  
  # Export summary statistics
  summary_stats <- data.frame(
    metric = c(
      "total_samples",
      "total_taxa",
      "total_reads",
      "avg_reads_per_sample",
      "avg_taxa_per_sample",
      "avg_merge_rate_pct",
      "chimera_fraction_pct"
    ),
    value = c(
      nsamples(ps),
      ntaxa(ps),
      sum(otu_table(ps)),
      mean(rowSums(otu_table(ps))),
      mean(rowSums(otu_table(ps) > 0)),
      avg_merge_rate,
      chimera_fraction * 100
    )
  )
  write.csv(summary_stats, file.path(result_path, "pipeline_summary_stats.csv"), row.names = FALSE)
  cat("Exported: pipeline_summary_stats.csv\n\n")

  # Create success status file to indicate pipeline completed without errors
  cat("Step 12: Creating status file\n")
  success_status <- list(
    status = "success",
    message = "Pipeline finalizado com sucesso",
    timestamp = Sys.time(),
    pipeline_type = "illumina",
    summary = list(
      samples = nsamples(ps),
      taxa = ntaxa(ps),
      total_reads = sum(otu_table(ps)),
      avg_merge_rate = avg_merge_rate,
      warnings = if(avg_merge_rate < 50) "Low merge rate detected" else "None"
    ),
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
  
  # Write status file as proper JSON
  status_json <- jsonlite::toJSON(success_status, pretty = TRUE, auto_unbox = TRUE)
  writeLines(status_json, file.path(result_path, "pipeline_status.json"))
  cat("Exported: pipeline_status.json\n\n")

  cat("========================================\n")
  cat("Pipeline completed successfully!\n")
  cat("========================================\n")
  cat("Output directory:", result_path, "\n")
  cat("Total execution time:", format(Sys.time()), "\n\n")
  
  return("Pipeline finalizado com sucesso.")
}