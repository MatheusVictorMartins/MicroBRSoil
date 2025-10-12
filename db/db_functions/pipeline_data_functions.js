const pool = require('../db');
const writeLog = require('../log_files/log_handler');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Import other database functions
const { createPipelineResult } = require('./pipeline_functions');
const sampleFunctions = require('./sample_funtion');
const alphaFunctions = require('./alpha_functions');
const soilFunctions = require('./soil_funtions');

/**
 * Process and save pipeline results to database after successful completion
 * @param {string} runId - Pipeline run ID
 * @param {string} outputDirectory - Directory containing pipeline results
 * @param {string} pipelineType - Type of pipeline (illumina, iontorrent, its)
 * @param {number} userId - User ID who initiated the pipeline
 * @returns {Promise<Object>} Result object with success status and created records
 */
const processPipelineResults = async (runId, outputDirectory, pipelineType, userId = null) => {
    try {
        writeLog(`\n[INFO] Iniciando processamento de resultados do pipeline ${pipelineType} para run ${runId}`);
        
        // Check if pipeline completed successfully by reading status file
        const statusFilePath = path.join(outputDirectory, 'pipeline_status.json');
        if (!fs.existsSync(statusFilePath)) {
            throw new Error('Pipeline status file not found - pipeline may not have completed successfully');
        }

        const statusData = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
        if (statusData.status !== 'success') {
            throw new Error(`Pipeline did not complete successfully. Status: ${statusData.status}`);
        }

        writeLog(`\n[SUCCESS] Pipeline completed successfully - no errors detected`);

        // Define expected result files based on pipeline type
        const expectedFiles = {
            alpha: 'alpha_diversity_metrics.csv',
            otu: 'otu_table.csv',
            taxonomy: 'tax_table.csv',
            metadata: 'sample_metadata.csv'
        };

        const resultFiles = {};
        const missingFiles = [];

        // Check for result files
        for (const [key, filename] of Object.entries(expectedFiles)) {
            const filePath = path.join(outputDirectory, filename);
            if (fs.existsSync(filePath)) {
                resultFiles[key] = filePath;
                writeLog(`\n[SUCCESS] Found file: ${filename}`);
            } else {
                missingFiles.push(filename);
                writeLog(`\n[WARNING] Missing file: ${filename}`);
            }
        }

        if (missingFiles.length > 0) {
            writeLog(`\n[WARNING] Some expected files are missing: ${missingFiles.join(', ')}`);
        }

        // Create pipeline result record with file paths
        const pipelineResult = await createPipelineResult({
            runId,
            soilId: null, // Will be updated if soil data is processed
            alphaDiversityFile: resultFiles.alpha || null,
            otuTableFile: resultFiles.otu || null,
            taxonomyFile: resultFiles.taxonomy || null,
            metadataFile: resultFiles.metadata || null
        });

        writeLog(`\n[SUCCESS] Pipeline result record created: ${pipelineResult.result_id}`);

        // Process and store data in database if all required files exist
        let soilId = null;
        let processedRecords = {
            alphaRecords: 0,
            sampleRecords: 0,
            soilId: null
        };
        
        if (resultFiles.alpha && resultFiles.otu && resultFiles.taxonomy) {
            try {
                writeLog(`\n[INFO] All required files found, processing data...`);
                const result = await processAndStoreData(resultFiles, userId, runId, pipelineType);
                soilId = result.soilId;
                processedRecords = result;
                
                // Update pipeline result with soil_id if created
                if (soilId) {
                    await pool.query(
                        'UPDATE microbrsoil_db.pipeline_results SET soil_id = $1 WHERE run_id = $2',
                        [soilId, runId]
                    );
                    writeLog(`\n[SUCCESS] Updated pipeline result with soil_id: ${soilId}`);
                }
            } catch (error) {
                writeLog(`\n[ERROR] Erro ao processar dados para o banco: ${error.message}`);
                // Don't throw error here - we still want to record that files were created
            }
        } else {
            writeLog(`\n[WARNING] Cannot process data - missing required files`);
        }

        const result = {
            success: true,
            runId,
            pipelineType,
            pipelineResultId: pipelineResult.result_id,
            soilId,
            processedRecords,
            resultFiles: Object.keys(resultFiles),
            missingFiles
        };

        writeLog(`\n[SUCCESS] Pipeline results processed successfully for run ${runId}`);
        return result;

    } catch (error) {
        writeLog(`\n[ERROR] Erro ao processar resultados do pipeline: ${error.message}`);
        throw error;
    }
};

