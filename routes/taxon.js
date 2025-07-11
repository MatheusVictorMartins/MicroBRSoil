const express = require('express');
const router = express.Router();
const sampleFunctions = require("../db/db_functions/sample_funtion");
const path = require('path');
const writeLog = require('../db/log_files/log_handler');

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

router.get('/api/getLists', async (req, res) => {
    const speciesList = await sampleFunctions.getDistinctSpecies();
    const genusList = await sampleFunctions.getDistinctGenus();
    
    res.json({ speciesList: speciesList.rows, genusList: genusList.rows });
}); //recupera listas do BD, será usado em um fetchmno client-side

router.get('/', async (req, res) => {
    res.sendFile(path.join(htmlPath, 'taxon_search.html'));
}); // -> /taxon_search

router.post('/submit', async (req, res) => {
    writeLog("\n[REQUISIÇÃO.BODY]: " + JSON.stringify(req.body));
    const { parameterType, selectedParameter } = req.body;
    if (!parameterType && !selectedParameter) {
        return res.status(400).send('Parâmetro de pesquisa obrigatório.');
    }
    res.redirect(`/${parameterType}/${selectedParameter}/result`);
}); // -> taxon_search/submit

//vai retornar a pagina de resultados
// router.get('taxon_search/:parameterType/:selectedParameter/result', (req,res)=>{});// -> taxon_search/:parameterType/:selectedParameter/result


//fetch api
router.get('/api/:parameterType/:selectedParameter/result', async (req, res) => {//a ideia é que podem ser 3 opções de pesquisa, sequence, genus e species
    writeLog("\n[REQUISIÇÃO.PARAMS]: " + JSON.stringify(req.params));
    const parameterType = req.params.parameterType;
    const selectedParameter = req.params.selectedParameter;

    if (!parameterType && selectedParameter) {
        return res.status(400).send('Parâmetro de pesquisa obrigatório.');
    }

    if(parameterType == 'sequence'){

    }else if(parameterType == 'genus'){
        const sampleList = await sampleFunctions.getSamplesByGenus(selectedParameter);
        res.json({sampleList: sampleList.rows});
    }else{
        const sampleList = await sampleFunctions.getSamplesBySpecies(selectedParameter);
        res.json({sampleList: sampleList.rows});
    }

}); // -> api/taxon_search/:id/result



module.exports = router;