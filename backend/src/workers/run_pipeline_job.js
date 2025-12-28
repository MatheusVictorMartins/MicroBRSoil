function getPayload() {
  const raw = process.env.PIPELINE_JOB_PAYLOAD || process.argv[2];
  if (!raw) {
    throw new Error('Missing pipeline job payload.');
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid pipeline job payload.');
  }
}

async function runPipeline(payload) {
  const pipelineType = String(payload.pipelineType || '').toLowerCase();
  const fastqPath = payload.fastqPath;
  const outputDir = payload.outputDir || null;
  const barcodesPath = payload.barcodesPath || null;

  if (!pipelineType || !fastqPath) {
    throw new Error('Pipeline type and input path are required.');
  }

  switch (pipelineType) {
    case 'illumina': {
      const runIlluminaPipeline = require('../integrations/run_illumina');
      return runIlluminaPipeline(fastqPath, outputDir);
    }
    case 'iontorrent': {
      const runIonTorrentPipeline = require('../integrations/run_iontorrent');
      return runIonTorrentPipeline(fastqPath, outputDir, barcodesPath);
    }
    case 'its': {
      const runITSPipeline = require('../integrations/run_its');
      return runITSPipeline(fastqPath, outputDir);
    }
    default:
      throw new Error(`Unsupported pipeline type: ${pipelineType}`);
  }
}

async function main() {
  const payload = getPayload();
  await runPipeline(payload);
}

main()
  .then(() => {
    if (process.send) {
      process.send({ success: true });
    }
    process.exit(0);
  })
  .catch((error) => {
    const message = error?.stack || error?.message || String(error);
    console.error(message);
    if (process.send) {
      process.send({ success: false, error: error?.message || 'Pipeline failed.' });
    }
    process.exit(1);
  });
