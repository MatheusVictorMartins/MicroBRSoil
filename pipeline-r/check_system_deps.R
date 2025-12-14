#!/usr/bin/env Rscript

# System Dependency Checker for R Package Installation
# Helps debug missing system libraries

cat("🔍 System Dependency Checker for R Package Installation\n")
cat("======================================================\n\n")

# Check R configuration
cat("📋 R Configuration:\n")
cat(paste("R version:", R.version.string, "\n"))
cat(paste("Platform:", R.version$platform, "\n"))
cat(paste("Library paths:", paste(.libPaths(), collapse = ", "), "\n\n"))

# Check system commands
cat("🔧 System Build Tools:\n")
commands <- c("gcc", "g++", "make", "pkg-config", "cmake")
for (cmd in commands) {
  result <- system(paste("which", cmd, "2>/dev/null"), intern = TRUE, ignore.stderr = TRUE)
  if (length(result) > 0 && result != "") {
    version <- system(paste(cmd, "--version 2>/dev/null | head -1"), intern = TRUE, ignore.stderr = TRUE)
    cat(paste("✅", cmd, ":", if(length(version) > 0) version[1] else "available", "\n"))
  } else {
    cat(paste("❌", cmd, ": not found\n"))
  }
}

cat("\n🔗 Key Library Headers:\n")
# Check for key development libraries
libs <- c(
  "libcurl" = "curl-config --version",
  "openssl" = "pkg-config --modversion openssl",
  "libxml2" = "pkg-config --modversion libxml-2.0",
  "zlib" = "pkg-config --modversion zlib",
  "libgit2" = "pkg-config --modversion libgit2"
)

for (lib_name in names(libs)) {
  result <- system(libs[[lib_name]], intern = TRUE, ignore.stderr = TRUE)
  if (length(result) > 0 && result != "") {
    cat(paste("✅", lib_name, ":", result[1], "\n"))
  } else {
    cat(paste("❌", lib_name, ": not found or no version info\n"))
  }
}

cat("\n📦 Package Configuration:\n")
# Check PKG_CONFIG_PATH
pkg_config_path <- Sys.getenv("PKG_CONFIG_PATH")
if (pkg_config_path != "") {
  cat(paste("PKG_CONFIG_PATH:", pkg_config_path, "\n"))
} else {
  cat("PKG_CONFIG_PATH: not set\n")
}

# Check some critical header files
cat("\n🔍 Critical Header Files:\n")
headers <- c(
  "/usr/include/curl/curl.h",
  "/usr/include/openssl/ssl.h", 
  "/usr/include/libxml2/libxml/xmlversion.h",
  "/usr/include/zlib.h"
)

for (header in headers) {
  if (file.exists(header)) {
    cat(paste("✅", basename(header), "\n"))
  } else {
    cat(paste("❌", basename(header), "missing\n"))
  }
}

cat("\n🏗️ Build Environment:\n")
# Check environment variables that affect R package building
env_vars <- c("CC", "CXX", "CFLAGS", "CXXFLAGS", "LDFLAGS", "MAKEFLAGS")
for (var in env_vars) {
  value <- Sys.getenv(var)
  if (value != "") {
    cat(paste(var, ":", value, "\n"))
  }
}

cat("\n✅ System dependency check completed!\n")
cat("Use this information to debug R package installation issues.\n")
