# Worker Task Cancellation Scripts - Quick Reference

## 📋 Available Scripts

### Option 1: Quick Cancel (Recommended)
**File**: `cancel-tasks-quick.ps1`

Fast, single-command execution:
```powershell
.\cancel-tasks-quick.ps1
```

### Option 2: Detailed Cancel
**File**: `cancel-all-tasks.ps1`

Full output with progress tracking:
```powershell
.\cancel-all-tasks.ps1
```

---

## 🚀 Quick Start

1. **Open PowerShell in project directory**
   ```powershell
   cd C:\Users\Tomas\Documents\project\MicroBRSoil
   ```

2. **Run the quick cancel script**
   ```powershell
   .\cancel-tasks-quick.ps1
   ```

3. **Restart worker (if active jobs were canceled)**
   ```powershell
   docker-compose restart worker
   ```

---

## 📊 What Each Script Does

### Cancel Operations
Both scripts perform the same cancellation logic:

1. ✅ **Fetch all jobs** from the queue
   - Waiting jobs (not started)
   - Active jobs (currently running)
   - Delayed jobs (scheduled for later)

2. ✅ **Cancel each job**
   - Remove waiting jobs
   - Mark active jobs as failed and remove
   - Remove delayed jobs

3. ✅ **Report results**
   - Show how many jobs were canceled
   - Display final queue state

### Differences

| Feature | Quick Script | Detailed Script |
|---------|-------------|-----------------|
| Execution Speed | ⚡ Fast | 🐢 Moderate |
| Output Detail | 📝 Minimal | 📊 Comprehensive |
| Progress Updates | ❌ No | ✅ Yes |
| Error Details | ❌ No | ✅ Yes |
| Best For | Daily use | Troubleshooting |

---

## ⚠️ Important Warnings

### Active Jobs
When you cancel **active jobs** (jobs currently running):
- The R pipeline may still be executing in the worker container
- The job is marked as failed in Redis, but the process continues
- **Always restart the worker** after canceling active jobs

### Data Preservation
Canceling jobs does **NOT** delete:
- ✅ Uploaded files in `/uploads/`
- ✅ Result files in `/results/`
- ✅ Database records already created
- ✅ Completed job history

### When to Cancel
✅ **Good reasons to cancel**:
- Development/testing cleanup
- Stuck or stalled jobs
- Emergency stop needed
- Queue maintenance

❌ **Bad reasons to cancel**:
- Production data processing
- Just to check queue status (use status scripts instead)
- Normal job completion (let them finish)

---

## 🔍 Check Before Canceling

Always check queue status first:
```powershell
docker-compose exec backend-api node -e "const {queue}=require('./src/queues');(async()=>{const w=await queue.getWaiting();const a=await queue.getActive();const d=await queue.getDelayed();console.log('Queue Status:');console.log('- Waiting:',w.length);console.log('- Active:',a.length);console.log('- Delayed:',d.length);if(a.length>0){console.log('\nActive Jobs:');a.forEach(j=>console.log('  *',j.id,'-',j.data.pipelineType))}process.exit(0)})()"
```

---

## 🛠️ Troubleshooting

### Script doesn't run
```powershell
# Enable script execution (run as Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Cannot connect to backend"
```powershell
# Check if containers are running
docker-compose ps

# Start if needed
docker-compose up -d
```

### Jobs still showing after cancel
```powershell
# Restart worker to ensure clean state
docker-compose restart worker

# Verify queue is empty
docker-compose exec backend-api node -e "const {queue}=require('./src/queues');(async()=>{const a=await queue.getActive();console.log('Active:',a.length);process.exit(0)})()"
```

---

## 📚 Full Documentation

See `WORKER_SCRIPTS_README.md` for:
- Complete command reference
- Alternative methods
- Advanced usage
- Related documentation links

---

**Created**: October 15, 2025  
**Purpose**: Quick reference for task cancellation  
**Status**: ✅ Ready to use
