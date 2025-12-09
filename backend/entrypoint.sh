#!/bin/bash
set -e

echo "🚀 Starting MicroBRSoil Worker"
echo "R version: $(R --version | head -1)"
echo "Node version: $(node --version)"

# Rebuild bcrypt for current architecture
echo "🔧 Rebuilding bcrypt module..."
cd /app && npm rebuild bcrypt --build-from-source 2>/dev/null || true
if node -e "require('bcrypt')" 2>/dev/null; then
    echo "✅ bcrypt module working"
else
    echo "❌ Failed to rebuild bcrypt module"
    exit 1
fi

# Quick check if packages are already installed (from volume cache)
echo "🔍 Checking R packages..."
if Rscript -e "library(dada2); library(phyloseq); library(ggplot2); cat('✅ All R packages ready\n')" 2>/dev/null; then
    echo "✅ R packages found in cache - skipping installation"
else
    echo "📦 Installing R packages (first run only - will be cached)..."
    
    # Use P3M repository which automatically serves binaries for Linux
    # The key is setting the repo URL - P3M detects the platform and serves binaries
    Rscript -e "
    # Set P3M as primary repo - it serves pre-compiled binaries for Linux
    options(repos = c(
      CRAN = 'https://packagemanager.posit.co/cran/__linux__/jammy/latest'
    ))
    options(Ncpus = parallel::detectCores())
    options(timeout = 600)
    
    cat('📍 Using repository:', getOption('repos'), '\n')
    
    # Install BiocManager
    if (!requireNamespace('BiocManager', quietly = TRUE)) {
      cat('📦 Installing BiocManager...\n')
      install.packages('BiocManager')
    }
    
    # Configure Bioconductor to also use P3M for binaries
    BiocManager::install(version = '3.18', ask = FALSE, update = FALSE)
    
    cat('📦 Installing CRAN packages...\n')
    install.packages(c('ggplot2', 'dplyr', 'vegan'), dependencies = TRUE)
    
    cat('📦 Installing Bioconductor packages...\n')
    BiocManager::install(c('dada2', 'phyloseq'), ask = FALSE, update = FALSE, force = TRUE)
    
    cat('✅ Installation complete\n')
    "
    
    # Verify installation
    if Rscript -e "library(dada2); library(phyloseq)" 2>/dev/null; then
        echo "✅ R packages installed and verified"
    else
        echo "❌ R package installation failed"
        exit 1
    fi
fi

echo "🎯 Starting worker process..."
exec "$@"
