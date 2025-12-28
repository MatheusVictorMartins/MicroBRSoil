const pool = require('../db');
const writeLog = require('../log_files/log_handler');
const fs = require('fs');
const path = require('path');

// Resolve constants for both local dev and container layouts.
const constantsCandidates = [
    path.resolve(__dirname, '../../backend/src/constants'),
    path.resolve(__dirname, '../../src/constants')
];
const constantsPath = constantsCandidates.find((candidate) => {
    return fs.existsSync(`${candidate}.js`) || fs.existsSync(candidate);
});
if (!constantsPath) {
    throw new Error('constants.js module not found. Expected at backend/src/constants or src/constants.');
}
const { PIPELINE_STATUS } = require(constantsPath);

let pipelineMetricsColumnsCached = null;

const ensurePipelineMetricsColumns = async () => {
    if (pipelineMetricsColumnsCached === true) return true;
    try {
        await pool.query(
            'ALTER TABLE microbrsoil_db.pipeline_runs ADD COLUMN IF NOT EXISTS upload_size_bytes BIGINT'
        );
        await pool.query(
            'ALTER TABLE microbrsoil_db.pipeline_runs ADD COLUMN IF NOT EXISTS duration_ms BIGINT'
        );
        pipelineMetricsColumnsCached = true;
        return true;
    } catch (err) {
        writeLog("\n[ERROR] ensurePipelineMetricsColumns: " + err);
        pipelineMetricsColumnsCached = false;
        return false;
    }
};

// Create a new pipeline run
const createPipelineRun = async ({ runId, userId = null, pipelineType, inputFilePath, jobId = null, uploadSizeBytes = null }) => {
    const ensured = await ensurePipelineMetricsColumns();
    if (!ensured) {
        throw new Error('Failed to ensure pipeline_runs metrics columns');
    }
    const values = [runId, jobId, userId, PIPELINE_STATUS.QUEUED, pipelineType, inputFilePath, uploadSizeBytes];
    try {
        const query = `
            INSERT INTO microbrsoil_db.pipeline_runs 
            (run_id, job_id, user_id, status, pipeline_type, input_file_path, upload_size_bytes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`;
        const response = await pool.query(query, values);
        writeLog("\n[SUCCESS] Pipeline run created: " + JSON.stringify(response.rows[0]));
        return response.rows[0];
    } catch (err) {
        writeLog("\n[ERROR] Create pipeline run: " + err + "\nvalues: " + values);
        throw err;
    }
};

