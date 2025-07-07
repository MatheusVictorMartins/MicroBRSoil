const express = require('express');
const router = express.Router();
const sampleFunctions = require("../db/db_functions/sample_funtion");
const path = require('path');

const htmlPath = path.join(path.dirname(__dirname), 'src', 'html');


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

router.get('/api/getLists', async (req, res) =>{
    const speciesList = await sampleFunctions.getDistinctSpecies();
    const genusList = await sampleFunctions.getDistinctGenus();
    res.json({speciesList: speciesList.rows, genusList: genusList.rows});
}); //recupera listas do BD, será usado em um fetchmno client-side

router.get('/', async (req, res) =>{
    res.sendFile(path.join(htmlPath, 'taxon_search.html'));
}); // -> /taxon_search

// router.post('/submit'); // -> taxon_search/submit
// router.get('/:id/result'); // -> taxon_search/:id/result

module.exports = router;