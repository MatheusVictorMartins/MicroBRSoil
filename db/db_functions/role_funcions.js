const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel unica

/*
fluxo das functions:
    recebe input
    valida input
    gera query
    manda query para bd
    recebe resposta
    valida resposta
    retorna resposta
    escreve no log
    em caso de erro
        escreve mensagem de erro no log e encerra a funtion
 */

//cria role retorna a linha
const createRole = async ({ name, description }) => {
    const values = [name, description];
    try {
        if (name == null || typeof (name) != "string" || name === "" || description == null || typeof (description) != "string" || description === "") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nname: ${name} typeOf: ${typeof (name)}`;
        } else {
            const query = `insert into microbrsoil_db.roles (role_name, description) values ($1,$2) returning *`
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: " + values + "\nLinha criada:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}

//deleta a role por id e retorna a linha deletada
const deleteRole = async (id) => {
    const values = [id];
    try {
        if (id === null || id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof (id)}`;
        } else {
            const query = `delete from microbrsoil_db.roles where role_id = $1 returning *`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: " + values + "\nLinha removida:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}


//altera nome/descrição da role por id
//retorna a linha alterada
const updateRole = async ({ name, description, id }) => {
    //query gerada dinâmicamente com base nas entradas
    //quanto mais entradas mais valores são colocados nos arrays columns e values
    const columns = [];//coluna a ser modifica
    const values = [];//novo valor
    let index = 1;//indice atual do array para a query
    try {
        if (id == undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof (id)}`;
        }
        if (name != null && name != undefined && name != "" && typeof (name) == "string") {//valores vão para os arrays se são validos
            columns.push(`role_name = $${index}`);
            values.push(name);
            index++;
        }
        if (description != null && description != undefined && description != "" && typeof (description) == "string") {
            columns.push(`description = $${index}`);
            values.push(description);
            index++;
        }
        if (columns.length === 0) {//caso não tenhão valores validos nas colunas
            throw `Formatação da entrada incorreta\nid: ${id} typeOf: ${typeof (id)}\nname: ${name} typeOf: ${typeof (name)}\ndescription: ${description} typeOf: ${typeof (description)}`;
        }
        values.push(id);
        const query = `update microbrsoil_db.roles set ${columns.join(', ')} where role_id = $${index} returning *`//query dinamica
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]"+ "\nEntrada: " + values + "\nLinha alterada:\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}

//retorna linhas por id ou todos as linhas
const getRole = async (id = 0) => {
    const values = [id];
    try {
        if (id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.roles`;
            const response = await pool.query(query);
            let regex = /\{/ig;//regex para o replace ser ativado multiplas vezes, permite que o retorno seja apresentado em linhas diferentes
            writeLog("\n[SUCESSO]"+ "\nEntrada: " + values + "\nLinhas obtidas: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.roles where role_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: " + values + "\nLinha obtida:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nmensagem de erro: " + err + "\nvalues: " + values);
        return false;
    }
}

module.exports = {
    createRole,
    deleteRole,
    updateRole,
    getRole,
}
