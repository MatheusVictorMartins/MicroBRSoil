run_pipeline_its <- function(path1, path2 = "/app/pipeline-r/references/sh_general_release_dynamic_19.02.2025.fasta", outdir = NULL, type = "its") {
  library(dada2)
  library(phyloseq)
  library(ggplot2)
  library(vegan)

  input_path <- dirname(path1)
  root_path <- if (!is.null(outdir)) outdir else normalizePath(".")

  filtered_path <- file.path(root_path, "filtered")
  output_path <- file.path(root_path, "output")

  if (!dir.exists(filtered_path)) dir.create(filtered_path, recursive = TRUE)
  if (!dir.exists(output_path)) dir.create(output_path, recursive = TRUE)

  fnFs <- sort(list.files(input_path, pattern = "_R1_001.fastq.gz", full.names = TRUE))
  fnRs <- sort(list.files(input_path, pattern = "_R2_001.fastq.gz", full.names = TRUE))
  sample.names <- sapply(strsplit(basename(fnFs), "_"), `[`, 1)

  filtFs <- file.path(filtered_path, paste0(sample.names, "_F_filt.fastq.gz"))
  filtRs <- file.path(filtered_path, paste0(sample.names, "_R_filt.fastq.gz"))
  names(filtFs) <- sample.names
  names(filtRs) <- sample.names

  out <- filterAndTrim(fnFs, filtFs, fnRs, filtRs, truncLen = c(150,150),
                       maxN = 0, maxEE = c(2,2), truncQ = 2, rm.phix = TRUE,
                       compress = TRUE, multithread = TRUE)

  errF <- learnErrors(filtFs, multithread = TRUE)
  errR <- learnErrors(filtRs, multithread = TRUE)

  derepFs <- derepFastq(filtFs, verbose = TRUE)
  derepRs <- derepFastq(filtRs, verbose = TRUE)
  names(derepFs) <- sample.names
  names(derepRs) <- sample.names

  dadaFs <- dada(derepFs, err = errF, multithread = TRUE)
  dadaRs <- dada(derepRs, err = errR, multithread = TRUE)

  mergers <- mergePairs(dadaFs, derepFs, dadaRs, derepRs, verbose = TRUE)
  seqtab <- makeSequenceTable(mergers)
  seqtab.nochim <- removeBimeraDenovo(seqtab, method = "consensus", multithread = TRUE, verbose = TRUE)

  taxa <- assignTaxonomy(seqtab.nochim, path2, multithread = TRUE)

  samples <- data.frame(sample = sample.names, row.names = sample.names)
  ps <- phyloseq(
    otu_table(seqtab.nochim, taxa_are_rows = FALSE),
    tax_table(taxa),
    sample_data(samples)
  )

  alpha <- estimate_richness(ps, measures = c("Observed", "Shannon", "Simpson"))
  alpha$Chao1 <- estimateRichness(ps, measures = "Chao1")[,1]
  alpha$Goods_coverage <- 1 - (rowSums(otu_table(ps) == 1) / rowSums(otu_table(ps)))
  write.csv(alpha, file.path(output_path, "alpha_diversity.csv"))

  ord <- ordinate(ps, method = "PCoA", distance = "bray")
  ggsave(file.path(output_path, "alpha_diversity.png"),
         plot_richness(ps, measures = c("Observed", "Shannon", "Simpson", "Chao1")) + theme_minimal())

  ggsave(file.path(output_path, "beta_diversity.png"),
         plot_ordination(ps, ord, color = "sample") + geom_point(size = 3) + theme_minimal())

  ps.genus <- tax_glom(ps, taxrank = "Genus")
  ps.genus.rel <- transform_sample_counts(ps.genus, function(x) x / sum(x))

  ggsave(file.path(output_path, "barplot_genus.png"),
         plot_bar(ps.genus.rel, fill = "Genus") +
           theme_minimal() +
           theme(axis.text.x = element_text(angle = 90, hjust = 1)))

  return("Pipeline ITS executado com sucesso.")
}
