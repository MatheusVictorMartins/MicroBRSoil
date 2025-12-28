const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//! pass multiple parameters as objects
//! single parameters can be passed as a single variable

const createAlpha = async ({ id, alphaArray }) => {
    const values = [id, alphaArray[0], alphaArray[1], alphaArray[2], alphaArray[3], alphaArray[4]];
    try {
        const query = `
            INSERT INTO microbrsoil_db.alpha_tests 
            (soil_id, alpha_observed, alpha_shannon, alpha_simpson, alpha_chao1, alpha_goods) 
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow created: \n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

const getAlpha = async (id = 0) => {
    const values = [id];
    try {
        if (id === undefined || typeof (id) != "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.alpha_tests`;
            const response = await pool.query(query);
            let regex = /\{/ig;// regex so replace runs multiple times, allowing output across lines
            writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRows fetched: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.alpha_tests where role_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow fetched:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

module.exports = {
    createAlpha,
    getAlpha
}
