#!/usr/bin/env Rscript

# Microbiome Package Test Script
# This script specifically tests the installation and loading of the microbiome package

cat("🧬 Testing microbiome package installation and functionality...\n")
cat(paste("R version:", R.version.string, "\n"))

# Check if BiocManager is available
if (!requireNamespace("BiocManager", quietly = TRUE)) {
  cat("📦 Installing BiocManager first...\n")
  install.packages("BiocManager")
}

cat("📦 Attempting to install microbiome package...\n")

# Try to install microbiome from Bioconductor
tryCatch({
  BiocManager::install("microbiome", ask = FALSE, update = FALSE)
  cat("✅ microbiome package installation completed\n")
}, error = function(e) {
  cat(paste("❌ microbiome installation failed:", e$message, "\n"))
})

# Test if microbiome can be loaded
cat("🔍 Testing microbiome package loading...\n")
tryCatch({
  library(microbiome)
  cat("✅ microbiome package loaded successfully\n")
  
  # Show package version and info
  cat(paste("📋 microbiome version:", packageVersion("microbiome"), "\n"))
  
  # Test a basic function from microbiome
  if (exists("alpha", envir = asNamespace("microbiome"))) {
    cat("✅ microbiome::alpha function is available\n")
  }
  
  if (exists("beta", envir = asNamespace("microbiome"))) {
    cat("✅ microbiome::beta function is available\n")
  }
  
  cat("🎉 microbiome package is fully functional!\n")
  
}, error = function(e) {
  cat(paste("❌ microbiome package failed to load:", e$message, "\n"))
  
  # Try to provide more diagnostic info
  if ("microbiome" %in% rownames(installed.packages())) {
    cat("📋 microbiome is listed as installed but failed to load\n")
    cat("📝 This might indicate missing dependencies\n")
  } else {
    cat("📋 microbiome is not installed\n")
  }
  
  quit(status = 1)
})

cat("✅ microbiome package test completed successfully!\n")
