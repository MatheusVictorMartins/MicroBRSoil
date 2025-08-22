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
const sampleFunctions = requireDbModule('../db_functions/sample_funtion');
const alphaFunctions = requireDbModule('../db_functions/alpha_functions');
const soilFunctions = requireDbModule('../db_functions/soil_funtions');

// Process pipeline results and store in database
const processPipelineResults = async (runId, outputDirectory, userId = null) => {
    try {
        writeLog(`\n[INFO] Processando resultados do pipeline para run ${runId}`);
        
        // Expected result files
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
            writeLog(`\n[WARNING] Arquivos não encontrados: ${missingFiles.join(', ')}`);
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
        
        if (resultFiles.alpha && resultFiles.otu && resultFiles.taxonomy) {
            try {
                soilId = await processAndStoreData(resultFiles, userId, runId);
                
                // Update pipeline result with soil_id if created
                if (soilId) {
                    await pool.query(
                        'UPDATE microbrsoil_db.pipeline_results SET soil_id = $1 WHERE run_id = $2',
                        [soilId, runId]
                    );
                }
            } catch (error) {
                writeLog(`\n[ERROR] Erro ao processar dados para o banco: ${error.message}`);
                // Don't throw error here - we still want to record the files were created
            }
        }

        writeLog(`\n[SUCCESS] Resultados processados com sucesso para run ${runId}`);
        return pipelineResult;

    } catch (error) {
        writeLog(`\n[ERROR] Erro ao processar resultados do pipeline: ${error.message}`);
        throw error;
    }
};

// Process CSV files and store data in database
const processAndStoreData = async (resultFiles, userId, runId) => {
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
            writeLog(`\n[ERROR] Erro ao criar registro de solo: ${soilError.message}`);
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

        writeLog(`\n[SUCCESS] Dados processados e armazenados para soil_id: ${soilId}`);
        return soilId;

    } catch (error) {
        writeLog(`\n[ERROR] Erro ao processar e armazenar dados: ${error.message}`);
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
    processAndStoreData,
    readCSV
};
