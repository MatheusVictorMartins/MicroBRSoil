const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel unica

const createSample = async ({ id, taxArray, otuArray }) => {
    try {
        console.log(id, taxArray, otuArray);
        const query = `insert into microbrsoil_db.sample
                        (soil_id, plant_sequence, tax_kingdom, tax_phylum, tax_class, tax_order, tax_family, tax_genus, tax_species, otu_test1, otu_test2)
                        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`;
        const values = [id, taxArray[0], taxArray[1], taxArray[2], taxArray[3], taxArray[4], taxArray[5], taxArray[6], taxArray[7], otuArray[0], otuArray[1]];
        const response = await pool.query(query, values);
        if (response.rowCount === 0) {
            throw `Resposta ruim em createSample, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\nSucesso em createSample\nLinha obtida:\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\nErro em createSample\nerro: " + err);
        return false;
    }
}


const getSample = async (id = 0) => {
    try {
        if (id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta em getSample\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.sample`;
            const response = await pool.query(query);
            let regex = /\{/ig;//regex para o replace ser ativado multiplas vezes, permite que o retorno seja apresentado em linhas diferentes
            writeLog("\nSucesso em getSample\nLinhas obtidas: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.sample where role_id = $1`;
            const values = [id];
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim em getSample, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\nSucesso em getSample\nLinha obtida:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\nErro em getSample\n" + err);
        return false;
    }
}

const getDistinctSpecies = async () => {
    try {
        const query = `select distinct tax_species from microbrsoil_db.sample`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Resposta ruim em getDistinctSpecies, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\nSucesso em getDistinctSpecies\nQuantidade de especies obtidas: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\nErro em getDistinctSpecies\n" + err);
        return false;
    }
}

const getDistinctGenus = async () => {
    try {
        const query = `select distinct tax_genus from microbrsoil_db.sample`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Resposta ruim em getDistinctGenus, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\nSucesso em getDistinctGenus\nQuantidade de genus obtidos: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\nErro em getDistinctGenus\n" + err);
        return false;
    }
}

const getSampleByExactSequence = async (sequenceString) => {
    try {
        const query = `select * from sample where sequence = $1`;
        const values = [sequenceString];
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim em getDistinctGenus, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\nSucesso em getSampleByExactSequence\nLinha: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\nErro em getSampleByExactSequence\n" + err)
        return false;
    }
}

module.exports = {
    createSample,
    getSample,
    getDistinctGenus,
    getDistinctSpecies,
    getSampleByExactSequence
}