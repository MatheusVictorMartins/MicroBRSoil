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
    
    res.json({ speciesList: speciesList.rows, genusList: genusList.rows });
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
    const parameterType = req.params.parameterType;
    const selectedParameter = req.params.selectedParameter;

    if (!parameterType && selectedParameter) {
        return res.status(400).send('Search parameter is required.');
    }

   if(parameterType == 'genus'){
        const sampleList = await sampleFunctions.getSamplesByGenus(selectedParameter);
    }else{
        const sampleList = await sampleFunctions.getSamplesBySpecies(selectedParameter);
    }
    
    if(sampleList.rowCount === 0){
        res.status(500).send("No rows found for the selected parameter");
    }else{
        res.json({sampleList: sampleList.rows});
    }
}); // -> api/taxon_search/:id/result



module.exports = router;


