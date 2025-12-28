const pool = require('../db');
const writeLog = require('../log_files/log_handler');

//! pass multiple parameters as objects
//! single parameters can be passed as a single variable

/**
 * Create a soil record in the database
 * @param {Object} soilData - Soil data object (can be metadataArray or full object)
 * @returns {Promise} Query result
 */
const createSoil = async (soilData) => {
    let values = [];
    
    // Support both old format (metadataArray + id) and new format (full object)
    if (soilData.metadataArray && Array.isArray(soilData.metadataArray)) {
        // Legacy format: { metadataArray: [...], id: userId }
        values = [...soilData.metadataArray, soilData.id];
    } else {
        // New format: direct soil data object
        values = [
            soilData.sample_name,
            soilData.collection_date,
            soilData.soil_depth,
            soilData.elev,
            soilData.env_broad_scale,
            soilData.env_local_scale,
            soilData.env_medium,
            soilData.geo_loc_name,
            soilData.lat_lon,
            soilData.Enz_Aril,
            soilData.Enz_Beta,
            soilData.Enz_Fosf,
            soilData.agrochem_addition || null,
            soilData.al_sat || null,
            soilData.altitude || null,
            soilData.annual_precpt || null,
            soilData.annual_temp || null,
            soilData.crop_rotation || null,
            soilData.cur_land_use || null,
            soilData.cur_vegetation || null,
            soilData.extreme_event || null,
            soilData.fao_class || null,
            soilData.fire || null,
            soilData.flooding || null,
            soilData.heavy_metals || null,
            soilData.local_class || null,
            soilData.microbial_biomass || null,
            soilData.ph || null,
            soilData.previous_land_use || null,
            soilData.soil_horizon || null,
            soilData.soil_text || null,
            soilData.soil_type || null,
            soilData.tillage || null,
            soilData.tot_nitro || null,
            soilData.tot_org_carb || null,
            soilData.metadata_description || null,
            soilData.owner_id
        ];
    }
    
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
        
        // Handle lat_lon formatting
        if (typeof values[8] === 'object' && values[8] !== null) {
            values[8] = `(${values[8].x},${values[8].y})`;
        } else if (Array.isArray(values[8])) {
            values[8] = `(${values[8][0]},${values[8][1]})`;
        }
        
        const response = await pool.query(query, values);
        if (response.rowCount === 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
        throw err; // Re-throw to allow proper error handling
    }
}

const deleteSoil = async (idSoil) => {
    const values = [idSoil];
    try {
        const query = `delete from microbrsoil_db.soil where soil_id = $1 returning *`;
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for.\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
        return false;
    }
}

const getSoil = async (idSoil = 0) => {
    const values = [idSoil];
    try {
        if (idSoil === undefined || typeof (idSoil) != "number") {
            throw `Invalid input.\nError in:\nID: ${id} or data type: ${typeof (id)}`;
        } else if (idSoil === 0) {
            const query = `select * from microbrsoil_db.soil`;
            const response = await pool.query(query);
            let regex = /\{/ig;// regex so replace runs multiple times, allowing output across lines
            writeLog("[SUCCESS]" + "\nInput: " + values + "Rows:\n" + JSON.stringify(response.rows).replace(regex, "\n"));
            return response;
        } else {
            const query = `select * from microbrsoil_db.soil where soil_id = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS]" + "\nInput: " + values + "\nRow: " + JSON.stringify(response.rows[0]));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nInputs: " + values);
        return false;
    }
}

module.exports = {
    createSoil,
    deleteSoil,
    getSoil,
}
