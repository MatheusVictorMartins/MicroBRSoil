const express = require('express');
const { pipelines } = require('../utils/fakeDB');
const authenticate = require('../middleware/authenticate');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Iniciar pipeline
router.post('/run/:id', authenticate, (req, res) => {
  const pipelineId = req.params.id;
  const runId = uuidv4();
  pipelines[runId] = { log: `Pipeline ${pipelineId} started by user ${req.user.username}` };
  res.json({ message: 'Pipeline started', runId });
});

// Consultar logs
router.get('/logs/:id', authenticate, (req, res) => {
  const runId = req.params.id;
  const pipeline = pipelines[runId];
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
  res.json({ log: pipeline.log });
});

module.exports = router;
