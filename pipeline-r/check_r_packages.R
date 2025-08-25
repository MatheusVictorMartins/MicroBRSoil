#!/usr/bin/env Rscript

# Quick check if required R packages are installed
# This script provides fast verification with proper dependency handling

options(repos = c(CRAN = "https://cloud.r-project.org"))

cat("🔍 Checking R packages...\n")
cat(paste("R version:", R.version.string, "\n"))

# Check if dada2 is available (main requirement)
dada2_available <- requireNamespace("dada2", quietly = TRUE)

if (dada2_available) {
  cat("✅ dada2 is available\n")
  
  # Quick check of other critical packages
  other_packages <- c("phyloseq", "ggplot2")
  missing_others <- c()
  
  for (pkg in other_packages) {
    if (!requireNamespace(pkg, quietly = TRUE)) {
      missing_others <- c(missing_others, pkg)
    }
  }
  
  if (length(missing_others) > 0) {
    cat(paste("⚠️ Installing additional packages:", paste(missing_others, collapse = ", "), "\n"))
    
    # Install missing packages
    if (!requireNamespace("BiocManager", quietly = TRUE)) {
      install.packages("BiocManager", repos = "https://cloud.r-project.org")
    }
    
    # Install ggplot2 dependencies first if needed
    if ("ggplot2" %in% missing_others) {
      cat("Installing ggplot2 dependencies...\n")
      install.packages(c("scales", "farver", "labeling"), repos = "https://cloud.r-project.org")
      install.packages("ggplot2", repos = "https://cloud.r-project.org")
    }
    
    # Install phyloseq if needed
    if ("phyloseq" %in% missing_others) {
      cat("Installing phyloseq...\n")
      BiocManager::install("phyloseq", ask = FALSE, update = FALSE)
    }
  }
  
  cat("✅ All packages are ready\n")
  quit(status = 0)
  
} else {
  cat("❌ dada2 not found. Installing all required packages...\n")
  
  # Full installation sequence
  cat("📦 Installing BiocManager...\n")
  install.packages("BiocManager", repos = "https://cloud.r-project.org")
  
  cat("📦 Installing base dependencies...\n")
  install.packages(c("scales", "farver", "labeling", "colorspace"), repos = "https://cloud.r-project.org")
  
  cat("📦 Installing ggplot2 and dplyr...\n")
  install.packages(c("ggplot2", "dplyr"), repos = "https://cloud.r-project.org")
  
  cat("📦 Installing vegan (if R version supports it)...\n")
  tryCatch({
    install.packages("vegan", repos = "https://cloud.r-project.org")
    cat("✅ vegan installed successfully\n")
  }, error = function(e) {
    cat("⚠️ vegan installation failed (likely R version issue):", e$message, "\n")
  })
  
  cat("📦 Installing Bioconductor packages...\n")
  BiocManager::install(c("dada2", "phyloseq"), ask = FALSE, update = FALSE)
  
  # Final verification
  final_check <- requireNamespace("dada2", quietly = TRUE)
  if (final_check) {
    cat("✅ SUCCESS: All core packages installed successfully\n")
    quit(status = 0)
  } else {
    cat("❌ ERROR: dada2 installation failed\n")
    quit(status = 1)
  }
}
