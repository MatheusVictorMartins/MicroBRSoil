#!/usr/bin/env Rscript

# Fast R Package Installer for MicroBRSoil
# Uses Posit Public Package Manager (P3M) for pre-compiled binary packages
# This can reduce installation from 1 hour to ~5-10 minutes

cat("⚡ Fast R Package Installer for MicroBRSoil\n")
cat(paste("R version:", R.version.string, "\n"))
cat(paste("Platform:", R.version$platform, "\n"))

# Detect Ubuntu version for P3M binary repository
get_ubuntu_codename <- function() {
  if (file.exists("/etc/os-release")) {
    os_release <- readLines("/etc/os-release")
    codename_line <- grep("VERSION_CODENAME", os_release, value = TRUE)
    if (length(codename_line) > 0) {
      return(gsub("VERSION_CODENAME=", "", codename_line))
    }
  }
  # Default to jammy (Ubuntu 22.04) which is used by rocker/r-ver:4.3.2
  return("jammy")
}

ubuntu_codename <- get_ubuntu_codename()
cat(paste("📍 Detected Ubuntu codename:", ubuntu_codename, "\n"))

# Configure Posit Public Package Manager for pre-compiled binaries
# This is the KEY to fast installation - binary packages instead of source compilation
p3m_url <- paste0("https://packagemanager.posit.co/cran/__linux__/", ubuntu_codename, "/latest")

options(
  repos = c(
    P3M = p3m_url,  # Primary: Posit Package Manager with Linux binaries
    CRAN = "https://cloud.r-project.org"  # Fallback
  ),
  # Force binary installation when available
  pkgType = "binary",
  # Increase timeout for large packages
  timeout = 600,
  # Show download progress
  download.file.method = "libcurl"
)

cat(paste("📦 Using P3M repository:", p3m_url, "\n"))
cat("📦 Binary packages will be used when available (MUCH faster!)\n\n")

# Enable parallel compilation for source packages (when needed)
ncores <- parallel::detectCores()
if (is.na(ncores)) ncores <- 2
cat(paste("🔧 Using", ncores, "cores for any source compilation\n"))
Sys.setenv(MAKEFLAGS = paste0("-j", ncores))

# Define required packages
required_cran <- c("ggplot2", "dplyr", "vegan")
required_bioc <- c("dada2", "phyloseq")
optional_pkgs <- c("breakaway", "microbiome", "ShortRead", "Biostrings")

# Function to check if package is installed and loadable
is_installed <- function(pkg) {
  tryCatch({
    if (!requireNamespace(pkg, quietly = TRUE)) return(FALSE)
    library(pkg, character.only = TRUE, quietly = TRUE)
    return(TRUE)
  }, error = function(e) FALSE)
}

# Count already installed packages
already_installed <- sum(sapply(c(required_cran, required_bioc), is_installed))
total_required <- length(required_cran) + length(required_bioc)

cat(paste("\n📊 Status:", already_installed, "/", total_required, "required packages already installed\n"))

if (already_installed == total_required) {
  cat("🎉 All required packages are already installed!\n")
  cat("✅ Skipping installation - using cached packages\n")
  quit(status = 0)
}

# Install BiocManager if needed
if (!requireNamespace("BiocManager", quietly = TRUE)) {
  cat("📦 Installing BiocManager...\n")
  install.packages("BiocManager")
}
BiocManager::install(version = "3.18", ask = FALSE, update = FALSE)

# Function to install packages with proper error handling
install_pkg <- function(pkg, use_bioc = FALSE) {
  if (is_installed(pkg)) {
    cat(paste("✅", pkg, "already installed\n"))
    return(TRUE)
  }
  
  cat(paste("📦 Installing", pkg, "...\n"))
  start_time <- Sys.time()
  
  tryCatch({
    if (use_bioc) {
      # For Bioconductor packages
      BiocManager::install(pkg, ask = FALSE, update = FALSE, force = TRUE)
    } else {
      # For CRAN packages - try binary first
      install.packages(pkg, dependencies = TRUE)
    }
    
    elapsed <- round(difftime(Sys.time(), start_time, units = "secs"), 1)
    
    if (is_installed(pkg)) {
      cat(paste("✅", pkg, "installed in", elapsed, "seconds\n"))
      return(TRUE)
    } else {
      cat(paste("❌", pkg, "installation completed but package not loadable\n"))
      return(FALSE)
    }
  }, error = function(e) {
    cat(paste("❌", pkg, "installation failed:", e$message, "\n"))
    return(FALSE)
  })
}

# Install packages
cat("\n📦 Installing CRAN packages...\n")
cran_results <- sapply(required_cran, function(pkg) install_pkg(pkg, use_bioc = FALSE))

cat("\n📦 Installing Bioconductor packages (may take longer)...\n")
bioc_results <- sapply(required_bioc, function(pkg) install_pkg(pkg, use_bioc = TRUE))

# Optional packages - don't fail if these don't install
cat("\n📦 Installing optional packages (failures are OK)...\n")
for (pkg in optional_pkgs) {
  tryCatch({
    install_pkg(pkg, use_bioc = TRUE)
  }, error = function(e) {
    cat(paste("⚠️", pkg, "optional package skipped:", e$message, "\n"))
  })
}

# Final verification
cat("\n🔍 Final verification...\n")
required_ok <- all(sapply(c(required_cran, required_bioc), is_installed))

if (required_ok) {
  cat("\n🎉 SUCCESS: All required packages installed!\n")
  
  # Show versions
  for (pkg in c(required_cran, required_bioc)) {
    if (is_installed(pkg)) {
      cat(paste("  ✅", pkg, "v", as.character(packageVersion(pkg)), "\n"))
    }
  }
  
  cat(paste("\n📍 Packages cached in:", .libPaths()[1], "\n"))
  cat("💡 Next startup will be instant (packages already installed)\n")
  quit(status = 0)
} else {
  cat("\n❌ Some required packages failed to install\n")
  for (pkg in c(required_cran, required_bioc)) {
    if (!is_installed(pkg)) {
      cat(paste("  ❌ Missing:", pkg, "\n"))
    }
  }
  quit(status = 1)
}
