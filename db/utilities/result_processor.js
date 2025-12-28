const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const writeLog = require('../log_files/log_handler');

// Dynamic require for database modules based on environment
function requireDbModule(modulePath) {
    if (process.env.NODE_ENV === 'production') {
        return require(modulePath);
    } else {
        return require(modulePath);
    }
}

const pool = requireDbModule('../db');
const { createPipelineResult } = requireDbModule('../db_functions/pipeline_functions');
const { processPipelineResults: processNewPipelineResults } = requireDbModule('../db_functions/pipeline_data_functions');
const sampleFunctions = requireDbModule('../db_functions/sample_funtion');
const alphaFunctions = requireDbModule('../db_functions/alpha_functions');
const soilFunctions = requireDbModule('../db_functions/soil_funtions');

const fetchRunOwnerInfo = async (runId) => {
    if (!runId) return { runExists: false, ownerId: null };
    try {
        const res = await pool.query(
            'SELECT user_id FROM microbrsoil_db.pipeline_runs WHERE run_id = $1',
            [runId]
        );
        if (res.rows.length === 0) {
            return { runExists: false, ownerId: null };
        }
        return { runExists: true, ownerId: res.rows[0].user_id };
    } catch (err) {
        writeLog(`\n[WARNING] Could not fetch pipeline_runs owner for run ${runId}: ${err.message}`);
        return { runExists: false, ownerId: null };
    }
};

const ensureRunOwnerId = async (runId, ownerId) => {
    if (!runId || !ownerId) return;
    try {
        const res = await pool.query(
            'UPDATE microbrsoil_db.pipeline_runs SET user_id = $1 WHERE run_id = $2 AND user_id IS NULL',
            [ownerId, runId]
        );
        if (res.rowCount > 0) {
            writeLog(`\n[INFO] Updated pipeline_runs user_id for run ${runId} to ${ownerId}`);
        }
    } catch (err) {
        writeLog(`\n[WARNING] Could not update pipeline_runs user_id for run ${runId}: ${err.message}`);
    }
};

const ensureSoilOwnerId = async (soilId, ownerId) => {
    if (!soilId || !ownerId) return;
    try {
        const res = await pool.query(
            'UPDATE microbrsoil_db.soil SET owner_id = $1 WHERE soil_id = $2 AND owner_id <> $1',
            [ownerId, soilId]
        );
        if (res.rowCount > 0) {
            writeLog(`\n[INFO] Updated soil owner for soil_id ${soilId} to ${ownerId}`);
        }
    } catch (err) {
        writeLog(`\n[WARNING] Could not update soil owner for soil_id ${soilId}: ${err.message}`);
    }
};

const resolveRunOwnerId = async (runId, fallbackUserId) => {
    const runInfo = await fetchRunOwnerInfo(runId);
    let ownerId = runInfo.ownerId;

    if (!ownerId && fallbackUserId) {
        const parsed = Number(fallbackUserId);
        if (!Number.isNaN(parsed)) {
            ownerId = parsed;
        }
    }

    if (runInfo.runExists && !runInfo.ownerId && ownerId) {
        await ensureRunOwnerId(runId, ownerId);
    }

    return ownerId;
};

// Process pipeline results and store in database
const processPipelineResults = async (runId, outputDirectory, userId = null, pipelineType = 'default') => {
    try {
        writeLog(`\n[INFO] Processing pipeline results using new pipeline data functions for run ${runId}`);
        
        // Use the new comprehensive pipeline data processing function
        const result = await processNewPipelineResults(runId, outputDirectory, pipelineType, userId);
        
        writeLog(`\n[SUCCESS] Pipeline results processed successfully using new system`);
        return result;

    } catch (error) {
        writeLog(`\n[ERROR] New pipeline processing failed, falling back to legacy method: ${error.message}`);
        
        // Fallback to legacy processing if new method fails
        return await processPipelineResultsLegacy(runId, outputDirectory, userId);
    }
};

