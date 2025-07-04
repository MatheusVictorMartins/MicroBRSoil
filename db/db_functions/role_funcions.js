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
    try {
        if (name == null || typeof (name) != "string" || name === "" || description == null || typeof (description) != "string" || description === "") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta em createRole\nname: ${name} typeOf: ${typeof (name)}`;
        } else {
            const query = `insert into microbrsoil_db.roles (role_name, description) values ($1,$2) returning *`
            const values = [name, description];
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\nSucesso em createRole\nLinha criada:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\nErro em createRole\n" + err);
        return false;
    }
}

//deleta a role por id e retorna a linha deletada
const deleteRole = async (id) => {
    try {
        if (id === null || id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta em deleteRole\nid: ${id} typeOf: ${typeof (id)}`;
        } else {
            const query = `delete from microbrsoil_db.roles where role_id = $1 returning *`;
            const values = [id];
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\nSucesso em deleteRole\nLinha removida:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\nErro em deleteRole\n" + err);
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
            throw `Entrada incorreta em updateRole\nid: ${id} typeOf: ${typeof (id)}`;
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
        writeLog("\nSucesso em updateRole\nLinha alterada:\n" + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\nErro em updateRole\n" + err);
        return false;
    }
}

//retorna linhas por id ou todos as linhas
const getRole = async (id = 0) => {
    try {
        if (id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta em getRole\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.roles`;
            const response = await pool.query(query);
            let regex = /\{/ig;//regex para o replace ser ativado multiplas vezes, permite que o retorno seja apresentado em linhas diferentes
            writeLog("\nSucesso em getRole\nLinhas obtidas: \n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.roles where role_id = $1`;
            const values = [id];
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\nSucesso em getRole\nLinha obtida:\n" + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\nErro em getRole\n" + err);
        return false;
    }
}

module.exports = {
    createRole,
    deleteRole,
    updateRole,
    getRole,
}
