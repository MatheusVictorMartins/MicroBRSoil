#!/usr/bin/env Rscript

# Ultra-Fast R Package Check - Optimized for Build-Time Installation
# This script is designed for containers where packages are pre-installed at build time

options(repos = c(CRAN = "https://cloud.r-project.org"))

cat("⚡ Ultra-Fast R Package Check...\n")
cat(paste("R version:", R.version.string, "\n"))

# Required packages for MicroBRSoil pipelines
required_packages <- c("dada2", "phyloseq", "ggplot2", "vegan", "dplyr", "ShortRead", "Biostrings")

cat("🔍 Checking required packages...\n")

all_available <- TRUE
missing_packages <- c()

for (pkg in required_packages) {
  if (requireNamespace(pkg, quietly = TRUE)) {
    cat(paste("✅", pkg, "- version", packageVersion(pkg), "\n"))
  } else {
    cat(paste("❌", pkg, "- MISSING\n"))
    missing_packages <- c(missing_packages, pkg)
    all_available <- FALSE
  }
}

if (all_available) {
  cat("\n🎉 SUCCESS: All packages are available and ready!\n")
  cat("📦 Total check time: < 1 second (build-time installation working!)\n")
  quit(status = 0)
} else {
  cat(paste("\n⚠️ Missing packages:", paste(missing_packages, collapse = ", "), "\n"))
  cat("🔧 This suggests the container wasn't built with build-time installation.\n")
  cat("💡 Run the switch-to-fast-r.ps1 script to enable ultra-fast package management.\n")
  quit(status = 1)
}
