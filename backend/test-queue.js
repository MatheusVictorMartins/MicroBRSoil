const { addPipelineJob, queue, queueEvents } = require('./src/queues');

async function testQueue() {
  console.log('Testing BullMQ setup...');
  
  try {
    // Test adding a job
    const job = await addPipelineJob({
      runId: 'test-run-id',
      fastqPath: '/test/path.fastq',
      pipelineType: 'test',
      meta: { test: true }
    });
    
    console.log('✅ Job added successfully:', job.id);
    
    // Test queue statistics
    const waiting = await queue.getWaiting();
    console.log('📋 Jobs waiting:', waiting.length);
    
    // Clean up test job
    await job.remove();
    console.log('🧹 Test job removed');
    
    console.log('✅ Queue test completed successfully');
    
  } catch (error) {
    console.error('❌ Queue test failed:', error.message);
  } finally {
    await queue.close();
    await queueEvents.close();
    process.exit(0);
  }
}

testQueue();
