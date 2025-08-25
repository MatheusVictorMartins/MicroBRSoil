# R Package Management for MicroBRSoil

This document explains how R packages are managed in the MicroBRSoil Docker environment.

## 🎯 Solution Overview

The previous approach of installing R packages during Docker build was extremely slow (10+ minutes) and unreliable. The new solution uses:

1. **Persistent Volume**: R packages are stored in a Docker volume that persists across container restarts
2. **Lazy Installation**: Packages are installed on first run, not during build
3. **Fast Startup**: Subsequent starts are very fast since packages are already installed

## 📦 Required R Packages

The pipeline requires these R packages:
- **dada2** (Bioconductor) - Core microbiome analysis
- **phyloseq** (Bioconductor) - Phylogenetic analysis
- **ggplot2** (CRAN) - Data visualization
- **vegan** (CRAN) - Community ecology
- **dplyr** (CRAN) - Data manipulation

## 🚀 Quick Start

### Option 1: Use the rebuild script (Recommended)
```bash
# On Windows (PowerShell/CMD)
.\rebuild.cmd

# On Linux/Mac
chmod +x rebuild.sh
./rebuild.sh
```

### Option 2: Manual steps
```bash
# Stop containers
docker-compose down

# Rebuild worker (first time will install R packages)
docker-compose build --no-cache worker
docker-compose up -d

# Check if R packages are working
docker-compose exec worker Rscript -e "library(dada2); cat('✅ dada2 is working\n')"
```

## ⚡ Performance Improvements

| Approach | First Build | Subsequent Builds | Package Persistence |
|----------|-------------|-------------------|-------------------|
| Old (build-time) | 10+ minutes | 10+ minutes | ❌ No |
| New (runtime) | ~2 minutes | ~30 seconds | ✅ Yes |

## 🔧 How It Works

1. **First container start**: 
   - Container starts with minimal R installation
   - Entrypoint script checks if dada2 is available
   - If not, installs essential packages (takes ~2-3 minutes)
   - Packages are stored in persistent volume

2. **Subsequent starts**:
   - Container starts quickly (~30 seconds)
   - Entrypoint finds packages already installed
   - Pipeline is ready immediately

## 🐛 Troubleshooting

### "dada2 not found" error
```bash
# Check if volume has packages
docker volume inspect microbrsoil_r-packages

# Remove volume to force reinstall
docker-compose down
docker volume rm microbrsoil_r-packages
docker-compose up -d
```

### Slow first startup
This is expected! The first time you start the worker container, it needs to install R packages. This takes 2-3 minutes but only happens once.

### Build hanging
If the Docker build hangs, it's likely due to network issues downloading packages. Try:
```bash
docker-compose down
docker-compose build --no-cache worker
```

## 📁 Files Modified

- `backend/Dockerfile.worker` - Simplified to not install packages during build
- `docker-compose.yml` - Added persistent volume for R packages
- `pipeline-r/check_r_packages.R` - Fast package verification script
- `backend/src/integrations/run_*.js` - Simplified package checking

## 🔍 Monitoring

To see what's happening during startup:
```bash
# Watch worker logs
docker-compose logs -f worker

# Check R package installation progress
docker-compose exec worker tail -f /var/log/R.log  # If logging is enabled
```

## 💡 Benefits

1. **Faster builds**: Docker build is now ~2 minutes instead of 10+
2. **Reliable installs**: No more hanging builds
3. **Persistent packages**: Packages survive container restarts
4. **Better debugging**: Can see package installation progress in logs
5. **Incremental updates**: Only missing packages are installed
