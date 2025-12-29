const pool = require('../db');
const writeLog = require('../log_files/log_handler');

let searchIndexesReady = false;
let pgTrgmAvailable = false;

const BASE_SEARCH_SELECT = `
    SELECT
        row_to_json(s) AS sample,
        row_to_json(so) AS soil,
        row_to_json(pr) AS pipeline,
        row_to_json(prs) AS pipeline_result,
        json_build_object(
            'user_id', u.user_id,
            'user_email', u.user_email,
            'role_id', u.role_id
        ) AS user
    FROM microbrsoil_db.sample s
    JOIN microbrsoil_db.soil so ON s.soil_id = so.soil_id
    LEFT JOIN microbrsoil_db.pipeline_results prs ON prs.soil_id = so.soil_id
    LEFT JOIN microbrsoil_db.pipeline_runs pr ON pr.run_id = prs.run_id
    LEFT JOIN microbrsoil_db.users u ON u.user_id = pr.user_id
`;

const ensureSearchIndexes = async () => {
    if (searchIndexesReady) return;
    searchIndexesReady = true;

    try {
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sample_tax_genus ON microbrsoil_db.sample (tax_genus)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sample_tax_species ON microbrsoil_db.sample (tax_species)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sample_sequence ON microbrsoil_db.sample (plant_sequence)');
    } catch (err) {
        writeLog(`\n[WARNING] Could not create basic search indexes: ${err.message}`);
    }

    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sample_sequence_trgm ON microbrsoil_db.sample USING GIN (plant_sequence gin_trgm_ops)');
        pgTrgmAvailable = true;
    } catch (err) {
        pgTrgmAvailable = false;
        writeLog(`\n[WARNING] pg_trgm extension not available: ${err.message}`);
    }
};

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
            const query = `select * from microbrsoil_db.sample where sample_id = $1`;
            const response = await pool.query(query, values);
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
        await ensureSearchIndexes();
        const query = `
            select distinct tax_species
            from microbrsoil_db.sample
            where tax_species is not null
              and trim(tax_species) <> ''
              and lower(tax_species) <> 'na'
            order by tax_species`;
        const response = await pool.query(query);
        writeLog("\n[SUCCESS]" + "\nSpecies count: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err);
        return false;
    }
}

const getDistinctGenus = async () => {
    try {
        await ensureSearchIndexes();
        const query = `
            select distinct tax_genus
            from microbrsoil_db.sample
            where tax_genus is not null
              and trim(tax_genus) <> ''
              and lower(tax_genus) <> 'na'
            order by tax_genus`;
        const response = await pool.query(query);
        writeLog("\n[SUCCESS]" + "\nGenus count: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err);

        return false;
    }
}

const getSampleByExactSequence = async (sequenceString) => {
    try {
        await ensureSearchIndexes();
        const values = [sequenceString];
        const query = `${BASE_SEARCH_SELECT} WHERE s.plant_sequence = $1`;
        const response = await pool.query(query, values);
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + sequenceString);
        return false;
    }
}

const getSampleBySimilarity = async (sequenceString, options = {}) => {
    try {
        await ensureSearchIndexes();
        const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
        const minSimilarity = Number.isFinite(Number(options.minSimilarity)) ? Number(options.minSimilarity) : 0.3;
        let response;

        if (pgTrgmAvailable) {
            const query = `
                ${BASE_SEARCH_SELECT}
                WHERE s.plant_sequence % $1
                  AND similarity(s.plant_sequence, $1) >= $2
                ORDER BY similarity(s.plant_sequence, $1) DESC
                LIMIT $3`;
            response = await pool.query(query, [sequenceString, minSimilarity, limit]);
        } else {
            const query = `
                ${BASE_SEARCH_SELECT}
                WHERE s.plant_sequence ILIKE $1
                ORDER BY ABS(LENGTH(s.plant_sequence) - LENGTH($2)) ASC
                LIMIT $3`;
            response = await pool.query(query, [`%${sequenceString}%`, sequenceString, limit]);
        }

        writeLog("\n[SUCCESS]" + "\nInput: " + sequenceString + "\nRow count: " + response.rowCount);
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + sequenceString);
        return false;
    }
}

const getSamplesByGenus = async (genus) => {
    try {
        await ensureSearchIndexes();
        const values = [genus];
        const query = `${BASE_SEARCH_SELECT} WHERE LOWER(s.tax_genus) = LOWER($1)`;
        const response = await pool.query(query, values);
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + genus);
        return false;
    }
}


const getSamplesBySpecies = async (species) => {
    try {
        await ensureSearchIndexes();
        const values = [species];
        const query = `${BASE_SEARCH_SELECT} WHERE LOWER(s.tax_species) = LOWER($1)`;
        const response = await pool.query(query, values);
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + species);
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
