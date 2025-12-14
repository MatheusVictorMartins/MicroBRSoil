#!/usr/bin/env Rscript

# Comprehensive R package verification for MicroBRSoil pipeline
# This script verifies all required packages are properly installed

cat("🔍 Verifying MicroBRSoil R package dependencies...\n")
cat(paste("R version:", R.version.string, "\n"))

# Define all required packages from the pipeline analysis
required_packages <- list(
  cran = c("ggplot2", "vegan", "dplyr", "breakaway"),
  bioconductor = c("dada2", "phyloseq", "ShortRead", "Biostrings", "microbiome")
)

all_packages <- c(required_packages$cran, required_packages$bioconductor)

# Check installation status
installed_pkgs <- rownames(installed.packages())
missing_packages <- setdiff(all_packages, installed_pkgs)

if (length(missing_packages) > 0) {
  cat("❌ Missing packages:", paste(missing_packages, collapse = ", "), "\n")
  quit(status = 1)
}

cat("✅ All packages are installed. Testing package loading...\n")

# Test loading each package
load_failures <- c()
for (pkg in all_packages) {
  tryCatch({
    library(pkg, character.only = TRUE)
    cat(paste("✓", pkg, "\n"))
  }, error = function(e) {
    cat(paste("✗", pkg, "- Failed to load:", e$message, "\n"))
    load_failures <- c(load_failures, pkg)
  })
}

if (length(load_failures) > 0) {
  cat("❌ Failed to load packages:", paste(load_failures, collapse = ", "), "\n")
  quit(status = 1)
}

cat("🎉 All MicroBRSoil R dependencies are properly installed and functional!\n")

# Display package versions for debugging
cat("\n📋 Package versions:\n")
for (pkg in all_packages) {
  version <- packageVersion(pkg)
  cat(paste("  ", pkg, ":", version, "\n"))
}

quit(status = 0)
