#!/usr/bin/env Rscript

# Smart R Package Installer for MicroBRSoil
# Only installs packages that are not already installed
# Designed for Docker layer caching optimization

options(repos = c(CRAN = "https://cloud.r-project.org"))

cat("🔍 Smart R Package Installer for MicroBRSoil\n")
cat(paste("R version:", R.version.string, "\n"))
cat(paste("Library paths:", paste(.libPaths(), collapse = ", "), "\n"))

# Define required packages
required_packages <- list(
  cran = c("ggplot2", "vegan", "dplyr", "breakaway", "microbiome"),
  bioconductor = c("dada2", "phyloseq", "ShortRead", "Biostrings")
)

all_packages <- c(required_packages$cran, required_packages$bioconductor)

# Function to check if package is properly installed and loadable
is_package_ready <- function(pkg_name) {
  tryCatch({
    # Check if installed
    if (!pkg_name %in% rownames(installed.packages())) {
      return(FALSE)
    }
    # Check if loadable
    library(pkg_name, character.only = TRUE)
    return(TRUE)
  }, error = function(e) {
    return(FALSE)
  })
}

# Check current installation status
cat("\n🔍 Checking current installation status...\n")
installed_pkgs <- rownames(installed.packages())
missing_cran <- setdiff(required_packages$cran, installed_pkgs)
missing_bioc <- setdiff(required_packages$bioconductor, installed_pkgs)

# Report status
if (length(missing_cran) == 0 && length(missing_bioc) == 0) {
  cat("✅ All packages appear to be installed. Verifying functionality...\n")
  
  # Test all packages can be loaded
  load_failures <- c()
  for (pkg in all_packages) {
    if (!is_package_ready(pkg)) {
      load_failures <- c(load_failures, pkg)
    } else {
      cat(paste("✓", pkg, "- version", packageVersion(pkg), "\n"))
    }
  }
  
  if (length(load_failures) == 0) {
    cat("\n🎉 SUCCESS: All packages are installed and functional!\n")
    cat("⚡ No installation needed - using cached packages\n")
    quit(status = 0)
  } else {
    cat(paste("\n⚠️ Some packages failed to load:", paste(load_failures, collapse = ", "), "\n"))
    cat("🔄 Will reinstall problematic packages...\n")
    missing_cran <- intersect(load_failures, required_packages$cran)
    missing_bioc <- intersect(load_failures, required_packages$bioconductor)
  }
} else {
  cat(paste("📦 Missing CRAN packages:", paste(missing_cran, collapse = ", "), "\n"))
  cat(paste("📦 Missing Bioconductor packages:", paste(missing_bioc, collapse = ", "), "\n"))
}

# Install missing packages
install_failed <- c()

# Install BiocManager if needed
if (length(missing_bioc) > 0 && !requireNamespace("BiocManager", quietly = TRUE)) {
  cat("📦 Installing BiocManager...\n")
  tryCatch({
    install.packages("BiocManager", Ncpus = parallel::detectCores())
  }, error = function(e) {
    cat(paste("❌ BiocManager installation failed:", e$message, "\n"))
    install_failed <- c(install_failed, "BiocManager")
  })
}

# Install missing CRAN packages
if (length(missing_cran) > 0) {
  cat(paste("📦 Installing CRAN packages:", paste(missing_cran, collapse = ", "), "\n"))
  tryCatch({
    install.packages(missing_cran, Ncpus = parallel::detectCores(), dependencies = TRUE)
    cat("✅ CRAN packages installation completed\n")
  }, error = function(e) {
    cat(paste("❌ CRAN installation failed:", e$message, "\n"))
    install_failed <- c(install_failed, missing_cran)
  })
}

# Install missing Bioconductor packages
if (length(missing_bioc) > 0) {
  cat(paste("📦 Installing Bioconductor packages:", paste(missing_bioc, collapse = ", "), "\n"))
  tryCatch({
    BiocManager::install(missing_bioc, ask = FALSE, update = FALSE, Ncpus = parallel::detectCores())
    cat("✅ Bioconductor packages installation completed\n")
  }, error = function(e) {
    cat(paste("❌ Bioconductor installation failed:", e$message, "\n"))
    install_failed <- c(install_failed, missing_bioc)
  })
}

# Final verification
cat("\n🔍 Final verification...\n")
final_check_failures <- c()
for (pkg in all_packages) {
  if (!is_package_ready(pkg)) {
    final_check_failures <- c(final_check_failures, pkg)
  } else {
    cat(paste("✓", pkg, "- version", packageVersion(pkg), "\n"))
  }
}

# Report results
if (length(final_check_failures) == 0) {
  cat("\n🎉 SUCCESS: All MicroBRSoil R dependencies are installed and functional!\n")
  cat(paste("📍 Packages stored in:", .libPaths()[1], "\n"))
  quit(status = 0)
} else {
  cat(paste("\n❌ FAILED: Some packages are still not functional:", paste(final_check_failures, collapse = ", "), "\n"))
  if (length(install_failed) > 0) {
    cat(paste("💥 Installation failures:", paste(install_failed, collapse = ", "), "\n"))
  }
  quit(status = 1)
}
