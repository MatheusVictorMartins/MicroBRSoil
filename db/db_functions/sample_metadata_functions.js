const pool = require('../db');
const writeLog = require('../log_files/log_handler');

/**
 * Create a sample metadata record
 * @param {Object} params - Metadata parameters
 * @param {number} params.soilId - Soil ID
 * @param {string} params.runId - Pipeline run ID
 * @param {string} params.sampleId - Sample identifier
 * @param {string} params.treatment - Treatment group (optional)
 * @param {string} params.site - Site name (optional)
 * @param {string} params.condition - Condition (optional)
 * @param {string} params.replicate - Replicate identifier (optional)
 * @param {string} params.group - Group name (optional)
 * @param {number} params.ph - pH value (optional)
 * @param {number} params.temperature - Temperature (optional)
 * @param {number} params.soilDepth - Soil depth (optional)
 * @param {number} params.moisture - Moisture content (optional)
 * @param {Object} params.customFields - Additional fields as JSON (optional)
 * @returns {Promise<Object>} Database response
 */
const createSampleMetadata = async ({
    soilId,
    runId,
    sampleId,
    treatment = null,
    site = null,
    condition = null,
    replicate = null,
    group = null,
    ph = null,
    temperature = null,
    soilDepth = null,
    moisture = null,
    customFields = {}
}) => {
    const values = [
        soilId,
        runId,
        sampleId,
        treatment,
        site,
        condition,
        replicate,
        group,
        ph,
        temperature,
        soilDepth,
        moisture,
        JSON.stringify(customFields)
    ];

    try {
        const query = `
            INSERT INTO microbrsoil_db.sample_metadata (
                soil_id,
                run_id,
                sample_id,
                treatment,
                site,
                condition,
                replicate,
                group_name,
                ph,
                temperature,
                soil_depth,
                moisture,
                custom_fields
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
            RETURNING metadata_id, sample_id
        `;

        const response = await pool.query(query, values);

        if (response.rowCount === 0) {
            throw new Error(`Failed to insert sample metadata for ${sampleId}`);
        }

        writeLog(`\n[SUCCESS] Sample metadata created for: ${sampleId}`);
        return response;

    } catch (err) {
        writeLog(`\n[ERROR] Failed to create sample metadata for ${sampleId}: ${err.message}`);
        throw err;
    }
};

/**
 * Get sample metadata by soil_id
 * @param {number} soilId - Soil ID
 * @returns {Promise<Object>} Database response
 */
const getSampleMetadataBySoilId = async (soilId) => {
    try {
        const query = `
            SELECT * FROM microbrsoil_db.sample_metadata
            WHERE soil_id = $1
            ORDER BY sample_id
        `;

        const response = await pool.query(query, [soilId]);
        writeLog(`\n[SUCCESS] Retrieved ${response.rowCount} sample metadata records for soil_id: ${soilId}`);
        return response;

    } catch (err) {
        writeLog(`\n[ERROR] Failed to retrieve sample metadata for soil_id ${soilId}: ${err.message}`);
        throw err;
    }
};

/**
 * Get sample metadata by run_id
 * @param {string} runId - Pipeline run ID
 * @returns {Promise<Object>} Database response
 */
const getSampleMetadataByRunId = async (runId) => {
    try {
        const query = `
            SELECT * FROM microbrsoil_db.sample_metadata
            WHERE run_id = $1
            ORDER BY sample_id
        `;

        const response = await pool.query(query, [runId]);
        writeLog(`\n[SUCCESS] Retrieved ${response.rowCount} sample metadata records for run_id: ${runId}`);
        return response;

    } catch (err) {
        writeLog(`\n[ERROR] Failed to retrieve sample metadata for run_id ${runId}: ${err.message}`);
        throw err;
    }
};

/**
 * Get sample metadata by treatment
 * @param {string} treatment - Treatment name
 * @returns {Promise<Object>} Database response
 */
