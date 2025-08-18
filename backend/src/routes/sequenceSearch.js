const express = require('express');
const router = express.Router();
const path = require('path');

const sampleFunctions = require("../../db/db_functions/sample_funtion");
const writeLog = require('../../db/log_files/log_handler');

const htmlPath = path.join(path.dirname(__dirname), 'src', 'html');


router.get('/api/result', async (req, res) => {
    //Entrada da seq pelo html
    const seq = req.query.tselect_sh;
    const hitSeq = await sampleFunctions.getSampleByExactSequence(seq);
    res.json({ foundSequence: hitSeq.rows})
})

router.get('/', async (req, res) =>{
    res.sendFile(path.join(htmlPath, 'sequence_search.html'));
})// Carregando o html de sequence search

router.get('/api/approximateResults', async (req, res) =>{
    const seq = req.query.tselect_sh;
    const hitSeq = await sampleFunctions.getSampleBySimilarity(seq);
    res.json({ foundSequences: hitSeq.rows})
})//Rota de search aproximada



module.exports = router;