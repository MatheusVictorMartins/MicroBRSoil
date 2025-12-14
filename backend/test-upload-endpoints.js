const express = require('express');
const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Mock the dependencies
jest.mock('./src/queues', () => ({
  addPipelineJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' })
}));

jest.mock('./src/utils/fakeDB', () => ({
  pipelines: {}
}));

jest.mock('/app/db/db_functions/pipeline_functions', () => ({
  createPipelineRun: jest.fn().mockResolvedValue(true),
  updatePipelineRunStatus: jest.fn().mockResolvedValue(true)
}));

jest.mock('/app/db/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}));

const uploadRouter = require('./src/routes/upload');

const app = express();
app.use('/api/upload', uploadRouter);

describe('Upload Endpoints', () => {
  const testFile = Buffer.from('mock fastq content');
  
  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
  });

  describe('POST /api/upload/illumina', () => {
    it('should upload file and queue Illumina pipeline job', async () => {
      const response = await request(app)
        .post('/api/upload/illumina')
        .attach('fastq', testFile, 'test.fastq')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pipelineType).toBe('illumina');
      expect(response.body.runId).toBeDefined();
      expect(response.body.jobId).toBe('mock-job-id');
      expect(response.body.uploadPath).toMatch(/uploads\/[a-f0-9-]+/);
    });

    it('should return error if no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/upload/illumina')
        .expect(400);

      expect(response.body.error).toBe('No file uploaded');
    });
  });

  describe('POST /api/upload/iontorrent', () => {
    it('should upload file and queue IonTorrent pipeline job', async () => {
      const response = await request(app)
        .post('/api/upload/iontorrent')
        .attach('fastq', testFile, 'test.fastq')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pipelineType).toBe('iontorrent');
      expect(response.body.runId).toBeDefined();
      expect(response.body.jobId).toBe('mock-job-id');
    });
  });

  describe('POST /api/upload/its', () => {
    it('should upload file and queue ITS pipeline job', async () => {
      const response = await request(app)
        .post('/api/upload/its')
        .attach('fastq', testFile, 'test.fastq')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pipelineType).toBe('its');
      expect(response.body.runId).toBeDefined();
      expect(response.body.jobId).toBe('mock-job-id');
    });
  });

  describe('POST /api/upload/file (legacy)', () => {
    it('should upload file with default pipeline type', async () => {
      const response = await request(app)
        .post('/api/upload/file')
        .attach('file', testFile, 'test.fastq')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pipelineType).toBe('illumina');
    });

    it('should respect pipelineType from body', async () => {
      const response = await request(app)
        .post('/api/upload/file')
        .field('pipelineType', 'its')
        .attach('file', testFile, 'test.fastq')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pipelineType).toBe('its');
    });
  });
});

// Manual test function for development
async function manualTest() {
  console.log('🧪 Manual Upload Endpoint Test');
  
  const testEndpoints = [
    { endpoint: '/illumina', type: 'illumina' },
    { endpoint: '/iontorrent', type: 'iontorrent' },
    { endpoint: '/its', type: 'its' }
  ];

  for (const test of testEndpoints) {
    console.log(`\n📤 Testing ${test.type} endpoint...`);
    
    try {
      const response = await request(app)
        .post(`/api/upload${test.endpoint}`)
        .attach('fastq', Buffer.from('mock fastq data'), 'test.fastq');

      if (response.status === 200) {
        console.log(`✅ ${test.type} endpoint working`);
        console.log(`   Run ID: ${response.body.runId}`);
        console.log(`   Upload Path: ${response.body.uploadPath}`);
      } else {
        console.log(`❌ ${test.type} endpoint failed: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${test.type} endpoint error:`, error.message);
    }
  }
}

// Run manual test if this file is executed directly
if (require.main === module) {
  manualTest().catch(console.error);
}

module.exports = { manualTest };