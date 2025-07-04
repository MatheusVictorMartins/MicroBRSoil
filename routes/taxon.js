const express = require('express');
const router = express.Router();
const sampleFunctions = require("../db/db_functions/sample_funtion");

// <script>
// const startResponse = await fetch(`/taxon_search/populateList/`, {
// 		method: 'POST',
// 		headers: { 'Content-Type': 'application/json' }
// });
//  console.log(startResponse); // todas as espécies diferentes.
//  document.getElementById() //Edição caralhuda da lista
//
// </script>

// router.post('/populateList/species', isAuthenticated, async (req, res) => {
// 	try {
// 	    console.log(req.params.species)
// 	} catch (err) {
// 		logger.logError(err);
// 		res.status(500).json({ message: 'Erro ao iniciar ou carregar chat' });
// 	}
// });

// router.post('/'); // -> taxon_search/submit

router.get('/', async (req, res) =>{
    const speciesList = await sampleFunctions.getDistinctSpecies();
    const genusList = await sampleFunctions.getDistinctGenus();
    // res.json({lis1: speciesList.rows, list2: genusList.rows});funciona!!!!
    res.sendFile(path.join(htmlPath, 'taxon_search.html'));
} ); // -> /taxon_search

// router.post('/submit'); // -> taxon_search/submit
// router.get('/:id/result'); // -> taxon_search/:id/result

module.exports = router;