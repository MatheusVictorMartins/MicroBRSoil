const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//! pass multiple parameters as objects
//! single parameters can be passed as a single variable

const createInputPath = async ({ inputPath, soilId }) => {
    const values = [inputPath, soilId];
    try {
        if (inputPath == undefined || typeof (inputPath) != "string" || inputPath === "" || soilId == undefined || typeof (soilId) != "number") {
            throw `Invalid input\nsoilId: ${soilId} typeOf: ${typeof (soilId)} inputPath: ${inputPath} typeof: ${typeof (inputPath)}`;
        } else {
            const query = `insert into microbrsoil_db.file_paths (input_path, soil_id) values ($1, $2) returning *`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]"+ "\nInput: "+ values + "\nRow created:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

const getPathsById = async ({ id }) => {
    const values = [id];
    try {
        if (id == undefined || typeof (id) != "number") {
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}}`;
        } else {
            const query = `select * from microbrsoil_db.file_paths where path_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]"+ "\nInput: "+ values + "\nRow: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

const getPathsBySoil = async (soilId) => {
    const values = [soilId];
    try {
        if (soilId == undefined || typeof (soilId) != "number") {
            throw `Invalid input\nsoilId: ${soilId} typeOf: ${typeof (soilId)}`;
        } else {
            const query = `select * from microbrsoil_db.file_paths where path_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]"+ "\nInput: "+ values + "\nRow: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

const updatePaths = async ({ inputPath, outputPath, id }) => {
    // query generated dynamically based on inputs
    // the more inputs, the more values are added to the columns and values arrays
    const columns = [];// column to update
    const values = [];// new value
    let index = 1;// current array index for the query
    try {
        if (id == undefined || typeof id !== "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}`;
        }
        if (inputPath != undefined && inputPath !== "" && typeof inputPath === "string") {// values go to arrays if valid
            columns.push(`input_path = $${index}`);
            values.push(inputPath);
            index++;
        }
        if (outputPath != undefined && outputPath !== "" && typeof outputPath === "string") {
            columns.push(`output_path = $${index}`);
            values.push(outputPath);
            index++;
        }
        if (columns.length === 0) {// when no valid values exist in columns
            throw `Invalid input\nid: ${id} typeOf: ${typeof id}\ninputPath: ${inputPath}\noutputPath: ${outputPath}`;
        }
        values.push(id);
        const query = `UPDATE microbrsoil_db.file_paths SET ${columns.join(', ')} WHERE path_id = $${index} RETURNING *`;// dynamic query
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]"+ "\nInput: "+ values + "\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}


module.exports = {
    createInputPath,
    getPathsById,
    getPathsBySoil,
    updatePaths
}
