const express = require('express');
const router = express.Router();
const path = require('path');

const { paths } = require('../utils/moduleResolver');
const sampleFunctions = require(paths.sampleFunctions());
const writeLog = require(paths.logHandler());
const { requireAuth } = require('../middleware/authenticate');
const { createResponseCache } = require('../middleware/responseCache');
const { createRateLimiter } = require('../middleware/rateLimit');

const htmlPath = path.join(path.dirname(__dirname), 'src', 'html');

const sequenceResultCache = createResponseCache({
    ttlMs: 60 * 1000,
    maxEntries: 300,
    keyPrefix: 'sequence:results'
});

const sequenceLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Too many sequence search requests. Please slow down.'
});


router.get('/api/result', requireAuth, sequenceLimiter, sequenceResultCache, async (req, res) => {
    // Sequence input from HTML
    const seq = req.query.tselect_sh;
    const hitSeq = await sampleFunctions.getSampleByExactSequence(seq);
    res.json({ foundSequence: hitSeq.rows})
})

router.get('/', async (req, res) =>{
    res.sendFile(path.join(htmlPath, 'sequence_search.html'));
})// Loading sequence search HTML

router.get('/api/approximateResults', requireAuth, sequenceLimiter, sequenceResultCache, async (req, res) =>{
    const seq = req.query.tselect_sh;
    const hitSeq = await sampleFunctions.getSampleBySimilarity(seq);
    res.json({ foundSequences: hitSeq.rows})
})// Approximate search route



module.exports = router;