const getSampleMetadataByTreatment = async (treatment) => {
    try {
        const query = `
            SELECT * FROM microbrsoil_db.sample_metadata
            WHERE treatment = $1
            ORDER BY sample_id
        `;

        const response = await pool.query(query, [treatment]);
        writeLog(`\n[SUCCESS] Retrieved ${response.rowCount} sample metadata records for treatment: ${treatment}`);
        return response;

    } catch (err) {
        writeLog(`\n[ERROR] Failed to retrieve sample metadata for treatment ${treatment}: ${err.message}`);
        throw err;
    }
};

/**
 * Get sample metadata by site
 * @param {string} site - Site name
 * @returns {Promise<Object>} Database response
 */
const getSampleMetadataBySite = async (site) => {
    try {
        const query = `
            SELECT * FROM microbrsoil_db.sample_metadata
            WHERE site = $1
            ORDER BY sample_id
        `;

        const response = await pool.query(query, [site]);
        writeLog(`\n[SUCCESS] Retrieved ${response.rowCount} sample metadata records for site: ${site}`);
        return response;

    } catch (err) {
        writeLog(`\n[ERROR] Failed to retrieve sample metadata for site ${site}: ${err.message}`);
        throw err;
    }
};

/**
 * Delete sample metadata by soil_id
 * @param {number} soilId - Soil ID
 * @returns {Promise<Object>} Database response
 */
const deleteSampleMetadataBySoilId = async (soilId) => {
    try {
        const query = `
            DELETE FROM microbrsoil_db.sample_metadata
            WHERE soil_id = $1
            RETURNING *
        `;

        const response = await pool.query(query, [soilId]);
        writeLog(`\n[SUCCESS] Deleted ${response.rowCount} sample metadata records for soil_id: ${soilId}`);
        return response;

    } catch (err) {
        writeLog(`\n[ERROR] Failed to delete sample metadata for soil_id ${soilId}: ${err.message}`);
        throw err;
    }
};

/**
 * Query sample metadata with custom filters
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Database response
 */
const querySampleMetadata = async (filters = {}) => {
    try {
        let query = 'SELECT * FROM microbrsoil_db.sample_metadata WHERE 1=1';
        const values = [];
        let paramCount = 1;

        // Build dynamic WHERE clause
        if (filters.soilId) {
            query += ` AND soil_id = $${paramCount}`;
            values.push(filters.soilId);
            paramCount++;
        }

        if (filters.runId) {
            query += ` AND run_id = $${paramCount}`;
            values.push(filters.runId);
            paramCount++;
        }

        if (filters.treatment) {
            query += ` AND treatment = $${paramCount}`;
            values.push(filters.treatment);
            paramCount++;
        }

        if (filters.site) {
            query += ` AND site = $${paramCount}`;
            values.push(filters.site);
            paramCount++;
        }

        if (filters.condition) {
            query += ` AND condition = $${paramCount}`;
            values.push(filters.condition);
            paramCount++;
        }

        if (filters.minPh !== undefined) {
            query += ` AND ph >= $${paramCount}`;
            values.push(filters.minPh);
            paramCount++;
        }

        if (filters.maxPh !== undefined) {
            query += ` AND ph <= $${paramCount}`;
            values.push(filters.maxPh);
            paramCount++;
        }

        query += ' ORDER BY sample_id';

        const response = await pool.query(query, values);
        writeLog(`\n[SUCCESS] Query returned ${response.rowCount} sample metadata records`);
        return response;

    } catch (err) {
        writeLog(`\n[ERROR] Failed to query sample metadata: ${err.message}`);
        throw err;
    }
};

module.exports = {
    createSampleMetadata,
    getSampleMetadataBySoilId,
    getSampleMetadataByRunId,
    getSampleMetadataByTreatment,
    getSampleMetadataBySite,
    deleteSampleMetadataBySoilId,
    querySampleMetadata
};
