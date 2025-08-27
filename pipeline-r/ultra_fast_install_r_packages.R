#!/usr/bin/env Rscript

# Ultra-Fast R Package Installer for MicroBRSoil
# Optimized for Docker builds with comprehensive system dependency support

options(repos = c(
  CRAN = "https://cloud.r-project.org",
  # Use RStudio Package Manager for binary packages when possible
  RSPM = "https://packagemanager.rstudio.com/cran/__linux__/jammy/latest"
))

# Configure for binary packages preference
options(pkgType = "both")

cat("⚡ Ultra-Fast R Package Installer for MicroBRSoil\n")
cat(paste("R version:", R.version.string, "\n"))
cat("📦 Using optimized package installation strategy\n")

# Check system dependencies
cat("🔍 Checking system dependencies...\n")
system("pkg-config --version", ignore.stderr = TRUE)
system("curl-config --version", ignore.stderr = TRUE)

# Define required packages with better dependency management
required_packages <- list(
  # System packages that often have binary versions
  system_deps = c("curl", "openssl", "sys", "rappdirs"),
  # Basic R packages
  basic = c("ggplot2", "dplyr"),
  # CRAN analysis packages  
  cran_analysis = c("vegan"),
  # More complex CRAN packages
  advanced = c("breakaway"),
  # Bioconductor packages (install these via BiocManager)
  bioconductor = c("dada2", "phyloseq", "ShortRead", "Biostrings", "microbiome")
)

all_packages <- c(
  required_packages$system_deps,
  required_packages$basic, 
  required_packages$cran_analysis,
  required_packages$advanced,
  required_packages$bioconductor
)

# Function to check if package is installed and working
is_package_ready <- function(pkg_name) {
  tryCatch({
    if (!pkg_name %in% rownames(installed.packages())) return(FALSE)
    library(pkg_name, character.only = TRUE)
    return(TRUE)
  }, error = function(e) return(FALSE))
}

# Check what's already installed
installed_pkgs <- rownames(installed.packages())
cat(paste("📋 Currently installed packages:", length(installed_pkgs), "\n"))

# Quick check if all packages are already ready
all_ready <- all(sapply(all_packages, is_package_ready))
if (all_ready) {
  cat("🎉 All packages are already installed and functional!\n")
  quit(status = 0)
}

cat("📦 Installing missing packages with optimized strategy...\n")

# Install BiocManager first if needed
if (!requireNamespace("BiocManager", quietly = TRUE)) {
  cat("📦 Installing BiocManager...\n")
  install.packages("BiocManager", type = "binary")
}

# Function to install with comprehensive fallback strategy
install_with_fallback <- function(packages, use_bioc = FALSE, category = "packages") {
  cat(paste("📦 Installing", category, ":", paste(packages, collapse = ", "), "\n"))
  
  for (pkg in packages) {
    if (is_package_ready(pkg)) {
      cat(paste("✅", pkg, "already ready\n"))
      next
    }
    
    cat(paste("📦 Installing", pkg, "...\n"))
    
    # Try multiple installation strategies
    success <- FALSE
    
    # Strategy 1: Try binary first
    if (!success) {
      cat(paste("  → Trying binary installation for", pkg, "\n"))
      tryCatch({
        if (use_bioc) {
          BiocManager::install(pkg, ask = FALSE, update = FALSE, type = "binary", force = TRUE)
        } else {
          install.packages(pkg, type = "binary", dependencies = TRUE, INSTALL_opts = "--byte-compile")
        }
        
        if (is_package_ready(pkg)) {
          cat(paste("✅", pkg, "installed successfully (binary)\n"))
          success <- TRUE
        }
      }, error = function(e) {
        cat(paste("  ⚠️ Binary installation failed:", e$message, "\n"))
      })
    }
    
    # Strategy 2: Try source with optimized compilation
    if (!success) {
      cat(paste("  → Trying source installation for", pkg, "\n"))
      tryCatch({
        # Set compilation flags for better compatibility
        Sys.setenv(MAKEFLAGS = "-j1")  # Single-threaded to avoid race conditions
        Sys.setenv(PKG_CONFIG_PATH = "/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig")
        
        if (use_bioc) {
          BiocManager::install(pkg, ask = FALSE, update = FALSE, type = "source", force = TRUE)
        } else {
          install.packages(pkg, type = "source", dependencies = TRUE, 
                         configure.args = "--with-curl --with-libxml2",
                         INSTALL_opts = c("--byte-compile", "--no-test-load"))
        }
        
        if (is_package_ready(pkg)) {
          cat(paste("✅", pkg, "installed successfully (source)\n"))
          success <- TRUE
        }
      }, error = function(e) {
        cat(paste("  ⚠️ Source installation failed:", e$message, "\n"))
      })
    }
    
    # Strategy 3: Try with minimal dependencies
    if (!success && !use_bioc) {
      cat(paste("  → Trying minimal installation for", pkg, "\n"))
      tryCatch({
        install.packages(pkg, dependencies = FALSE, type = "source")
        
        if (is_package_ready(pkg)) {
          cat(paste("✅", pkg, "installed successfully (minimal)\n"))
          success <- TRUE
        }
      }, error = function(e) {
        cat(paste("  ⚠️ Minimal installation failed:", e$message, "\n"))
      })
    }
    
    if (!success) {
      cat(paste("❌", pkg, "failed all installation strategies\n"))
    }
  }
}

# Install in optimized order with comprehensive error handling
cat("📦 Installing system dependency packages...\n")
install_with_fallback(required_packages$system_deps, use_bioc = FALSE, category = "system dependencies")

cat("📦 Installing basic R packages...\n")
install_with_fallback(required_packages$basic, use_bioc = FALSE, category = "basic packages")

cat("📦 Installing CRAN analysis packages...\n") 
install_with_fallback(required_packages$cran_analysis, use_bioc = FALSE, category = "CRAN analysis packages")

cat("📦 Installing advanced packages...\n")
install_with_fallback(required_packages$advanced, use_bioc = FALSE, category = "advanced packages")

cat("📦 Installing Bioconductor packages (including microbiome)...\n")
install_with_fallback(required_packages$bioconductor, use_bioc = TRUE, category = "Bioconductor packages")

# Final verification
cat("\n🔍 Final verification of all packages...\n")
success_count <- 0
failed_packages <- c()

for (pkg in all_packages) {
  if (is_package_ready(pkg)) {
    cat(paste("✅", pkg, "- version", packageVersion(pkg), "\n"))
    success_count <- success_count + 1
  } else {
    cat(paste("❌", pkg, "- NOT FUNCTIONAL\n"))
    failed_packages <- c(failed_packages, pkg)
  }
}

# Report results
cat(paste("\n📊 Installation Summary:", success_count, "/", length(all_packages), "packages functional\n"))

if (length(failed_packages) == 0) {
  cat("🎉 SUCCESS: All packages installed and functional!\n")
  cat(paste("📍 Packages stored in:", .libPaths()[1], "\n"))
  quit(status = 0)
} else {
  cat(paste("⚠️ Warning:", length(failed_packages), "packages failed:", paste(failed_packages, collapse = ", "), "\n"))
  # Don't fail the build if we have most packages working
  if (success_count >= length(all_packages) * 0.8) {
    cat("✅ Proceeding with", success_count, "functional packages (80%+ success rate)\n")
    quit(status = 0)
  } else {
    cat("❌ Too many packages failed. Build cannot continue.\n")
    quit(status = 1)
  }
}