// Legacy processing method (renamed from original)
const processPipelineResultsLegacy = async (runId, outputDirectory, userId = null) => {
    try {
        writeLog(`\n[INFO] Using legacy pipeline processing for run ${runId}`);
        
        // Expected result files (legacy names)
        const expectedFiles = {
            alpha: 'alpha_diversity_metrics.csv',
            otu: 'otu_table.csv',
            taxonomy: 'taxonomy_table.csv',
            metadata: 'mock_metadata.csv'
        };

        const resultFiles = {};
        const missingFiles = [];

        // Check for result files
        for (const [key, filename] of Object.entries(expectedFiles)) {
            const filePath = path.join(outputDirectory, filename);
            if (fs.existsSync(filePath)) {
                resultFiles[key] = filePath;
            } else {
                missingFiles.push(filename);
            }
        }

        if (missingFiles.length > 0) {
            writeLog(`\n[WARNING] Files not found: ${missingFiles.join(', ')}`);
        }

        // Create pipeline result record
        const pipelineResult = await createPipelineResult({
            runId,
            soilId: null, // Will be updated if soil data is processed
            alphaDiversityFile: resultFiles.alpha || null,
            otuTableFile: resultFiles.otu || null,
            taxonomyFile: resultFiles.taxonomy || null,
            metadataFile: resultFiles.metadata || null
        });

        // Process and store data in database if files exist
        let soilId = null;
        const ownerId = await resolveRunOwnerId(runId, userId);
        
        if (resultFiles.alpha && resultFiles.otu && resultFiles.taxonomy) {
            try {
                soilId = await processAndStoreDataLegacy(resultFiles, ownerId || userId, runId);
                
                // Update pipeline result with soil_id if created
                if (soilId) {
                    await pool.query(
                        'UPDATE microbrsoil_db.pipeline_results SET soil_id = $1 WHERE run_id = $2',
                        [soilId, runId]
                    );
                    if (ownerId) {
                        await ensureSoilOwnerId(soilId, ownerId);
                    }
                }
            } catch (error) {
                writeLog(`\n[ERROR] Failed to process data for the database: ${error.message}`);
                // Don't throw error here - we still want to record the files were created
            }
        }

        writeLog(`\n[SUCCESS] Legacy pipeline processing completed for run ${runId}`);
        return pipelineResult;

    } catch (error) {
        writeLog(`\n[ERROR] Failed to process pipeline results (legacy): ${error.message}`);
        throw error;
    }
};

// Legacy process CSV files and store data in database
const processAndStoreDataLegacy = async (resultFiles, userId, runId) => {
    try {
        // Read CSV files
        const alphaData = await readCSV(resultFiles.alpha);
        const otuData = await readCSV(resultFiles.otu);
        const taxonomyData = await readCSV(resultFiles.taxonomy);

        // Create a basic soil record for the pipeline results
        // In a real scenario, metadata would come from the uploaded file or form
        let soilRecord;
        try {
            soilRecord = await soilFunctions.createSoil({
                sample_name: `Pipeline_${runId}`,
                collection_date: new Date(),
                soil_depth: 0,
                elev: 0,
                env_broad_scale: 'Unknown',
                env_local_scale: 'Unknown', 
                env_medium: 'Unknown',
                geo_loc_name: 'Unknown',
                lat_lon: { x: 0, y: 0 },
                Enz_Aril: 0,
                Enz_Beta: 0,
                Enz_Fosf: 0,
                owner_id: userId || 1
            });
        } catch (soilError) {
            writeLog(`\n[ERROR] Failed to create soil record: ${soilError.message}`);
            throw new Error(`Failed to create soil record: ${soilError.message}`);
        }

        const soilId = soilRecord.rows[0].soil_id;

        // Process alpha diversity data
        if (alphaData.length > 0) {
            for (const row of alphaData) {
                if (row.observed && row.shannon && row.simpson && row.chao1 && row.goods) {
                    await alphaFunctions.createAlpha({
                        id: soilId,
                        alphaArray: [
                            parseInt(row.observed),
                            parseFloat(row.shannon),
                            parseFloat(row.simpson),
                            parseInt(row.chao1),
                            parseInt(row.goods)
                        ]
                    });
                }
            }
        }

        // Process taxonomy and OTU data together
        const sequenceMap = new Map();
        
        // First, process taxonomy data
        taxonomyData.forEach(row => {
            const sequence = row[''] || row.sequence;
            if (sequence) {
                sequenceMap.set(sequence, {
                    taxonomy: [
                        row.kingdom || null,
                        row.phylum || null,
                        row.class || null,
                        row.order || null,
                        row.family || null,
                        row.genus || null,
                        row.species || null
                    ],
                    otus: [0, 0] // Will be filled from OTU data
                });
            }
        });

        // Then, add OTU data
        otuData.forEach(row => {
            const sequence = row[''] || row.sequence;
            if (sequence && sequenceMap.has(sequence)) {
                const data = sequenceMap.get(sequence);
                data.otus = [
                    parseInt(row.test1) || 0,
                    parseInt(row.test2) || 0
                ];
            }
        });

        // Store sample data
        for (const [sequence, data] of sequenceMap) {
            if (data.taxonomy.some(t => t !== null)) {
                await sampleFunctions.createSample({
                    id: soilId,
                    taxArray: [sequence, ...data.taxonomy],
                    otuArray: data.otus
                });
            }
        }

        writeLog(`\n[SUCCESS] Data processed and stored for soil_id: ${soilId}`);
        return soilId;

    } catch (error) {
        writeLog(`\n[ERROR] Failed to process and store data: ${error.message}`);
        throw error;
    }
};

// Helper function to read CSV files
const readCSV = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv({
                mapValues: ({ header, index, value }) => (value === 'NA' || value === '' ? null : value),
                mapHeaders: ({ header, index }) => (header === '' ? 'sequence' : header).toLowerCase()
            }))
            .on('data', (data) => {
                // Convert numeric strings to numbers
                Object.keys(data).forEach((key) => {
                    if (!Number.isNaN(Number(data[key])) && data[key] != null) {
                        data[key] = Number(data[key]);
                    }
                });
                results.push(data);
            })
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

module.exports = {
    processPipelineResults,
    processPipelineResultsLegacy,
    processAndStoreDataLegacy,
    readCSV
};
