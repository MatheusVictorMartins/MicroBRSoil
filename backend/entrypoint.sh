#!/bin/bash
set -e

echo "🚀 Starting MicroBRSoil Worker (Ultra-Fast Mode)"
echo "R version: $(R --version | head -1)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Test Node.js native modules
echo "🔍 Testing Node.js native modules..."
echo "🔧 Rebuilding bcrypt module for current architecture..."
cd /app && npm rebuild bcrypt --build-from-source
if node -e "require('bcrypt')" 2>/dev/null; then
    echo "✅ bcrypt module rebuilt and working correctly"
else
    echo "❌ Failed to rebuild bcrypt module"
    exit 1
fi

# Install all packages at runtime (cached in persistent volume)
echo "📦 Setting up R packages (cached after first run)..."
if Rscript /app/pipeline-r/ultra_fast_install_r_packages.R; then
  echo "✅ All R packages are ready and functional"
else
  echo "⚠️ Some packages installation failed, checking what is available..."
  if Rscript -e "library(dada2)" 2>/dev/null; then
    echo "✅ Core package dada2 is available, proceeding..."
  else
    echo "❌ Critical package dada2 missing, cannot continue"
    exit 1
  fi
fi

echo "🎯 Starting worker process..."
exec "$@"
