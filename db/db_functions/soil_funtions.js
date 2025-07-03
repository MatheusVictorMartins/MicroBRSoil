const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel unica

const createSoil = async ({metadataArray, id}) => {
    try {
        const query = `insert into microbrsoil_db.soil (x_coord, y_coord, soil_ph, owner_id) values ($1, $2, $3, $4)  returning soil_id`;
        const values = [metadataArray[0], metadataArray[1], metadataArray[2], id];
        const response = await pool.query(query, values);
        if (response.rowCount === 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\nSucesso em createSoil\nLinha criada:\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\nErro em createSoil\n" + err);
        return false;
    }
}

const deleteSoil = async (idSoil) => {
    try {
        const query= `delete from microbrsoil_db.soil where soil_id = $1 returning *`;
        const values = [idSoil];
        const response = await pool.query(query, values);
        if(response.rowCount == 0){
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando.\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\nSucesso em deletar dados do solo.\nDados deletados:\n"+JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\nErro em deletar dados do solo.\nErro:\n"+err);
        return false;
    }
}

const getSoil = async(idSoil = 0) => {
    try {
        if(idSoil === undefined || typeof(idSoil) != "number"){
            throw `Entrada de dados incorreta, impossível pesquisar por dados do solo.\nErro em:\nID: ${id} ou Tipo de dado: ${typeof (id)}`;
        }else if(idSoil === 0){
            const query = `select * from microbrsoil_db.soil`;
            const response = await pool.query(query);
            let regex = /\{/ig;//regex para o replace ser ativado multiplas vezes, permite que o retorno seja apresentado em linhas diferentes
            writeLog("\nDados do solo encontrados com sucesso.\nLinhas obtidas: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        }else{
            const query = `select * from microbrsoil_db.soil where soil_id = $1`;
            const values = [idSoil];
            const response = await pool.query(query);
            if(response.rowCount == 0){
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\nDados do solo encontrados com sucesso.\nDados obtidos:\n"+JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\nErro ao pesquisar dados do solo.\nErro:\n"+err);
        return false;
    }
}

module.exports= {
    createSoil,
    deleteSoil,
    getSoil,
}
