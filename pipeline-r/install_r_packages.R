# Minimal installer for R packages required by the pipelines
# Run with: Rscript install_r_packages.R
options(repos = c(CRAN = "https://cloud.r-project.org"))
log <- function(msg) cat(sprintf("[%s] %s\n", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), msg))

try_install_cran <- function(pkgs) {
  if (length(pkgs) == 0) return(invisible())
  installed <- rownames(installed.packages())
  need <- setdiff(pkgs, installed)
  if (length(need) == 0) {
    log(paste("CRAN: all packages already installed:", paste(pkgs, collapse = ", ")))
    return(invisible())
  }
  log(paste("Installing CRAN packages:", paste(need, collapse = ", ")))
  tryCatch({
    install.packages(need, Ncpus = parallel::detectCores(), dependencies = TRUE)
    log("CRAN install finished")
  }, error = function(e) {
    log(paste("CRAN install error:", e$message))
  })
}

try_install_bioc <- function(pkgs) {
  if (length(pkgs) == 0) return(invisible())
  if (!requireNamespace("BiocManager", quietly = TRUE)) {
    log("Installing BiocManager")
    tryCatch(install.packages("BiocManager", Ncpus = parallel::detectCores()), error = function(e) {
      stop("Failed to install BiocManager: ", e$message)
    })
  }
  installed <- rownames(installed.packages())
  need <- setdiff(pkgs, installed)
  if (length(need) == 0) {
    log(paste("Bioconductor: all packages already installed:", paste(pkgs, collapse = ", ")))
    return(invisible())
  }
  log(paste("Installing Bioconductor packages:", paste(need, collapse = ", ")))
  tryCatch({
    BiocManager::install(need, ask = FALSE, update = FALSE, Ncpus = parallel::detectCores())
    log("Bioconductor install finished")
  }, error = function(e) {
    log(paste("Bioconductor install error:", e$message))
  })
}

# Packages referenced by your R pipelines
cran_pkgs <- c(
  "ggplot2",
  "vegan",
  "dplyr",
  "breakaway",
  "microbiome"
)

bioc_pkgs <- c(
  "dada2",
  "phyloseq",
  "ShortRead",
  "Biostrings"
)

log("Starting package installation")
try_install_cran(cran_pkgs)
try_install_bioc(bioc_pkgs)

# Post-check
all_installed <- c(cran_pkgs, bioc_pkgs) %in% rownames(installed.packages())
if (all(all_installed)) {
  log("All requested packages appear installed.")
} else {
  missing <- c(cran_pkgs, bioc_pkgs)[!all_installed]
  log(paste("Warning: some packages are still missing:", paste(missing, collapse = ", ")))
  log("Inspect output above for errors. Some Bioconductor packages may require additional system libraries.")
}

invisible(NULL)