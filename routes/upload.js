const express = require('express');
const multer = require('multer');
const path = require('path');
const csv = require('csv-parser');
const authenticate = require('../middleware/authenticate');

// =========================================================================
//                           PLACEHOLDER
// =========================================================================
const { samples } = require('../utils/fakeDB');
// =========================================================================

const router = express.Router();
const htmlPath = path.join(__dirname, '..', 'src', 'html');

// Define onde salvar os arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // pasta onde salvar
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// Endpoint POST para upload dos 3 arquivos
router.post('/profile', upload.fields([
  { name: 'fastq_file', maxCount: 1 },
  { name: 'csv_file', maxCount: 1 },
  { name: 'map_file', maxCount: 1 }
]), (req, res) => {
  console.log('Arquivos recebidos:', req.files);
  res.send('Arquivos enviados com sucesso!');
});

router.get('/page', authenticate, (req, res) => {
  res.sendFile(path.join(htmlPath, 'upload.html'));
});

module.exports = router;