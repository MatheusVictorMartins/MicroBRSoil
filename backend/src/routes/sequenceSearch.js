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
    const seq = normalizeSequence(req.query.tselect_sh || '');
    if (!seq) {
        return res.status(400).json({ success: false, error: 'Sequence is required.' });
    }
    const hitSeq = await sampleFunctions.getSampleByExactSequence(seq);
    if (!hitSeq || !Array.isArray(hitSeq.rows)) {
        return res.status(500).json({ success: false, error: 'Sequence search failed.' });
    }
    res.json({ success: true, foundSequence: hitSeq.rows });
})

router.get('/', async (req, res) =>{
    res.sendFile(path.join(htmlPath, 'sequence_search.html'));
})// Loading sequence search HTML

router.get('/api/approximateResults', requireAuth, sequenceLimiter, sequenceResultCache, async (req, res) =>{
    const seq = normalizeSequence(req.query.tselect_sh || '');
    if (!seq) {
        return res.status(400).json({ success: false, error: 'Sequence is required.' });
    }
    const hitSeq = await sampleFunctions.getSampleBySimilarity(seq, { limit: 50, minSimilarity: 0.3 });
    if (!hitSeq || !Array.isArray(hitSeq.rows)) {
        return res.status(500).json({ success: false, error: 'Sequence search failed.' });
    }
    res.json({ success: true, foundSequences: hitSeq.rows })
})// Approximate search route

router.post('/api/search', requireAuth, sequenceLimiter, async (req, res) => {
    const body = req.body || {};
    const rawSequences = Array.isArray(body.sequences) ? body.sequences : (body.sequence ? [body.sequence] : []);
    const mode = String(body.mode || 'exact').toLowerCase();
    const limit = Number(body.limit || 50);
    const minSimilarity = Number(body.minSimilarity || 0.3);

    const sequences = rawSequences
        .map((seq) => normalizeSequence(seq))
        .filter(Boolean)
        .slice(0, 100);

    if (!sequences.length) {
        return res.status(400).json({ success: false, error: 'Sequence is required.' });
    }

    if (!['exact', 'best', 'group'].includes(mode)) {
        return res.status(400).json({ success: false, error: 'Invalid search mode.' });
    }

    const results = [];

    for (const seq of sequences) {
        if (mode === 'exact') {
            const hitSeq = await sampleFunctions.getSampleByExactSequence(seq);
            results.push({
                query: seq,
                matches: hitSeq?.rows || []
            });
            continue;
        }

        const hitSeq = await sampleFunctions.getSampleBySimilarity(seq, { limit, minSimilarity });
        const matches = hitSeq?.rows || [];

        if (mode === 'best') {
            results.push({
                query: seq,
                matches: matches.length ? [matches[0]] : []
            });
            continue;
        }

        results.push({
            query: seq,
            matches,
            grouped: groupByTaxon(matches)
        });
    }

    res.json({ success: true, mode, results });
});

function normalizeSequence(sequence) {
    if (!sequence) return '';
    return String(sequence)
        .replace(/\s+/g, '')
        .toUpperCase()
        .trim();
}

function groupByTaxon(matches) {
    const groups = new Map();
    matches.forEach((row) => {
        const sample = row?.sample || {};
        const taxon =
            sample.tax_species ||
            sample.tax_genus ||
            sample.tax_family ||
            sample.tax_order ||
            sample.tax_class ||
            sample.tax_phylum ||
            sample.tax_kingdom ||
            'Unknown';
        const key = String(taxon);
        const current = groups.get(key) || { taxon: key, count: 0 };
        current.count += 1;
        groups.set(key, current);
    });
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}



module.exports = router;
