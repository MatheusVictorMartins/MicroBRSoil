# Quick Cancel All Tasks - Inline Version
# Usage: .\cancel-tasks-quick.ps1

Write-Host "`n🛑 Canceling all worker tasks..." -ForegroundColor Yellow

docker-compose exec backend-api node -e "const {queue}=require('./src/queues');(async()=>{const waiting=await queue.getWaiting();const active=await queue.getActive();const delayed=await queue.getDelayed();console.log('Found:',waiting.length,'waiting,',active.length,'active,',delayed.length,'delayed');let canceled=0;for(const j of waiting){await j.remove();canceled++}for(const j of active){try{await j.moveToFailed({message:'Canceled by user'},true);await j.remove();canceled++}catch(e){console.log('Note: Active job',j.id,'may still be processing')}}for(const j of delayed){await j.remove();canceled++}console.log('✅ Canceled',canceled,'jobs');const w=await queue.getWaiting();const a=await queue.getActive();const d=await queue.getDelayed();console.log('Remaining:',w.length,'waiting,',a.length,'active,',d.length,'delayed');process.exit(0)})()"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Done! Consider restarting the worker:`n  docker-compose restart worker`n" -ForegroundColor Green
} else {
    Write-Host "`n❌ Failed to cancel tasks. Check if containers are running.`n" -ForegroundColor Red
}
