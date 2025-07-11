const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel unica

const createInputPath = async ({ inputPath, soilId }) => {
    const values = [inputPath, soilId];
    try {
        if (inputPath == undefined || typeof (inputPath) != "string" || inputPath === "" || soilId == undefined || typeof (soilId) != "number") {
            throw `Entrada incorreta\nsoilId: ${soilId} typeOf: ${typeof (soilId)} inputPath: ${inputPath} typeof: ${typeof (inputPath)}`;
        } else {
            const query = `insert into microbrsoil_db.file_paths (input_path, soil_id) values ($1, $2) returning *`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values + "\nLinha criada:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}

const getPathsById = async ({ id }) => {
    const values = [id];
    try {
        if (id == undefined || typeof (id) != "number") {
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof (id)}}`;
        } else {
            const query = `select * from microbrsoil_db.file_paths where path_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values + "\nLinha: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}

const getPathsBySoil = async (soilId) => {
    const values = [soilId];
    try {
        if (soilId == undefined || typeof (soilId) != "number") {
            throw `Entrada incorreta\nsoilId: ${soilId} typeOf: ${typeof (soilId)}`;
        } else {
            const query = `select * from microbrsoil_db.file_paths where path_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values + "\nLinha: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}

const updatePaths = async ({ inputPath, outputPath, id }) => {
    //query gerada dinâmicamente com base nas entradas
    //quanto mais entradas mais valores são colocados nos arrays columns e values
    const columns = [];//coluna a ser modifica
    const values = [];//novo valor
    let index = 1;//indice atual do array para a query
    try {
        if (id == undefined || typeof id !== "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof (id)}`;
        }
        if (inputPath != undefined && inputPath !== "" && typeof inputPath === "string") {//valores vão para os arrays se são validos
            columns.push(`input_path = $${index}`);
            values.push(inputPath);
            index++;
        }
        if (outputPath != undefined && outputPath !== "" && typeof outputPath === "string") {
            columns.push(`output_path = $${index}`);
            values.push(outputPath);
            index++;
        }
        if (columns.length === 0) {//caso não tenhão valores validos nas colunas
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof id}\ninputPath: ${inputPath}\noutputPath: ${outputPath}`;
        }
        values.push(id);
        const query = `UPDATE microbrsoil_db.file_paths SET ${columns.join(', ')} WHERE path_id = $${index} RETURNING *`;//query dinamica
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values + "\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}


module.exports = {
    createInputPath,
    getPathsById,
    getPathsBySoil,
    updatePaths
}