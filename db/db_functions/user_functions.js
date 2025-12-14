const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel

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

//cria user e retorna a linha criada
const createUser = async ({ email, password, role = 1 }) => {
    const values = [email, password, role];
    try {
        if (email == null || email === "" || typeof (email) != "string" || password == null || password === "" || typeof (password) != "string" || role == null || typeof (role) != "number" || role === "") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\n:email:${email} typeof: ${typeof (email)}\nnpassword:${password} typeof: ${typeof (password)}\nrole: ${role} typeof: ${typeof (role)}`;
        } else {
            const query = `insert into microbrsoil_db.users (user_email, password_hash, role_id) values ($1,$2,$3) returning *`;
            const response = await pool.query(query, values);
            if (response.rowCount === 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values+ "\nLinhas: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

//deleta user e retorna a linha deletada
const deleteUser = async (id) => {
    const values = [id];
    try {
        if (id == null || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nID: ${id} typeof: ${typeof (id)}`;
        } else {
            const query = `delete from microbrsoil_db.users where user_id = $1 returning *`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values+ "\nLinhas: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

//retorna user com base no id ou retorna todos
const getUser = async (id = 0) => {
    const values = [id];
    try {
        if (id === undefined || typeof (id) != "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Entrada incorreta\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.users`;
            const response = await pool.query(query);
            let regex = /\{/ig;
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values+ "\nLinhas: " + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.users where user_id = $1`;
            const response = await pool.query(query, values);
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values+ "\nLinhas: " + JSON.stringify(response.rows[0]));
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

//faz login do usuario comparando email e senha
//retorna linha do usuario 
const logUser = async (email) => {
    const values = [email];
    try {
        if (email == undefined || typeof (email) != "string") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Erro de entrada em logUser\nemail: ${email} typeof: ${typeof (email)}}`
        } else {
            const query = `select * from microbrsoil_db.users where user_email = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values+ "\nLinhas: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

//altera usuario com base no id
//retorna linha alterada
const updateUser = async ({ email, password, name, id }) => {
    //query gerada dinâmicamente com base nas entradas
    //quanto mais entradas mais valores são colocados nos arrays columns e values
    const columns = [];//coluna a ser modifica
    const values = [];//novo valor
    let index = 1;//indice atual do array para a query
    try {
        if (id == null || typeof id !== "number") {//validador de entrada, devem respeitar o tipo e não pode ser undefined
            throw `Formatação incorreta\nid: ${id} typeOf: ${typeof (id)}`;
        }
        if (email != null && email !== "" && typeof email === "string") {//valores vão para os arrays se são validos
            columns.push(`user_email = $${index}`);
            values.push(email);
            index++;
        }
        if (password != null && password !== "" && typeof password === "string") {
            columns.push(`user_password = $${index}`);
            values.push(password);
            index++;
        }
        if (name != null && name !== "" && typeof name === "string") {
            columns.push(`user_name = $${index}`);
            values.push(name);
            index++;
        }
        if (columns.length === 0) {//caso não tenhão valores validos nas colunas
            throw `Formatação incorreta\nid: ${id} typeOf: ${typeof id}\nemail: ${email}\npassword: ${password}\nname: ${name}`;
        }

        values.push(id);
        const query = `UPDATE microbrsoil_db.users SET ${columns.join(', ')} WHERE user_id = $${index} RETURNING *`;//query dinamica
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]"+ "\nEntrada: "+ values+ "\nLinhas: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}


const listUsers = async () => {
    try {
        const query = `select * from microbrsoil_db.users`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]"+  "\nLinhas: " + JSON.stringify(response.rowCount));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err);
        return false;
    }
}


module.exports = {
    createUser,
    deleteUser,
    getUser,
    logUser,
    updateUser,
    listUsers,
} 