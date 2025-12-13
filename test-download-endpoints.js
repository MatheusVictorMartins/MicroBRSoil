/**
 * Test script for download endpoints
 * Tests both upload and result file download functionality
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const HOST = 'localhost';
const PORT = 3000;

// Test IDs from existing data
const TEST_RUN_ID = '0f1a7c2f-75ce-40b3-9543-bd0ecba4aaf7';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: jsonData });
        } catch (e) {
          // Not JSON, return as string
          resolve({ status: res.statusCode, headers: res.headers, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

function downloadFile(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let bytesReceived = 0;
      
      res.on('data', (chunk) => {
        bytesReceived += chunk.length;
      });
      
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          headers: res.headers, 
          bytesReceived: bytesReceived 
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function testUploadFilesList() {
  console.log('\n=== Testing Upload Files List ===');
  try {
    const response = await makeRequest(`/upload/files/${TEST_RUN_ID}`);
    
    if (response.status === 200 && response.data.files) {
      console.log('✓ Upload files list endpoint works');
      console.log('Files found:', response.data.files.length);
      if (response.data.files.length > 0) {
        console.log('Sample file:', response.data.files[0].name);
        return response.data.files[0];
      }
    } else {
      console.error('✗ Unexpected response:', response.status, response.data);
    }
    return null;
  } catch (error) {
    console.error('✗ Upload files list failed:', error.message);
    return null;
  }
}

async function testUploadFileDownload(filename) {
  console.log('\n=== Testing Upload File Download ===');
  try {
    const response = await downloadFile(`/upload/download/${TEST_RUN_ID}/${filename}`);
    
    if (response.status === 200) {
      console.log('✓ Upload file download endpoint works');
      console.log('Content-Type:', response.headers['content-type']);
      console.log('Content-Disposition:', response.headers['content-disposition']);
      console.log('✓ Successfully downloaded', response.bytesReceived, 'bytes');
      return true;
    } else {
      console.error('✗ Unexpected status:', response.status);
      return false;
    }
  } catch (error) {
    console.error('✗ Upload file download failed:', error.message);
    return false;
  }
}

async function testResultsFilesList() {
  console.log('\n=== Testing Results Files List ===');
  try {
    const response = await makeRequest(`/results/files/${TEST_RUN_ID}`);
    
    if (response.status === 200 && response.data.files) {
      console.log('✓ Results files list endpoint works');
      console.log('Files found:', response.data.files.length);
      if (response.data.files.length > 0) {
        console.log('Sample file:', response.data.files[0].name);
        return response.data.files[0];
      }
    } else {
      console.error('✗ Unexpected response:', response.status, response.data);
    }
    return null;
  } catch (error) {
    console.error('✗ Results files list failed:', error.message);
    return null;
  }
}

async function testResultFileDownload(filename) {
  console.log('\n=== Testing Result File Download ===');
  try {
    const response = await downloadFile(`/results/download/${TEST_RUN_ID}/${filename}`);
    
    if (response.status === 200) {
      console.log('✓ Result file download endpoint works');
      console.log('Content-Type:', response.headers['content-type']);
      console.log('Content-Disposition:', response.headers['content-disposition']);
      console.log('✓ Successfully downloaded', response.bytesReceived, 'bytes');
      return true;
    } else {
      console.error('✗ Unexpected status:', response.status);
      return false;
    }
  } catch (error) {
    console.error('✗ Result file download failed:', error.message);
    return false;
  }
}

async function testInvalidPaths() {
  console.log('\n=== Testing Security (Path Traversal) ===');
  
  // Test path traversal attempt on uploads
  try {
    const response = await makeRequest(`/upload/download/${TEST_RUN_ID}/../../../etc/passwd`);
    if (response.status === 400 || response.status === 404) {
      console.log('✓ Upload endpoint blocks path traversal attempts');
    } else {
      console.error('✗ SECURITY ISSUE: Path traversal not blocked on upload endpoint');
    }
  } catch (error) {
    console.error('? Error testing upload path traversal:', error.message);
  }
  
  // Test path traversal attempt on results
  try {
    const response = await makeRequest(`/results/download/${TEST_RUN_ID}/../../../etc/passwd`);
    if (response.status === 400 || response.status === 404) {
      console.log('✓ Results endpoint blocks path traversal attempts');
    } else {
      console.error('✗ SECURITY ISSUE: Path traversal not blocked on results endpoint');
    }
  } catch (error) {
    console.error('? Error testing results path traversal:', error.message);
  }
}

async function testNonExistentFiles() {
  console.log('\n=== Testing Non-Existent Files ===');
  
  try {
    const response = await makeRequest(`/upload/download/${TEST_RUN_ID}/nonexistent.txt`);
    if (response.status === 404) {
      console.log('✓ Returns 404 for non-existent upload file');
    } else {
      console.error('✗ Should return 404 for non-existent upload file, got:', response.status);
    }
  } catch (error) {
    console.error('? Error testing non-existent upload file:', error.message);
  }
  
  try {
    const response = await makeRequest(`/results/download/${TEST_RUN_ID}/nonexistent.csv`);
    if (response.status === 404) {
      console.log('✓ Returns 404 for non-existent result file');
    } else {
      console.error('✗ Should return 404 for non-existent result file, got:', response.status);
    }
  } catch (error) {
    console.error('? Error testing non-existent result file:', error.message);
  }
}

async function runTests() {
  console.log('Starting Download Endpoints Tests...');
  console.log('Base URL:', BASE_URL);
  console.log('Test Run ID:', TEST_RUN_ID);
  console.log('\nNOTE: Make sure the backend server is running on port 3000');
  
  try {
    // Test upload endpoints
    const uploadFile = await testUploadFilesList();
    if (uploadFile) {
      await testUploadFileDownload(uploadFile.name);
    }
    
    // Test results endpoints
    const resultFile = await testResultsFilesList();
    if (resultFile) {
      await testResultFileDownload(resultFile.name);
    }
    
    // Test security
    await testInvalidPaths();
    await testNonExistentFiles();
    
    console.log('\n=== Test Summary ===');
    console.log('All tests completed. Review output above for results.');
    
  } catch (error) {
    console.error('Test suite error:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