/**
 * Process CSV files and store data in database
 * @param {Object} resultFiles - Object containing file paths
 * @param {number} userId - User ID
 * @param {string} runId - Pipeline run ID
 * @param {string} pipelineType - Pipeline type
 * @returns {Promise<Object>} Processing results
 */
const processAndStoreData = async (resultFiles, userId, runId, pipelineType) => {
    try {
        writeLog(`\n[INFO] Reading CSV files...`);
        
        // Read CSV files
        const alphaData = await readCSV(resultFiles.alpha);
        const otuData = await readCSV(resultFiles.otu);
        const taxonomyData = await readCSV(resultFiles.taxonomy);
        const metadataData = resultFiles.metadata ? await readCSV(resultFiles.metadata) : [];

        writeLog(`\n[SUCCESS] CSV files read successfully`);
        writeLog(`\n[INFO] Alpha diversity records: ${alphaData.length}`);
        writeLog(`\n[INFO] OTU table records: ${otuData.length}`);
        writeLog(`\n[INFO] Taxonomy records: ${taxonomyData.length}`);
        writeLog(`\n[INFO] Metadata records: ${metadataData.length}`);

        // Create a soil record for the pipeline results
        let soilRecord;
        try {
            const soilData = {
                sample_name: `Pipeline_${pipelineType}_${runId}`,
                collection_date: new Date(),
                soil_depth: 0,
                elev: 0,
                env_broad_scale: `${pipelineType.toUpperCase()} Pipeline Results`,
                env_local_scale: 'Bioinformatics Processing',
                env_medium: 'Sequencing Data',
                geo_loc_name: 'Unknown',
                lat_lon: { x: 0, y: 0 },
                Enz_Aril: 0,
                Enz_Beta: 0,
                Enz_Fosf: 0,
                metadata_description: `Results from ${pipelineType} pipeline run ${runId}`,
                owner_id: userId || 1
            };

            soilRecord = await soilFunctions.createSoil(soilData);
            writeLog(`\n[SUCCESS] Soil record created`);
        } catch (soilError) {
            writeLog(`\n[ERROR] Erro ao criar registro de solo: ${soilError.message}`);
            throw new Error(`Failed to create soil record: ${soilError.message}`);
        }

        const soilId = soilRecord.rows[0].soil_id;
        let alphaRecords = 0;
        let sampleRecords = 0;

        // Process alpha diversity data
        if (alphaData.length > 0) {
            writeLog(`\n[INFO] Processing alpha diversity data...`);
            
            for (const row of alphaData) {
                try {
                    // Different column names based on pipeline type
                    const observed = row.observed || row.Observed || 0;
                    const shannon = row.shannon || row.Shannon || 0;
                    const simpson = row.simpson || row.Simpson || 0;
                    const chao1 = row.chao1 || row.Chao1 || row.breakaway || observed;
                    const goods = row.goods || row.goods_coverage || row.Goods || row.Goods_coverage || observed;

                    if (observed && shannon && simpson) {
                        await alphaFunctions.createAlpha({
                            id: soilId,
                            alphaArray: [
                                parseInt(observed) || 0,
                                parseFloat(shannon) || 0,
                                parseFloat(simpson) || 0,
                                parseInt(chao1) || parseInt(observed) || 0,
                                parseInt(goods) || parseInt(observed) || 0
                            ]
                        });
                        alphaRecords++;
                    }
                } catch (alphaError) {
                    writeLog(`\n[WARNING] Erro ao processar linha de diversidade alfa: ${alphaError.message}`);
                }
            }
            writeLog(`\n[SUCCESS] Alpha diversity records processed: ${alphaRecords}`);
        }

        // Process taxonomy and OTU data together
        if (taxonomyData.length > 0 && otuData.length > 0) {
            writeLog(`\n[INFO] Processing taxonomy and OTU data...`);
            
            const sequenceMap = new Map();
            
            // Process taxonomy data
            taxonomyData.forEach((row, index) => {
                try {
                    // Handle different ways sequences might be identified
                    const sequence = row[''] || row.sequence || row.asv || row.otu || `ASV_${index + 1}`;
                    
                    if (sequence) {
                        sequenceMap.set(sequence, {
                            taxonomy: [
                                sequence, // plant_sequence
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
                } catch (taxError) {
                    writeLog(`\n[WARNING] Erro ao processar linha de taxonomia ${index}: ${taxError.message}`);
                }
            });

            // Add OTU data - handle different OTU table structures
            otuData.forEach((row, index) => {
                try {
                    const sequence = row[''] || row.sequence || row.asv || row.otu || `ASV_${index + 1}`;
                    
                    if (sequence && sequenceMap.has(sequence)) {
                        const data = sequenceMap.get(sequence);
                        
                        // Get the first two numeric columns as OTU counts
                        const numericColumns = Object.keys(row).filter(key => {
                            const value = row[key];
                            return !isNaN(value) && value !== null && value !== '';
                        });
                        
                        data.otus = [
                            parseInt(row[numericColumns[0]]) || 0,
                            parseInt(row[numericColumns[1]]) || 0
                        ];
                    }
                } catch (otuError) {
                    writeLog(`\n[WARNING] Erro ao processar linha de OTU ${index}: ${otuError.message}`);
                }
            });

            // Store sample data
            for (const [sequence, data] of sequenceMap) {
                try {
                    if (data.taxonomy.some(t => t !== null && t !== '')) {
                        await sampleFunctions.createSample({
                            id: soilId,
                            taxArray: data.taxonomy,
                            otuArray: data.otus
                        });
                        sampleRecords++;
                    }
                } catch (sampleError) {
                    writeLog(`\n[WARNING] Erro ao criar amostra para sequência ${sequence}: ${sampleError.message}`);
                }
            }
            
            writeLog(`\n[SUCCESS] Sample records processed: ${sampleRecords}`);
        }

        const result = {
            soilId,
            alphaRecords,
            sampleRecords
        };

        writeLog(`\n[SUCCESS] Data processed and stored successfully`);
        writeLog(`\n[INFO] Summary - Soil ID: ${soilId}, Alpha records: ${alphaRecords}, Sample records: ${sampleRecords}`);
        
        return result;

    } catch (error) {
        writeLog(`\n[ERROR] Erro ao processar e armazenar dados: ${error.message}`);
        throw error;
    }
};

/**
 * Helper function to read CSV files
 * @param {string} filePath - Path to CSV file
 * @returns {Promise<Array>} Array of CSV rows
 */
const readCSV = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        
        if (!fs.existsSync(filePath)) {
            reject(new Error(`File not found: ${filePath}`));
            return;
        }
        
        fs.createReadStream(filePath)
            .pipe(csv({
                mapValues: ({ header, index, value }) => {
                    // Handle different null/empty representations
                    if (value === 'NA' || value === '' || value === 'NULL' || value === 'null') {
                        return null;
                    }
                    return value;
                },
                mapHeaders: ({ header, index }) => {
                    // Clean and normalize headers
                    return header === '' ? 'sequence' : header.toLowerCase().trim();
                }
            }))
            .on('data', (data) => {
                // Convert numeric strings to numbers where appropriate
                Object.keys(data).forEach((key) => {
                    const value = data[key];
                    if (value !== null && !isNaN(Number(value)) && value !== '') {
                        data[key] = Number(value);
                    }
                });
                results.push(data);
            })
            .on('end', () => {
                writeLog(`\n[SUCCESS] CSV file read: ${filePath} (${results.length} rows)`);
                resolve(results);
            })
            .on('error', (err) => {
                writeLog(`\n[ERROR] Error reading CSV file ${filePath}: ${err.message}`);
                reject(err);
            });
    });
};

module.exports = {
    processPipelineResults,
    processAndStoreData,
    readCSV
};