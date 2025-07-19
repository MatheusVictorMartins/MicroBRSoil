const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//!passe multiplos parâmetros como obejtos
//!parametros unicos podem ser passados como variavel unica

const createSoil = async ({ metadataArray, id }) => {
    let values = [];
    metadataArray.forEach(element => {
        values.push(element);        
    });
    values.push(id);
    try {
        const query = `insert into microbrsoil_db.soil (
        sample_name,
        collection_date,
        soil_depth,
        elev,
        env_broad_scale,
        env_local_scale,
        env_medium,
        geo_loc_name,
        lat_lon,
        Enz_Aril,
        Enz_Beta,
        Enz_Fosf,
        agrochem_addition,
        al_sat,
        altitude,
        annual_precpt,
        annual_temp,
        crop_rotation,
        cur_land_use,
        cur_vegetation,
        extreme_event,
        fao_class,
        fire,
        flooding,
        heavy_metals,
        local_class,
        microbial_biomass,
        ph,
        previous_land_use,
        soil_horizon,
        soil_text,
        soil_type,
        tillage,
        tot_nitro,
        tot_org_carb,
        metadata_description,
        owner_id
        ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
        $30,$31,$32,$33,$34,$35,$36,$37) returning soil_id`;
        values[8] = `(${values[8][0]},${values[8][1]})`;
        const response = await pool.query(query, values);
        if (response.rowCount === 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

const deleteSoil = async (idSoil) => {
    const values = [idSoil];
    try {
        const query = `delete from microbrsoil_db.soil where soil_id = $1 returning *`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Resposta ruim, provavelmente não encontrou o que você estava procurando.\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

const getSoil = async (idSoil = 0) => {
    const values = [idSoil];
    try {
        if (idSoil === undefined || typeof (idSoil) != "number") {
            throw `Entrada incorreta.\nErro em:\nID: ${id} ou Tipo de dado: ${typeof (id)}`;
        } else if (idSoil === 0) {
            const query = `select * from microbrsoil_db.soil`;
            const response = await pool.query(query);
            let regex = /\{/ig;//regex para o replace ser ativado multiplas vezes, permite que o retorno seja apresentado em linhas diferentes
            writeLog("[SUCESSO]" + "\nEntrada: " + values + "Linhas:\n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.soil where soil_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Resposta ruim, provavelmente não encontrou o que você estava procurando\nResposta:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCESSO]" + "\nEntrada: " + values + "\nLinha: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERRO]\nMensagem de erro: " + err + "\nEntradas: " + values);
        return false;
    }
}

module.exports = {
    createSoil,
    deleteSoil,
    getSoil,
}
