const express = require('express');
const router = express.Router();
const path = require('path');

const { paths } = require('../utils/moduleResolver');
const sampleFunctions = require(paths.sampleFunctions());
const writeLog = require(paths.logHandler());
const { requireAuth } = require('../middleware/authenticate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { createResponseCache } = require('../middleware/responseCache');

const htmlPath = path.join(path.dirname(__dirname), 'src', 'html');

const taxonLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Too many taxon search requests. Please slow down.'
});

const taxonListCache = createResponseCache({
    ttlMs: 5 * 60 * 1000,
    maxEntries: 100,
    keyPrefix: 'taxon:lists'
});

const taxonResultCache = createResponseCache({
    ttlMs: 60 * 1000,
    maxEntries: 300,
    keyPrefix: 'taxon:results'
});


// <script>
// const startResponse = await fetch(`/taxon_search/populateList/`, {
// 		method: 'POST',
// 		headers: { 'Content-Type': 'application/json' }
// });
//  console.log(startResponse); // all distinct species.
//  document.getElementById() // list editing placeholder
//
// </script>

// router.post('/populateList/species', isAuthenticated, async (req, res) => {
// 	try {
// 	    console.log(req.params.species)
// 	} catch (err) {
// 		logger.logError(err);
// 		res.status(500).json({ message: 'Failed to start or load chat' });
// 	}
// });

// router.post('/'); // -> taxon_search/submit

router.get('/api/getLists', requireAuth, taxonLimiter, taxonListCache, async (req, res) => {
    const speciesList = await sampleFunctions.getDistinctSpecies();
    const genusList = await sampleFunctions.getDistinctGenus();

    const safeSpecies = speciesList && speciesList.rows ? speciesList.rows : [];
    const safeGenus = genusList && genusList.rows ? genusList.rows : [];

    res.json({ success: true, speciesList: safeSpecies, genusList: safeGenus });
}); // fetches lists from the DB, used by a client-side fetch

router.get('/', async (req, res) => {
    res.sendFile(path.join(htmlPath, 'taxon_search.html'));
}); // -> /taxon_search

router.post('/submit', async (req, res) => {
    writeLog("\n[REQUEST.BODY]: " + JSON.stringify(req.body));
    const { parameterType, selectedParameter } = req.body;
    if (!parameterType && !selectedParameter) {
        return res.status(400).send('Search parameter is required.');
    }
    res.redirect(`/${parameterType}/${selectedParameter}/result`);
}); // -> taxon_search/submit

// returns the results page
// router.get('taxon_search/:parameterType/:selectedParameter/result', (req,res)=>{});// -> taxon_search/:parameterType/:selectedParameter/result

//fetch api
router.get('/api/:parameterType/:selectedParameter/result', requireAuth, taxonLimiter, taxonResultCache, async (req, res) => {// idea: two search options, genus and species
    writeLog("\n[REQUEST.PARAMS]: " + JSON.stringify(req.params));
    const parameterType = String(req.params.parameterType || '').toLowerCase();
    const selectedParameter = decodeURIComponent(req.params.selectedParameter || '').trim();

    if (!parameterType || !selectedParameter) {
        return res.status(400).json({ success: false, error: 'Search parameter is required.' });
    }

    let sampleList = null;

    if (parameterType === 'genus') {
        sampleList = await sampleFunctions.getSamplesByGenus(selectedParameter);
    } else if (parameterType === 'species') {
        sampleList = await sampleFunctions.getSamplesBySpecies(selectedParameter);
    } else if (parameterType === 'sh') {
        // SH is treated as an exact sequence match in the local database
        sampleList = await sampleFunctions.getSampleByExactSequence(selectedParameter);
    } else {
        return res.status(400).json({ success: false, error: 'Invalid parameter type.' });
    }

    if (!sampleList || !Array.isArray(sampleList.rows)) {
        return res.status(500).json({ success: false, error: 'Search failed.' });
    }

    res.json({
        success: true,
        count: sampleList.rowCount || 0,
        sampleList: sampleList.rows
    });
}); // -> api/taxon_search/:id/result



module.exports = router;


