const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//! pass multiple parameters as objects
//! single parameters can be passed as a single variable

/*
flow for the functions:
    receive input
    validate input
    build query
    send query to DB
    receive response
    validate response
    return response
    write to log
    on error
        write error message to log and exit the function
 */

// creates role and returns the row
const createRole = async ({ name, description }) => {
    const values = [name, description];
    try {
        if (name == null || typeof (name) != "string" || name === "" || description == null || typeof (description) != "string" || description === "") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nname: ${name} typeOf: ${typeof (name)}`;
        } else {
            const query = `insert into microbrsoil_db.roles (role_name, description) values ($1,$2) returning *`
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]"+ "\nInput: " + values + "\nRow created:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

// deletes a role by id and returns the deleted row
const deleteRole = async (id) => {
    const values = [id];
    try {
        if (id === null || id === undefined || typeof (id) != "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}`;
        } else {
            const query = `delete from microbrsoil_db.roles where role_id = $1 returning *`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]"+ "\nInput: " + values + "\nRow deleted:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}


// updates role name/description by id
// returns the updated row
const updateRole = async ({ name, description, id }) => {
    // query generated dynamically based on inputs
    // the more inputs, the more values are added to the columns and values arrays
    const columns = [];// column to update
    const values = [];// new value
    let index = 1;// current array index for the query
    try {
        if (id == undefined || typeof (id) != "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}`;
        }
        if (name != null && name != undefined && name != "" && typeof (name) == "string") {// values go to arrays if valid
            columns.push(`role_name = $${index}`);
            values.push(name);
            index++;
        }
        if (description != null && description != undefined && description != "" && typeof (description) == "string") {
            columns.push(`description = $${index}`);
            values.push(description);
            index++;
        }
        if (columns.length === 0) {// when no valid values exist in columns
            throw `Invalid input format\nid: ${id} typeOf: ${typeof (id)}\nname: ${name} typeOf: ${typeof (name)}\ndescription: ${description} typeOf: ${typeof (description)}`;
        }
        values.push(id);
        const query = `update microbrsoil_db.roles set ${columns.join(', ')} where role_id = $${index} returning *`// dynamic query
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]"+ "\nInput: " + values + "\nRow updated:\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

// returns rows by id or all rows
const getRole = async (id = 0) => {
    const values = [id];
    try {
        if (id === undefined || typeof (id) != "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.roles`;
            const response = await pool.query(query);
            let regex = /\{/ig;// regex so replace runs multiple times, allowing output across lines
            writeLog("\n[SUCCESS]"+ "\nInput: " + values + "\nRows fetched: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.roles where role_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]"+ "\nInput: " + values + "\nRow fetched:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err + "\nvalues: " + values);
        return false;
    }
}

module.exports = {
    createRole,
    deleteRole,
    updateRole,
    getRole,
}
