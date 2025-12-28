const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//! pass multiple parameters as objects
//! single parameters can be passed as a single variable

const createSample = async ({ id, taxArray, otuArray }) => {
    const values = [id, taxArray[0], taxArray[1], taxArray[2], taxArray[3], taxArray[4], taxArray[5], taxArray[6], taxArray[7], otuArray[0], otuArray[1]];
    try {
        const query = `insert into microbrsoil_db.sample
                        (soil_id, plant_sequence, tax_kingdom, tax_phylum, tax_class, tax_order, tax_family, tax_genus, tax_species, otu_test1, otu_test2)
                        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`;
        const response = await pool.query(query, values);
        if (response.rowCount === 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow fetched:\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
        return false;
    }
}


const getSample = async (id = 0) => {
    const values = [id];
    try {
        if (id === undefined || typeof (id) != "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.sample`;
            const response = await pool.query(query);
            let regex = /\{/ig;// regex so replace runs multiple times, allowing output across lines
            writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRows fetched: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.sample where role_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow fetched:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
        return false;
    }
}

const getDistinctSpecies = async () => {
    try {
        const query = `select distinct tax_species from microbrsoil_db.sample`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nSpecies count: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err);
        return false;
    }
}

const getDistinctGenus = async () => {
    try {
        const query = `select distinct tax_genus from microbrsoil_db.sample`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nGenus count: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err);

        return false;
    }
}

const getSampleByExactSequence = async (sequenceString) => {
    const values = [sequenceString];
    try {
        const query = `select * from microbrsoil_db.sample where plant_sequence = $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
        return false;
    }
}

const getSampleBySimilarity = async (sequenceString) => {
    const values = ['%'+sequenceString+'%'];
    try{
        const query = `select * FROM microbrsoil_db.sample WHERE plant_sequence ILIKE $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0){
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rowCount));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);

        return false;
    }
}

const getSamplesByGenus = async (genus) => {
    const values = [genus];
    try {
        const query = `select * from microbrsoil_db.sample where tax_genus = $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
        return false;
    }
}


const getSamplesBySpecies = async (species) => {
    const values = [species];
    try {
        const query = `select * from microbrsoil_db.sample where tax_species = $1`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
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
