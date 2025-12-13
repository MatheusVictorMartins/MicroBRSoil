# Worker Task Management Scripts

This directory contains PowerShell scripts for managing BullMQ worker tasks.

## Scripts

### 1. cancel-all-tasks.ps1 (Detailed Version)
Full-featured script with detailed output and error handling.

**Usage:**
```powershell
.\cancel-all-tasks.ps1
```

**Features:**
- Shows detailed job counts before cancellation
- Progress updates for each job
- Summary report after completion
- Verification of final queue state
- Error handling and reporting

**Output Example:**
```
================================================
  MicroBRSoil - Cancel All Worker Tasks
================================================

Fetching all jobs...

=== JOBS FOUND ===
Waiting: 0
Active: 1
Delayed: 0
Total: 1

=== CANCELING JOBS ===
Canceling active job: 33a15e1a-ccb1-4ef8-9362-6fa55a298049

=== SUMMARY ===
Successfully canceled: 1
Failed to cancel: 0
Total processed: 1

=== FINAL QUEUE STATE ===
Waiting: 0
Active: 0
Delayed: 0

✅ All jobs successfully canceled!
```

---

### 2. cancel-tasks-quick.ps1 (Quick Version)
Single-line execution for fast cancellation.

**Usage:**
```powershell
.\cancel-tasks-quick.ps1
```

**Features:**
- Fast execution
- Minimal output
- Same functionality as detailed version
- Perfect for automation

**Output Example:**
```
🛑 Canceling all worker tasks...
Found: 0 waiting, 1 active, 0 delayed
✅ Canceled 1 jobs
Remaining: 0 waiting, 0 active, 0 delayed

✅ Done! Consider restarting the worker:
  docker-compose restart worker
```

---

## What Gets Canceled

Both scripts will cancel:
- ✅ **Waiting jobs** - Jobs queued but not yet started
- ✅ **Active jobs** - Jobs currently being processed
- ✅ **Delayed jobs** - Jobs scheduled for future execution

## Important Notes

### ⚠️ Active Job Cancellation
When canceling **active jobs** (jobs currently running):
- The job will be marked as failed in Redis
- The R pipeline process may continue running in the worker container
- **Recommended**: Restart the worker after canceling active jobs to ensure clean state

```powershell
docker-compose restart worker
```

### ⚠️ Data Safety
- Canceling jobs does **NOT** delete uploaded files
- Files remain in `/uploads/{runId}/` directory
- Partial results may remain in `/results/{runId}/` directory
- Database records for completed operations are **NOT** affected

### ⚠️ When to Use
Use these scripts when:
- Testing or development requires clearing the queue
- A job is stuck or stalled
- You need to stop processing immediately
- Queue cleanup is needed before deployment

### ⚠️ When NOT to Use
Do **NOT** use if:
- Jobs are processing important production data
- You want to preserve job history
- You just want to pause processing (use `docker-compose stop worker` instead)

---

## Alternative Methods

### Manual Cancellation (Single Job)
Cancel a specific job by ID:
```powershell
docker-compose exec backend-api node -e "const {queue}=require('./src/queues');(async()=>{const job=await queue.getJob('JOB_ID_HERE');if(job){await job.remove();console.log('Canceled')}else{console.log('Not found')};process.exit(0)})()"
```

### Pause Queue (Stop Processing New Jobs)
```powershell
docker-compose exec backend-api node -e "const {queue}=require('./src/queues');(async()=>{await queue.pause();console.log('Queue paused');process.exit(0)})()"
```

### Resume Queue
```powershell
docker-compose exec backend-api node -e "const {queue}=require('./src/queues');(async()=>{await queue.resume();console.log('Queue resumed');process.exit(0)})()"
```

### Stop Worker (Graceful)
```powershell
docker-compose stop worker
```

### Restart Worker (Clean State)
```powershell
docker-compose restart worker
```

---

## Queue Status Check

Before or after canceling, check queue status:

```powershell
docker-compose exec backend-api node -e "const {queue}=require('./src/queues');(async()=>{const w=await queue.getWaiting();const a=await queue.getActive();const d=await queue.getDelayed();const c=await queue.getCompleted();const f=await queue.getFailed();console.log('Waiting:',w.length);console.log('Active:',a.length);console.log('Delayed:',d.length);console.log('Completed:',c.length);console.log('Failed:',f.length);process.exit(0)})()"
```

---

## Troubleshooting

### "docker-compose not found"
Ensure Docker Desktop is running and docker-compose is in your PATH.

### "Cannot connect to backend-api"
Ensure containers are running:
```powershell
docker-compose ps
```

Start containers if needed:
```powershell
docker-compose up -d
```

### "Job still showing as active"
After canceling active jobs, restart the worker:
```powershell
docker-compose restart worker
```

### "Permission denied"
Run PowerShell as Administrator or adjust execution policy:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## Related Documentation

- `QUEUE_STATUS_REPORT.md` - Current queue status and analysis
- `QUEUE_CLEANUP_REPORT.md` - Previous cleanup operations
- `LOCK_FIX_REPORT.md` - Lock management improvements
- `DUPLICATE_JOB_ISSUE.md` - Understanding job retries

---

**Created**: October 15, 2025
**Last Updated**: October 15, 2025
**Compatibility**: PowerShell 5.1+, PowerShell Core 7+
