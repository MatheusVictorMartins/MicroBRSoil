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
            SELECT 
                pr.*,
                u.user_email as user_email
            FROM microbrsoil_db.pipeline_runs pr
            LEFT JOIN microbrsoil_db.users u ON pr.user_id = u.user_id
            WHERE pr.user_id = $1 
            ORDER BY pr.created_at DESC`;
        const response = await pool.query(query, [userId]);
        return response.rows;
    } catch (err) {
        writeLog("\n[ERRO] Buscar pipeline runs por usuário: " + err);
        throw err;
    }
};

// Get all pipeline runs (admin only)
const getPipelineRunsAll = async (limit = null) => {
    try {
        const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : null;
        let query = `
            SELECT 
                pr.*,
                u.user_email as user_email
            FROM microbrsoil_db.pipeline_runs pr
            LEFT JOIN microbrsoil_db.users u ON pr.user_id = u.user_id
            ORDER BY pr.created_at DESC`;
        const values = [];
        if (safeLimit) {
            query += ` LIMIT $1`;
            values.push(safeLimit);
        }
        const response = await pool.query(query, values);
        return response.rows;
    } catch (err) {
        writeLog("\n[ERRO] Buscar pipeline runs (admin): " + err);
        throw err;
    }
};

// Create or update pipeline result record (idempotent)
const createPipelineResult = async ({ runId, soilId = null, alphaDiversityFile, otuTableFile, taxonomyFile, metadataFile }) => {
    const values = [runId, soilId, alphaDiversityFile, otuTableFile, taxonomyFile, metadataFile];
    const upsertQuery = `
        INSERT INTO microbrsoil_db.pipeline_results 
        (run_id, soil_id, alpha_diversity_file, otu_table_file, taxonomy_file, metadata_file, processed_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (run_id) 
        DO UPDATE SET
            soil_id = EXCLUDED.soil_id,
            alpha_diversity_file = EXCLUDED.alpha_diversity_file,
            otu_table_file = EXCLUDED.otu_table_file,
            taxonomy_file = EXCLUDED.taxonomy_file,
            metadata_file = EXCLUDED.metadata_file,
            processed_at = CURRENT_TIMESTAMP
        RETURNING *`;

    try {
        // Primary path: rely on DB constraint for atomic upsert
        const response = await pool.query(upsertQuery, values);
        writeLog("\n[SUCESSO] Pipeline result upserted: " + JSON.stringify(response.rows[0]));
        return response.rows[0];
    } catch (err) {
        // Postgres 42P10 = missing unique/exclusion constraint for ON CONFLICT target
        if (err.code === '42P10') {
            writeLog("\n[WARNING] Missing unique constraint on pipeline_results.run_id, falling back to manual upsert. Error: " + err.message);
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const updateRes = await client.query(`
                    UPDATE microbrsoil_db.pipeline_results
                    SET soil_id = $2,
                        alpha_diversity_file = $3,
                        otu_table_file = $4,
                        taxonomy_file = $5,
                        metadata_file = $6,
                        processed_at = CURRENT_TIMESTAMP
                    WHERE run_id = $1
                    RETURNING *`, values);

                if (updateRes.rows.length > 0) {
                    await client.query('COMMIT');
                    writeLog("\n[SUCESSO] Pipeline result updated (manual fallback): " + JSON.stringify(updateRes.rows[0]));
                    return updateRes.rows[0];
                }

                const insertRes = await client.query(`
                    INSERT INTO microbrsoil_db.pipeline_results 
                    (run_id, soil_id, alpha_diversity_file, otu_table_file, taxonomy_file, metadata_file, processed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                    RETURNING *`, values);
                await client.query('COMMIT');
                writeLog("\n[SUCESSO] Pipeline result inserted (manual fallback): " + JSON.stringify(insertRes.rows[0]));
                return insertRes.rows[0];
            } catch (fallbackErr) {
                await client.query('ROLLBACK');
                writeLog("\n[ERRO] Fallback upsert pipeline result: " + fallbackErr + "\nvalues: " + values);
                throw fallbackErr;
            } finally {
                client.release();
            }
        }

        writeLog("\n[ERRO] Upsert pipeline result: " + err + "\nvalues: " + values);
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
    getPipelineRunsAll,
    createPipelineResult,
    getPipelineResults
};