// Update pipeline run status
const updatePipelineRunStatus = async (runId, status, errorMessage = null, logs = null) => {
    try {
        const ensured = await ensurePipelineMetricsColumns();
        if (!ensured) {
            throw new Error('Failed to ensure pipeline_runs metrics columns');
        }
        let query = `UPDATE microbrsoil_db.pipeline_runs SET status = $2`;
        let values = [runId, status];
        let valueIndex = 3;

        if (status === PIPELINE_STATUS.RUNNING && !errorMessage) {
            query += `, started_at = CURRENT_TIMESTAMP`;
        } else if (status === PIPELINE_STATUS.COMPLETED || status === PIPELINE_STATUS.FAILED) {
            query += `, finished_at = CURRENT_TIMESTAMP`;
            query += `, duration_ms = CASE WHEN started_at IS NULL THEN duration_ms ELSE (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000)::BIGINT END`;
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
        writeLog("\n[SUCCESS] Pipeline run updated: " + JSON.stringify(response.rows[0]));
        return response.rows[0];
    } catch (err) {
        writeLog("\n[ERROR] Update pipeline run: " + err);
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
        writeLog("\n[ERROR] Fetch pipeline run: " + err);
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
        writeLog("\n[ERROR] Fetch pipeline runs by user: " + err);
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
        writeLog("\n[ERROR] Fetch pipeline runs (admin): " + err);
        throw err;
    }
};

const getPipelineRunsPaginated = async ({
    userId = null,
    status = '',
    limit = 20,
    offset = 0,
    userSearch = '',
    from = '',
    to = '',
    sortBy = '',
    sortOrder = ''
} = {}) => {
    try {
        const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
        const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (userId !== null && userId !== undefined) {
            conditions.push(`pr.user_id = $${paramIndex++}`);
            params.push(userId);
        }

        if (status) {
            if (status === 'active') {
                conditions.push(`pr.status NOT IN ('completed', 'failed')`);
            } else {
                conditions.push(`pr.status = $${paramIndex++}`);
                params.push(status);
            }
        }

        if (userSearch) {
            conditions.push(`u.user_email ILIKE $${paramIndex++}`);
            params.push(`%${userSearch}%`);
        }

        if (from) {
            conditions.push(`pr.created_at >= $${paramIndex++}::date`);
            params.push(from);
        }

        if (to) {
            conditions.push(`pr.created_at < ($${paramIndex++}::date + interval '1 day')`);
            params.push(to);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const userJoin = `LEFT JOIN microbrsoil_db.users u ON pr.user_id = u.user_id`;
        const sortMap = {
            created_at: 'pr.created_at',
            status: 'pr.status',
            user: 'u.user_email',
            pipeline: 'pr.pipeline_type'
        };
        const sortColumn = sortMap[sortBy] || 'pr.created_at';
        const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const nullsClause = sortColumn === 'u.user_email' ? 'NULLS LAST' : '';

        const countQuery = `
            SELECT COUNT(*) as total
            FROM microbrsoil_db.pipeline_runs pr
            ${userJoin}
            ${whereClause}
        `;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0]?.total || 0, 10);

        params.push(safeLimit);
        params.push(safeOffset);

        const dataQuery = `
            SELECT 
                pr.run_id,
                pr.status,
                pr.pipeline_type,
                pr.created_at,
                pr.started_at,
                pr.finished_at,
                u.user_email as user_email
            FROM microbrsoil_db.pipeline_runs pr
            ${userJoin}
            ${whereClause}
            ORDER BY ${sortColumn} ${sortDirection} ${nullsClause}
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;
        const response = await pool.query(dataQuery, params);
        return { rows: response.rows, total, limit: safeLimit, offset: safeOffset };
    } catch (err) {
        writeLog("\n[ERROR] Fetch pipeline runs paginated: " + err);
        throw err;
    }
};

// Mark queued/running runs as failed after a restart (queue cleared)
const resetActivePipelineRuns = async (reason = 'Cleared on restart') => {
    try {
        const statuses = [PIPELINE_STATUS.QUEUED, PIPELINE_STATUS.RUNNING];
        const query = `
            UPDATE microbrsoil_db.pipeline_runs
            SET status = $1,
                error_message = $2,
                finished_at = CURRENT_TIMESTAMP,
                duration_ms = CASE
                    WHEN started_at IS NULL THEN duration_ms
                    ELSE (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000)::BIGINT
                END
            WHERE status = ANY($3::text[])
            RETURNING run_id
        `;
        const response = await pool.query(query, [PIPELINE_STATUS.FAILED, reason, statuses]);
        writeLog(`\n[SUCCESS] Reset active pipeline runs: ${response.rowCount}`);
        return response.rows.map(row => row.run_id);
    } catch (err) {
        writeLog("\n[ERROR] Reset active pipeline runs: " + err);
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
        writeLog("\n[SUCCESS] Pipeline result upserted: " + JSON.stringify(response.rows[0]));
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
                    writeLog("\n[SUCCESS] Pipeline result updated (manual fallback): " + JSON.stringify(updateRes.rows[0]));
                    return updateRes.rows[0];
                }

                const insertRes = await client.query(`
                    INSERT INTO microbrsoil_db.pipeline_results 
                    (run_id, soil_id, alpha_diversity_file, otu_table_file, taxonomy_file, metadata_file, processed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                    RETURNING *`, values);
                await client.query('COMMIT');
                writeLog("\n[SUCCESS] Pipeline result inserted (manual fallback): " + JSON.stringify(insertRes.rows[0]));
                return insertRes.rows[0];
            } catch (fallbackErr) {
                await client.query('ROLLBACK');
                writeLog("\n[ERROR] Fallback upsert pipeline result: " + fallbackErr + "\nvalues: " + values);
                throw fallbackErr;
            } finally {
                client.release();
            }
        }

        writeLog("\n[ERROR] Upsert pipeline result: " + err + "\nvalues: " + values);
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
        writeLog("\n[ERROR] Fetch pipeline results: " + err);
        throw err;
    }
};

module.exports = {
    createPipelineRun,
    updatePipelineRunStatus,
    getPipelineRun,
    getPipelineRunsByUser,
    getPipelineRunsAll,
    getPipelineRunsPaginated,
    resetActivePipelineRuns,
    createPipelineResult,
    getPipelineResults,
    ensurePipelineMetricsColumns
};
