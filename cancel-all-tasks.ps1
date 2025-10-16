# Cancel All Running Tasks in BullMQ Worker Queue
# This script will cancel all active, waiting, and delayed jobs

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  MicroBRSoil - Cancel All Worker Tasks" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if docker-compose is available
$dockerComposeCheck = docker-compose --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: docker-compose not found!" -ForegroundColor Red
    Write-Host "Please ensure Docker Desktop is running and docker-compose is installed." -ForegroundColor Yellow
    exit 1
}

# Node.js script to cancel all jobs
$cancelScript = @'
const { queue } = require('./src/queues');

(async () => {
    try {
        console.log('Fetching all jobs...\n');
        
        // Get all job types
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const delayed = await queue.getDelayed();
        
        const totalJobs = waiting.length + active.length + delayed.length;
        
        console.log('=== JOBS FOUND ===');
        console.log('Waiting:', waiting.length);
        console.log('Active:', active.length);
        console.log('Delayed:', delayed.length);
        console.log('Total:', totalJobs);
        console.log('');
        
        if (totalJobs === 0) {
            console.log('No jobs to cancel.');
            process.exit(0);
        }
        
        console.log('=== CANCELING JOBS ===\n');
        
        let canceledCount = 0;
        let failedCount = 0;
        
        // Cancel waiting jobs
        for (const job of waiting) {
            try {
                console.log(`Canceling waiting job: ${job.id}`);
                await job.remove();
                canceledCount++;
            } catch (error) {
                console.error(`Failed to cancel ${job.id}: ${error.message}`);
                failedCount++;
            }
        }
        
        // Cancel active jobs
        for (const job of active) {
            try {
                console.log(`Canceling active job: ${job.id}`);
                await job.moveToFailed({
                    message: 'Job manually canceled by user'
                }, true);
                await job.remove();
                canceledCount++;
            } catch (error) {
                console.error(`Failed to cancel ${job.id}: ${error.message}`);
                failedCount++;
            }
        }
        
        // Cancel delayed jobs
        for (const job of delayed) {
            try {
                console.log(`Canceling delayed job: ${job.id}`);
                await job.remove();
                canceledCount++;
            } catch (error) {
                console.error(`Failed to cancel ${job.id}: ${error.message}`);
                failedCount++;
            }
        }
        
        console.log('\n=== SUMMARY ===');
        console.log(`Successfully canceled: ${canceledCount}`);
        console.log(`Failed to cancel: ${failedCount}`);
        console.log(`Total processed: ${canceledCount + failedCount}`);
        
        // Verify queue is empty
        console.log('\n=== FINAL QUEUE STATE ===');
        const finalWaiting = await queue.getWaiting();
        const finalActive = await queue.getActive();
        const finalDelayed = await queue.getDelayed();
        
        console.log('Waiting:', finalWaiting.length);
        console.log('Active:', finalActive.length);
        console.log('Delayed:', finalDelayed.length);
        
        if (finalWaiting.length === 0 && finalActive.length === 0 && finalDelayed.length === 0) {
            console.log('\n✅ All jobs successfully canceled!');
        } else {
            console.log('\n⚠️ Some jobs may still be in the queue. Check manually.');
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('Error canceling jobs:', error);
        process.exit(1);
    }
})();
'@

# Save the script to a temporary file
$tempScriptPath = Join-Path $env:TEMP "cancel_jobs.js"
$cancelScript | Out-File -FilePath $tempScriptPath -Encoding UTF8

Write-Host "Connecting to backend container..." -ForegroundColor Yellow
Write-Host ""

# Execute the script in the backend container
try {
    docker-compose exec backend-api node $tempScriptPath
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "================================================" -ForegroundColor Green
        Write-Host "  All tasks have been processed!" -ForegroundColor Green
        Write-Host "================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Note: You may want to restart the worker to ensure clean state:" -ForegroundColor Yellow
        Write-Host "  docker-compose restart worker" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "Error: Failed to cancel jobs. Exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "Error executing cancel script: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
} finally {
    # Clean up temporary file
    if (Test-Path $tempScriptPath) {
        Remove-Item $tempScriptPath -Force
    }
}
