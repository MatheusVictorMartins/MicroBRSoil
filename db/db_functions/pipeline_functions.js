const pool = require('../db');
const writeLog = require('../log_files/log_handler');

// Create a new pipeline run
const createPipelineRun = async ({ runId, userId = null, pipelineType, inputFilePath, jobId = null }) => {
    const values = [runId, jobId, userId, 'queued', pipelineType, inputFilePath];
    try {
        const query = `
            INSERT INTO microbrsoil_db.pipeline_runs 
            (run_id, job_id, user_id, status, pipeline_type, input_file_path)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`;
        const response = await pool.query(query, values);
        writeLog("\n[SUCESSO] Pipeline run criado: " + JSON.stringify(response.rows[0]));
        return response.rows[0];
    } catch (err) {
        writeLog("\n[ERRO] Criar pipeline run: " + err + "\nvalues: " + values);
        throw err;
    }
};

// Update pipeline run status
const updatePipelineRunStatus = async (runId, status, errorMessage = null, logs = null) => {
    try {
        let query = `UPDATE microbrsoil_db.pipeline_runs SET status = $2`;
        let values = [runId, status];
        let valueIndex = 3;

        if (status === 'running' && !errorMessage) {
            query += `, started_at = CURRENT_TIMESTAMP`;
        } else if (status === 'completed' || status === 'failed') {
            query += `, finished_at = CURRENT_TIMESTAMP`;
        }

        if (errorMessage) {
            query += `, error_message = $${valueIndex}`;
            values.push(errorMessage);
            valueIndex++;
        }

        if (logs && logs.length > 0) {
            query += `, logs = $${valueIndex}`;
            values.push(logs);
            valueIndex++;
        }

        query += ` WHERE run_id = $1 RETURNING *`;

        const response = await pool.query(query, values);
        writeLog("\n[SUCESSO] Pipeline run atualizado: " + JSON.stringify(response.rows[0]));
        return response.rows[0];
    } catch (err) {
        writeLog("\n[ERRO] Atualizar pipeline run: " + err);
        throw err;
    }
};

// Get pipeline run by ID
const getPipelineRun = async (runId) => {
    try {
        const query = `SELECT * FROM microbrsoil_db.pipeline_runs WHERE run_id = $1`;
        const response = await pool.query(query, [runId]);
        return response.rows[0] || null;
    } catch (err) {
        writeLog("\n[ERRO] Buscar pipeline run: " + err);
        throw err;
    }
};

// Get pipeline runs by user
const getPipelineRunsByUser = async (userId) => {
    try {
        const query = `
            SELECT * FROM microbrsoil_db.pipeline_runs 
            WHERE user_id = $1 
            ORDER BY created_at DESC`;
        const response = await pool.query(query, [userId]);
        return response.rows;
    } catch (err) {
        writeLog("\n[ERRO] Buscar pipeline runs por usuário: " + err);
        throw err;
    }
};

// Create pipeline result record
const createPipelineResult = async ({ runId, soilId = null, alphaDiversityFile, otuTableFile, taxonomyFile, metadataFile }) => {
    const values = [runId, soilId, alphaDiversityFile, otuTableFile, taxonomyFile, metadataFile];
    try {
        const query = `
            INSERT INTO microbrsoil_db.pipeline_results 
            (run_id, soil_id, alpha_diversity_file, otu_table_file, taxonomy_file, metadata_file)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`;
        const response = await pool.query(query, values);
        writeLog("\n[SUCESSO] Pipeline result criado: " + JSON.stringify(response.rows[0]));
        return response.rows[0];
    } catch (err) {
        writeLog("\n[ERRO] Criar pipeline result: " + err + "\nvalues: " + values);
        throw err;
    }
};

// Get pipeline results by run ID
const getPipelineResults = async (runId) => {
    try {
        const query = `SELECT * FROM microbrsoil_db.pipeline_results WHERE run_id = $1`;
        const response = await pool.query(query, [runId]);
        return response.rows[0] || null;
    } catch (err) {
        writeLog("\n[ERRO] Buscar pipeline results: " + err);
        throw err;
    }
};

module.exports = {
    createPipelineRun,
    updatePipelineRunStatus,
    getPipelineRun,
    getPipelineRunsByUser,
    createPipelineResult,
    getPipelineResults
};
