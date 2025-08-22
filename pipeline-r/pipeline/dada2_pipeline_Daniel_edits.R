run_dada2_pipeline <- function(path1, barcodes_path) {
  path <- dirname(path1)
  log_file <- file.path( "log.txt")


  tryCatch({
    #  Carregando pacotes
    library(dada2)
    library(phyloseq)
    library(ggplot2)
    library(vegan)
    library(dplyr)
    library(ShortRead)
    library(breakaway)
    # install.packages("breakaway")

    write(paste(Sys.time(), "- Pacotes carregados com sucesso"), 
          file = log_file, append = TRUE)

    #  Diretórios
    path <- dirname(path1)
    demux_path <- "demultiplexed"
    filt_path <- "filtered"
    dir.create(demux_path, showWarnings = FALSE)
    dir.create(filt_path, showWarnings = FALSE)

    #  Barcodes
    write(paste(Sys.time(), "- Iniciando demultiplexing"), 
          file = log_file, append = TRUE)
    barcodes <- readFasta(barcodes_path)
    barcode_ids <- as.character(id(barcodes))
    barcode_seqs <- as.character(sread(barcodes))

    #  FASTQ multiplexado
    fq <- readFastq(path1)

    for (i in seq_along(barcode_seqs)) {
      bc <- barcode_seqs[i]
      sid <- barcode_ids[i]
      filt <- fq[substr(as.character(sread(fq)), 1, nchar(bc)) == bc]
      if (length(filt) > 0) {
        trimmed <- narrow(sread(filt), start = nchar(bc) + 1,
                          end = width(sread(filt)))
        ids <- id(filt)
        qual <- narrow(quality(quality(filt)), start = nchar(bc) + 1,
                       end = width(sread(filt)))
        newfq <- ShortReadQ(sread = trimmed, quality = qual, id = ids)
        writeFastq(newfq,
                   file.path(demux_path, paste0(sid, ".fastq.gz")),
                   compress = TRUE)
      }
    }

    write(paste(Sys.time(), "- Demultiplexing concluído"),
          file = log_file, append = TRUE)

    #  Filtro por média
    fnFs <- list.files(demux_path, pattern = "fastq.gz", 
                       full.names = TRUE)

    read_counts <- sapply(fnFs, function(f) length(readFastq(f)))
    mean_reads <- mean(read_counts)
    cutoff <- 0.10 * mean_reads
    keep_idx <- which(read_counts >= cutoff)
    fnFs <- fnFs[keep_idx]
    read_counts <- read_counts[keep_idx]

    write(paste(Sys.time(), "- Média de reads:", round(mean_reads)),
          file = log_file, append = TRUE)
    write(paste(Sys.time(), "- Cutoff (10%):", round(cutoff)),
          file = log_file, append = TRUE)
    write(paste(Sys.time(), "- Amostras mantidas:", length(fnFs)),
          file = log_file, append = TRUE)

    # Filtragem
    sample.names <- tools::file_path_sans_ext(basename(fnFs))
    filtFs <- file.path(filt_path, 
                        paste0(sample.names, "_filt.fastq.gz"))

    write(paste(Sys.time(), "- Iniciando filtragem"),
          file = log_file, append = TRUE)
    out <- filterAndTrim(fnFs, filtFs,
                         truncLen = 270, maxN = 0, maxEE = 2, truncQ = 2,
                         rm.phix = TRUE, compress = TRUE,
                         multithread = TRUE)

    #  DADA2
    write(paste(Sys.time(), "- Aprendizado de erro"),
          file = log_file, append = TRUE)
    errF <- learnErrors(filtFs, multithread = TRUE)

    write(paste(Sys.time(), "- Inferência DADA"),
          file = log_file, append = TRUE)
    dds <- dada(filtFs, err = errF, multithread = TRUE)

    write(paste(Sys.time(), "- Criando tabela de sequência"),
          file = log_file, append = TRUE)
    seqtab <- makeSequenceTable(dds)

    write(paste(Sys.time(), "- Remoção de quimeras"),
          file = log_file, append = TRUE)
    seqtab.nochim <- removeBimeraDenovo(seqtab,
                                        method = "consensus",
                                        multithread = TRUE)

    #  Taxonomia
    write(paste(Sys.time(), "- Atribuição de taxonomia"),
          file = log_file, append = TRUE)
 taxa <- assignTaxonomy(seqtab.nochim,
              "referencia/silva_nr99_v138.1_train_set.fa",
              multithread = TRUE)

    saveRDS(seqtab.nochim, file.path(path, "seqtab_nochim.rds"))
    saveRDS(taxa, file.path(path, "taxa.rds"))
    
    numer_of_taxa_assigned_by_rank <- sapply(as_tibble(taxa), function(col) (!is.na(col))) %>%  colSums()
    #algoritmo para kingdom = ...;
    for (i in seq_along(numer_of_taxa_assigned_by_rank)) {
  write(paste(names(numer_of_taxa_assigned_by_rank)[i], ":",
              numer_of_taxa_assigned_by_rank[i]),
        file = log_file, append = TRUE)
}
                                                            #add >=
    rank_chosen_to_plot <- which(numer_of_taxa_assigned_by_rank >= 2) %>% max()
    rank_name <- names(numer_of_taxa_assigned_by_rank)[rank_chosen_to_plot]
    
    write(paste("Rank chosen to plot: ", rank_name),
          file = log_file, append = TRUE)
    
    write(paste(Sys.time(), "- Number of ASVs with a taxa assigned per rank"),
          file = log_file, append = TRUE)
    #  Alpha/Beta
    write(paste(Sys.time(), "- Criando objeto phyloseq"),
          file = log_file, append = TRUE)
    ps <- phyloseq(otu_table(seqtab.nochim, taxa_are_rows = FALSE),
                   tax_table(taxa))

    write(paste(Sys.time(), "- Diversidade alfa"),
          file = log_file, append = TRUE)
    alpha <- estimate_richness(ps,
               measures = c("Observed", "Shannon", "Simpson"))
    # alpha$Goods <- 1 - (rowSums(otu_table(ps) == 1) /
    #                     rowSums(otu_table(ps))) # Goods coverage tem o mesmo problema que o Chao1
    # Para dados de DADA2, não tem singletons e tanto Chao1 quanto Goods fica o mesmo valor de 
    # Observed
    # Aqui uma alterativa:
    # install.packages("breakaway")
    # O breakaway usa um modelo para estimar o número de espécies na amostra
    
    # Apply per sample
    
    otu_mat <- as(otu_table(ps), "matrix")
    if (taxa_are_rows(ps)) otu_mat <- t(otu_mat)
    
    breakaway_list <- apply(otu_mat, 1, function(x) breakaway(as.integer(x)))
    
    # Build a data frame from the list
    breakaway_df <- data.frame(
      SampleID = names(breakaway_list),
      Breakaway = sapply(breakaway_list, function(x) x$estimate),
      Breakaway_se = sapply(breakaway_list, function(x) x$error),
      row.names = NULL
    )
    
    alpha$SampleID <- rownames(alpha) %>% gsub(pattern = "^X", replacement = "")
    
    alpha <- left_join(alpha, breakaway_df, by = "SampleID")
    alpha <- alpha %>% select(SampleID, everything())
    
    alpha <- alpha %>%
      mutate(across(c(Breakaway, Breakaway_se), ~ round(.x, 4)))
    
    
    write.csv(alpha, file.path(path, "alpha_diversity_metrics.csv"))

    write(paste(Sys.time(), "- Diversidade beta"),
          file = log_file, append = TRUE)
    ordu <- ordinate(ps, method = "PCoA", distance = "bray")

    #  Gráficos
    write(paste(Sys.time(), "- Gerando gráficos"),
          file = log_file, append = TRUE)
    p1 <- plot_richness(ps,
            measures = c("Observed", "Shannon", "Simpson"))
    ggsave("alpha_diversity.png", p1)

    p2 <- plot_ordination(ps, ordu, color = "Sample") +
          geom_point(size = 4)
    ggsave("beta_diversity.png", p2)

    
    tax_glomed <- tax_glom(ps, taxrank = rank_name)
    top20 <- names(sort(taxa_sums(tax_glomed),
                        decreasing = TRUE))[1:20]
    ps_top20 <- prune_taxa(top20, tax_glomed)
    p3 <- plot_bar(ps_top20, fill = rank_name) +
          theme(axis.text.x = element_text(angle = 90, hjust = 1))
    ggsave("taxa_barplot.png", p3)

    write(paste(Sys.time(), "- PIPELINE CONCLUÍDO COM SUCESSO"),
          file = log_file, append = TRUE)
    return("Pipeline concluído com sucesso.")

  }, error = function(e) {
    write(paste(Sys.time(), "- ERRO DETECTADO:", e$message),
          file = log_file, append = TRUE)
    stop("Erro na execução. Verifique log.")
  })
}
