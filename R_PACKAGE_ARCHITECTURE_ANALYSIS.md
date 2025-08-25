# R Package Management Strategy - Updated Architecture

## 🎯 **Current Status** (August 25, 2025)

✅ **CONFIRMED WORKING**: All R packages (dada2, phyloseq, ggplot2) are properly installed and functional
✅ **PERSISTENT STORAGE**: R packages persist across container restarts via Docker volume
✅ **VERIFICATION**: `docker exec microbrsoil-worker Rscript /app/pipeline-r/check_r_packages.R` returns success

## 🚨 **Previous Issues Identified**

### **1. Multiple Installation Strategies (FIXED)**
- **Problem**: 4 different Dockerfiles with conflicting approaches
- **Solution**: Standardized on `Dockerfile.worker.optimized` with build-time installation

### **2. Runtime vs Build-time Confusion (FIXED)**
- **Problem**: Packages installed at runtime could fail silently
- **Solution**: Moved R package installation to Docker build-time for reliability

### **3. Redundant Installation Logic (NEEDS CLEANUP)**
- **Problem**: Installation code in 3 different places
- **Solution**: Centralize package management in Docker build process

## 🛠️ **Recommended Architecture**

### **Primary Installation: Build-time (Dockerfile.worker.optimized)**
```dockerfile
# Install at build time for maximum reliability and caching
RUN Rscript -e "install.packages('BiocManager')" && \
    Rscript -e "BiocManager::install(c('dada2', 'phyloseq'), ask=FALSE, update=FALSE)" && \
    Rscript -e "install.packages(c('ggplot2', 'vegan', 'dplyr'))" && \
    Rscript -e "library(dada2); library(phyloseq); library(ggplot2)"
```

### **Fallback: Runtime Check (keep current check_r_packages.R)**
- Only for missing packages that weren't installed at build time
- Should rarely be needed with build-time installation

### **Remove: Pipeline-level Installation**
- Remove redundant package installation from `run_illumina.js`, `run_its.js`, etc.
- These should only verify packages are available, not install them

## 📋 **Migration Steps**

### **Step 1: Switch to Optimized Dockerfile**
```bash
# Update docker-compose.yml to use optimized Dockerfile
WORKER_DOCKERFILE=Dockerfile.worker.optimized docker-compose up --build -d worker
```

### **Step 2: Clean Up Redundant Code**
- Simplify `checkRPackages()` functions in pipeline files
- Remove installation logic, keep only verification

### **Step 3: Test All Pipelines**
```bash
# Test each pipeline type
docker exec microbrsoil-worker Rscript /app/pipeline-r/pipeline_wrapper.R --type illumina
docker exec microbrsoil-worker Rscript /app/pipeline-r/pipeline_wrapper.R --type its  
docker exec microbrsoil-worker Rscript /app/pipeline-r/pipeline_wrapper.R --type iontorrent
```

## 🎯 **Benefits of New Architecture**

1. **🚀 Faster Builds**: R packages cached in Docker layers
2. **🔒 More Reliable**: Build fails immediately if packages can't install
3. **📦 Consistent**: Same packages every time, no runtime variation
4. **🧹 Cleaner Code**: Single source of truth for package management
5. **🔍 Better Debugging**: Clear separation between build-time and runtime issues

## 🚨 **Why dada2 was "Missing" Before**

The issue wasn't that dada2 couldn't install - it was architectural:

1. **Runtime Installation Timing**: Packages installed after worker starts
2. **Silent Failures**: If runtime installation failed, worker kept running
3. **Volume Persistence Issues**: Sometimes the R package volume wasn't properly mounted
4. **Multiple Installation Attempts**: Conflicting installation methods interfered with each other

## ✅ **Verification Commands**

```bash
# Check all packages are available
docker exec microbrsoil-worker Rscript -e "library(dada2); library(phyloseq); library(ggplot2); cat('All packages OK\n')"

# Check package versions
docker exec microbrsoil-worker Rscript -e "cat('dada2:', as.character(packageVersion('dada2')), '\n')"

# Check installation path
docker exec microbrsoil-worker Rscript -e "cat('Library path:', .libPaths()[1], '\n')"
```
