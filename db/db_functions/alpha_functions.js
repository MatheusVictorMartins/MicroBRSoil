const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel unica

const createAlpha = async ({ id, alphaArray }) => {
    try {
        const query = `
            INSERT INTO microbrsoil_db.alpha_tests 
            (soil_id, alpha_observed, alpha_shannon, alpha_simpson, alpha_chao1, alpha_goods) 
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`;
        const values = [id, alphaArray[0], alphaArray[1], alphaArray[2], alphaArray[3], alphaArray[4]];
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\nSucesso em createAlpha\nLinha criada: \n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\nErro em createAlpha: \n" + err);
        return false;
    }
}

const getAlpha = async (id = 0) => {
    try {
        if (id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta em getAlpha\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.alpha_tests`;
            const response = await pool.query(query);
            let regex = /\{/ig;//regex para o replace ser ativado multiplas vezes, permite que o retorno seja apresentado em linhas diferentes
            writeLog("\nSucesso em getAlpha\nLinhas obtidas: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.alpha_tests where role_id = $1`;
            const values = [id];
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\nSucesso em getAlpha\nLinha obtida:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\nErro em getAlpha\n" + err);
        return false;
    }
}

module.exports = {
    createAlpha,
    getAlpha
}