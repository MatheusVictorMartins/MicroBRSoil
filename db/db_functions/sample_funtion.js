const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel unica

const createSample = async ({ id, taxArray, otuArray }) => {
    const values = [id, taxArray[0], taxArray[1], taxArray[2], taxArray[3], taxArray[4], taxArray[5], taxArray[6], taxArray[7], otuArray[0], otuArray[1]];
    try {
        const query = `insert into microbrsoil_db.sample
                        (soil_id, plant_sequence, tax_kingdom, tax_phylum, tax_class, tax_order, tax_family, tax_genus, tax_species, otu_test1, otu_test2)
                        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`;
        const response = await pool.query(query, values);
        if (response.rowCount === 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha obtida:\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}


const getSample = async (id = 0) => {
    const values = [id];
    try {
        if (id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.sample`;
            const response = await pool.query(query);
            let regex = /\{/ig;//regex para o replace ser ativado multiplas vezes, permite que o retorno seja apresentado em linhas diferentes
            writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinhas obtidas: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.sample where role_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha obtida:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

const getDistinctSpecies = async () => {
    try {
        const query = `select distinct tax_species from microbrsoil_db.sample`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nQuantidade de especies obtidas: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err);
        return false;
    }
}

const getDistinctGenus = async () => {
    try {
        const query = `select distinct tax_genus from microbrsoil_db.sample`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nQuantidade de genus obtidos: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err);

        return false;
    }
}

const getSampleByExactSequence = async (sequenceString) => {
    const values = [sequenceString];
    try {
        const query = `select * from microbrsoil_db.sample where plant_sequence = $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

const getSampleBySimilarity = async (sequenceString) => {
    const values = ['%'+sequenceString+'%'];
    try{
        const query = `select * FROM microbrsoil_db.sample WHERE plant_sequence ILIKE $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0){
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha: " + JSON.stringify(response.rowCount));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);

        return false;
    }
}

const getSamplesByGenus = async (genus) => {
    const values = [genus];
    try {
        const query = `select * from microbrsoil_db.sample where tax_genus = $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}


const getSamplesBySpecies = async (species) => {
    const values = [species];
    try {
        const query = `select * from microbrsoil_db.sample where tax_species = $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

module.exports = {
    createSample,
    getSample,
    getDistinctGenus,
    getDistinctSpecies,
    getSampleByExactSequence,
    getSampleBySimilarity,
    getSamplesByGenus,
    getSamplesBySpecies
}