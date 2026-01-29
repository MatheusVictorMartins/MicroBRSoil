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
 * Resolve a valid owner_id for soil records.
 * Prefer: explicit userId -> DEFAULT_OWNER_ID env -> first existing user in DB -> 1 (last resort).
 */
const resolveOwnerId = async (userId) => {
    if (userId) return userId;

    const envOwner = process.env.DEFAULT_OWNER_ID;
    if (envOwner && !isNaN(Number(envOwner))) {
        return Number(envOwner);
    }

    try {
        const res = await pool.query(
            'SELECT user_id FROM microbrsoil_db.users ORDER BY user_id ASC LIMIT 1'
        );
        if (res.rows.length > 0) {
            return res.rows[0].user_id;
        }
    } catch (err) {
        writeLog(`\n[WARNING] Could not resolve owner_id from users table: ${err.message}`);
    }

    // Fallback to 1 to avoid breaking flows, even if FK may fail
    return 1;
};

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

const fetchSoilOwnerId = async (soilId) => {
    if (!soilId) return null;
    try {
        const res = await pool.query(
            'SELECT owner_id FROM microbrsoil_db.soil WHERE soil_id = $1',
            [soilId]
        );
        if (res.rows.length > 0) {
            return res.rows[0].owner_id;
        }
    } catch (err) {
        writeLog(`\n[WARNING] Could not fetch soil owner for soil_id ${soilId}: ${err.message}`);
    }
    return null;
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

const resolveRunOwnerId = async (runId, fallbackUserId, existingSoilId = null) => {
    const runInfo = await fetchRunOwnerInfo(runId);
    let ownerId = runInfo.ownerId;

    if (!ownerId && existingSoilId) {
        ownerId = await fetchSoilOwnerId(existingSoilId);
    }

    if (!ownerId && fallbackUserId) {
        const parsed = Number(fallbackUserId);
        if (!Number.isNaN(parsed)) {
            ownerId = parsed;
        }
    }

    if (!ownerId) {
        ownerId = await resolveOwnerId(null);
    }

    if (runInfo.runExists && !runInfo.ownerId && ownerId) {
        await ensureRunOwnerId(runId, ownerId);
    }

    return ownerId;
};

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
        writeLog(`\n[INFO] Starting pipeline results processing for ${pipelineType} run ${runId}`);
        
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
                writeLog(`\n[ERROR] Failed to process data for the database: ${error.message}`);
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
        writeLog(`\n[ERROR] Failed to process pipeline results: ${error.message}`);
        throw error;
    }
};

/**
 * Parse metadata CSV row and map to soil table structure
 * @param {Object} metadataRow - First row from sample_metadata.csv
 * @param {string} pipelineType - Type of pipeline
 * @param {string} runId - Pipeline run ID
 * @returns {Object} Soil data object
 */
const parseMetadataForSoil = (metadataRow, pipelineType, runId, rowIndex = 0, totalRows = 1) => {
    // Helper function to safely parse numeric values
    const parseNumeric = (value, defaultValue = 0) => {
        if (value === null || value === undefined || value === '') return defaultValue;
        const parsed = parseFloat(String(value).replace(',', '.'));
        return isNaN(parsed) ? defaultValue : parsed;
    };

    const parseCoordinate = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = parseFloat(String(value).replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    };

    // Helper function to safely parse integer values
    const parseInt = (value, defaultValue = 0) => {
        if (value === null || value === undefined || value === '') return defaultValue;
        const parsed = Number.parseInt(String(value).replace(',', ''));
        return isNaN(parsed) ? defaultValue : parsed;
    };

    // Helper function to parse lat/lon coordinates
    const parseLatLon = (latLonString) => {
        if (!latLonString || latLonString === '') return { x: 0, y: 0 };
        
        try {
            // Handle different formats: "21.2345 S 44.9802 W" or "21.2345,-44.9802" or "(21.2345,-44.9802)"
            const cleaned = String(latLonString).trim().replace(/[()]/g, '');
            
            // Format 1: "21.2345 S 44.9802 W"
            if (cleaned.includes(' S ') || cleaned.includes(' N ')) {
                const parts = cleaned.split(/\s+/);
                let lat = parseFloat(parts[0]);
                let lon = parseFloat(parts[2]);
                
                if (cleaned.includes(' S')) lat = -Math.abs(lat);
                if (cleaned.includes(' N')) lat = Math.abs(lat);
                if (cleaned.includes(' W')) lon = -Math.abs(lon);
                if (cleaned.includes(' E')) lon = Math.abs(lon);
                
                return { x: lon, y: lat };
            }
            
            // Format 2: "21.2345,-44.9802" or "21.2345, -44.9802"
            if (cleaned.includes(',')) {
                const [lat, lon] = cleaned.split(',').map(s => parseFloat(s.trim()));
                if (!isNaN(lat) && !isNaN(lon)) {
                    return { x: lon, y: lat };
                }
            }

            // Format 3: "21.2345 -44.9802" (space-separated)
            const parts = cleaned.split(/\s+/).filter(Boolean);
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lon)) {
                    return { x: lon, y: lat };
                }
            }
            
            return { x: 0, y: 0 };
        } catch (err) {
            writeLog(`\n[WARNING] Failed to parse lat_lon: ${latLonString}, error: ${err.message}`);
            return { x: 0, y: 0 };
        }
    };

    // Helper function to parse date
    const parseDate = (dateString) => {
        if (!dateString || dateString === '') return new Date();
        
        try {
            // Try parsing as-is first
            const parsed = new Date(dateString);
            if (!isNaN(parsed.getTime())) return parsed;
            
            // Handle format like "15-Feb-2025"
            const monthMap = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
            };
            
            const match = String(dateString).match(/(\d+)-([A-Za-z]+)-(\d+)/);
            if (match) {
                const day = match[1].padStart(2, '0');
                const month = monthMap[match[2]];
                const year = match[3];
                return new Date(`${year}-${month}-${day}`);
            }
            
            return new Date();
        } catch (err) {
            writeLog(`\n[WARNING] Failed to parse date: ${dateString}, error: ${err.message}`);
            return new Date();
        }
    };

    // Map metadata columns to soil table columns
    // Support multiple naming conventions (case-insensitive, with/without #)
    const getValue = (possibleKeys, defaultValue = null) => {
        for (const key of possibleKeys) {
            const value = metadataRow[key] || metadataRow[key.toLowerCase()] || 
                         metadataRow[`#${key}`] || metadataRow[`#${key.toLowerCase()}`];
            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
        }
        return defaultValue;
    };

    const rawSampleName = getValue(['SAMPLE_NAME', 'sample_name', 'SampleID', 'Sample', 'sample_id'], null);
    let sampleName = rawSampleName ? String(rawSampleName).trim() : '';
    if (!sampleName) {
        sampleName = totalRows > 1
            ? `Pipeline_${pipelineType}_${runId}_sample_${rowIndex + 1}`
            : `Pipeline_${pipelineType}_${runId}`;
    }

    let latLon = parseLatLon(getValue(['lat_lon', 'LatLon', 'coordinates', 'Coordinates']));
    if ((latLon.x === 0 && latLon.y === 0)) {
        const latField = getValue(['latitude', 'lat', 'Latitude', 'Latitude_deg', 'Lat']);
        const lonField = getValue(['longitude', 'lon', 'long', 'Longitude', 'Longitude_deg', 'Lon']);
        const parsedLat = parseCoordinate(latField);
        const parsedLon = parseCoordinate(lonField);
        if (parsedLat !== null && parsedLon !== null) {
            latLon = { x: parsedLon, y: parsedLat };
        }
    }

    const runTag = `run ${runId}`;
    let description = getValue(['description', 'Description', 'metadata_description'], null);
    if (description && String(description).trim()) {
        description = String(description).trim();
        if (!description.toLowerCase().includes(String(runId).toLowerCase())) {
            description = `${description} (${runTag})`;
        }
    } else {
        description = `Results from ${pipelineType} pipeline run ${runId}`;
    }

    const soilData = {
        sample_name: sampleName,
        collection_date: parseDate(getValue(['collection_date', 'CollectionDate', 'date'])),
        soil_depth: parseInt(getValue(['depth', 'soil_depth', 'Depth'], 0), 0),
        elev: parseInt(getValue(['elev', 'elevation', 'Elevation'], 0), 0),
        env_broad_scale: getValue(['env_broad_scale', 'Environment', 'environment'], `${pipelineType.toUpperCase()} Pipeline Results`) || 'Unknown',
        env_local_scale: getValue(['env_local_scale', 'LocalScale'], 'Bioinformatics Processing') || 'Unknown',
        env_medium: getValue(['env_medium', 'Medium'], 'Sequencing Data') || 'Unknown',
        geo_loc_name: getValue(['geo_loc_name', 'Location', 'location', 'Site', 'site'], 'Unknown') || 'Unknown',
        lat_lon: latLon,
        Enz_Aril: parseNumeric(getValue(['Enz_Aril', 'EnzAril', 'arylsulfatase']), 0),
        Enz_Beta: parseNumeric(getValue(['Enz_Beta', 'EnzBeta', 'beta_glucosidase']), 0),
        Enz_Fosf: parseNumeric(getValue(['Enz_Fosf', 'EnzFosf', 'phosphatase']), 0),
        
        // Optional fields - only include if present
        agrochem_addition: getValue(['agrochem_addition', 'AgrochemAddition', 'agrochemical']),
        al_sat: parseNumeric(getValue(['al_sat', 'AlSat', 'aluminum_saturation']), null),
        altitude: parseNumeric(getValue(['altitude', 'Altitude', 'alt']), null),
        annual_precpt: parseNumeric(getValue(['annual_precpt', 'AnnualPrecipitation', 'precipitation']), null),
        annual_temp: parseNumeric(getValue(['annual_temp', 'AnnualTemperature', 'temperature', 'Temperature']), null),
        crop_rotation: getValue(['crop_rotation', 'CropRotation', 'rotation']),
        cur_land_use: getValue(['cur_land_use', 'CurrentLandUse', 'land_use']),
        cur_vegetation: getValue(['cur_vegetation', 'CurrentVegetation', 'vegetation']),
        extreme_event: getValue(['extreme_event', 'ExtremeEvent', 'event']),
        fao_class: getValue(['fao_class', 'FAOClass', 'fao']),
        fire: getValue(['fire', 'Fire']),
        flooding: getValue(['flooding', 'Flooding']),
        heavy_metals: getValue(['heavy_metals', 'HeavyMetals', 'metals']),
        local_class: getValue(['local_class', 'LocalClass', 'soil_class']),
        microbial_biomass: parseNumeric(getValue(['microbial_biomass', 'MicrobialBiomass', 'biomass']), null),
        ph: parseNumeric(getValue(['ph', 'pH', 'Soil_ph', 'soil_ph']), null),
        previous_land_use: getValue(['previous_land_use', 'PreviousLandUse']),
        soil_horizon: getValue(['soil_horizon', 'SoilHorizon', 'horizon']),
        soil_text: getValue(['soil_text', 'SoilTexture', 'texture']),
        soil_type: getValue(['soil_type', 'SoilType', 'type']),
        tillage: getValue(['tillage', 'Tillage']),
        tot_nitro: parseNumeric(getValue(['tot_nitro', 'TotalNitrogen', 'nitrogen', 'N']), null),
        tot_org_carb: parseNumeric(getValue(['tot_org_carb', 'TotalOrganicCarbon', 'organic_carbon', 'C']), null),
        metadata_description: description
    };

    return soilData;
};

const findUploadedMetadataFile = (uploadsDir, runId) => {
    const runDir = path.join(uploadsDir, runId);
    if (!fs.existsSync(runDir)) return null;

    const entries = fs.readdirSync(runDir)
        .map((name) => {
            const fullPath = path.join(runDir, name);
            let stats = null;
            try {
                stats = fs.statSync(fullPath);
            } catch (err) {
                return null;
            }
            if (!stats || !stats.isFile()) return null;
            return {
                name,
                path: fullPath,
                size: stats.size
            };
        })
        .filter(Boolean);

    const csvFiles = entries.filter((entry) => entry.name.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) return null;

    const exact = csvFiles.find((entry) => entry.name.toLowerCase() === 'metadata.csv');
    if (exact) return exact.path;

    const metadataNamed = csvFiles.filter((entry) => entry.name.toLowerCase().includes('metadata'));
    if (metadataNamed.length > 0) {
        metadataNamed.sort((a, b) => b.size - a.size);
        return metadataNamed[0].path;
    }

    csvFiles.sort((a, b) => b.size - a.size);
    return csvFiles[0].path;
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
        
        // Try to find the original uploaded metadata.csv first (in uploads directory)
        // This file has the rich metadata uploaded by the user
        const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
        const uploadedMetadataPath = findUploadedMetadataFile(uploadsDir, runId);
        
        let metadataData = [];
        let metadataSource = 'none';
        
        if (uploadedMetadataPath && fs.existsSync(uploadedMetadataPath)) {
            // Use the original uploaded metadata (rich data)
            metadataData = await readCSV(uploadedMetadataPath);
            metadataSource = `uploaded (${path.basename(uploadedMetadataPath)})`;
            writeLog(`\n[INFO] Found uploaded metadata file ${path.basename(uploadedMetadataPath)} with ${metadataData.length} records`);
        } else if (resultFiles.metadata && fs.existsSync(resultFiles.metadata)) {
            // Fall back to R-generated sample_metadata.csv (minimal data)
            metadataData = await readCSV(resultFiles.metadata);
            metadataSource = 'R-generated (minimal)';
            writeLog(`\n[INFO] Using R-generated sample_metadata.csv with ${metadataData.length} records`);
        } else {
            writeLog(`\n[WARNING] No metadata file found in uploads or results directories`);
        }

        writeLog(`\n[SUCCESS] CSV files read successfully`);
        writeLog(`\n[INFO] Alpha diversity records: ${alphaData.length}`);
        writeLog(`\n[INFO] OTU table records: ${otuData.length}`);
        writeLog(`\n[INFO] Taxonomy records: ${taxonomyData.length}`);
        writeLog(`\n[INFO] Metadata records: ${metadataData.length} (source: ${metadataSource})`);

        // Parse metadata from CSV if available
        let parsedMetadataRows = [];
        if (metadataData.length > 0) {
            writeLog(`\n[INFO] Parsing metadata from ${metadataSource} file...`);
            try {
                metadataData.forEach((row, index) => {
                    try {
                        const parsed = parseMetadataForSoil(row, pipelineType, runId, index, metadataData.length);
                        parsedMetadataRows.push(parsed);
                        if (index === 0) {
                            writeLog(`\n[SUCCESS] Metadata parsed successfully`);
                            writeLog(`\n[INFO] Sample name: ${parsed.sample_name}`);
                            writeLog(`\n[INFO] Location: ${parsed.geo_loc_name}`);
                            writeLog(`\n[INFO] pH: ${parsed.ph || 'N/A'}`);
                            writeLog(`\n[INFO] Coordinates: (${parsed.lat_lon.x}, ${parsed.lat_lon.y})`);
                        }
                    } catch (rowError) {
                        writeLog(`\n[WARNING] Failed to parse metadata row ${index + 1}: ${rowError.message}`);
                    }
                });
            } catch (metaError) {
                writeLog(`\n[WARNING] Failed to parse metadata: ${metaError.message}`);
                writeLog(`\n[WARNING] Will use default values`);
            }
        }

        // Check if soil record already exists for this run (idempotency check)
        // If the pipeline was retried, we should reuse the existing soil record
        let existingSoilId = null;
        try {
            const existingResult = await pool.query(
                'SELECT soil_id FROM microbrsoil_db.pipeline_results WHERE run_id = $1 AND soil_id IS NOT NULL',
                [runId]
            );
            if (existingResult.rows.length > 0) {
                existingSoilId = existingResult.rows[0].soil_id;
                writeLog(`\n[INFO] Reusing existing soil_id ${existingSoilId} for retry of run ${runId}`);
            }
        } catch (checkError) {
            writeLog(`\n[WARNING] Could not check for existing soil record: ${checkError.message}`);
        }

        const ownerId = await resolveRunOwnerId(runId, userId, existingSoilId);

        // Create a single run-level soil record for pipeline results
        let soilRecord;
        const createdSoilIds = [];
        const summarySampleName = `Pipeline_${pipelineType}_${runId}`;
        let soilId = existingSoilId || null;

        if (existingSoilId) {
            writeLog(`\n[INFO] Using existing run summary soil record: ${existingSoilId}`);
        }

        if (!soilId) {
            try {
                const summaryMatch = await pool.query(
                    `SELECT soil_id
                     FROM microbrsoil_db.soil
                     WHERE sample_name = $1
                       AND owner_id = $2
                       AND metadata_description ILIKE $3
                     ORDER BY soil_id ASC
                     LIMIT 1`,
                    [summarySampleName, ownerId, `%${runId}%`]
                );
                soilId = summaryMatch.rows[0]?.soil_id || null;
                if (soilId) {
                    writeLog(`\n[INFO] Reusing existing run summary soil_id ${soilId} for run ${runId}`);
                }
            } catch (matchError) {
                writeLog(`\n[WARNING] Could not check existing run summary soil: ${matchError.message}`);
            }
        }

        if (!soilId) {
            const uniqueValues = (key) => {
                const values = new Set(
                    parsedMetadataRows
                        .map(row => row?.[key])
                        .filter(value => value !== null && value !== undefined && value !== '')
                );
                return Array.from(values);
            };

            const locations = uniqueValues('geo_loc_name');
            const envMediumValues = uniqueValues('env_medium');
            const envBroadValues = uniqueValues('env_broad_scale');
            const envLocalValues = uniqueValues('env_local_scale');

            const geoLocName = locations.length === 1
                ? locations[0]
                : locations.length > 1
                    ? 'Multiple locations'
                    : 'Unknown';
            const envMedium = envMediumValues.length === 1
                ? envMediumValues[0]
                : envMediumValues.length > 1
                    ? 'Multiple'
                    : 'Sequencing Data';
            const envBroad = envBroadValues.length === 1
                ? envBroadValues[0]
                : envBroadValues.length > 1
                    ? 'Multiple'
                    : `${pipelineType.toUpperCase()} Pipeline Results`;
            const envLocal = envLocalValues.length === 1
                ? envLocalValues[0]
                : envLocalValues.length > 1
                    ? 'Multiple'
                    : 'Bioinformatics Processing';

            try {
                const summarySoilData = {
                    sample_name: summarySampleName,
                    collection_date: new Date(),
                    soil_depth: 0,
                    elev: 0,
                    env_broad_scale: envBroad,
                    env_local_scale: envLocal,
                    env_medium: envMedium,
                    geo_loc_name: geoLocName,
                    lat_lon: { x: 0, y: 0 },
                    Enz_Aril: 0,
                    Enz_Beta: 0,
                    Enz_Fosf: 0,
                    metadata_description: `Run summary for ${pipelineType} pipeline run ${runId}`,
                    owner_id: ownerId
                };

                soilRecord = await soilFunctions.createSoil(summarySoilData);
                soilId = soilRecord.rows[0].soil_id;
                createdSoilIds.push(soilId);
                writeLog(`\n[SUCCESS] Run summary soil record created with ID: ${soilId}`);
            } catch (soilError) {
                writeLog(`\n[ERROR] Failed to create run summary soil record: ${soilError.message}`);
                throw new Error(`Failed to create soil record: ${soilError.message}`);
            }
        }

        const seenSampleNames = new Set([summarySampleName]);
        if (parsedMetadataRows.length > 0) {
            for (let i = 0; i < parsedMetadataRows.length; i++) {
                const soilData = parsedMetadataRows[i];
                soilData.owner_id = ownerId;

                let sampleName = soilData.sample_name || '';
                if (!sampleName) {
                    sampleName = `Pipeline_${pipelineType}_${runId}_sample_${i + 1}`;
                }
                if (seenSampleNames.has(sampleName)) {
                    sampleName = `${sampleName}_${i + 1}`;
                }
                seenSampleNames.add(sampleName);
                soilData.sample_name = sampleName;

                let existingMatchId = null;
                try {
                    const matchRes = await pool.query(
                        `SELECT soil_id
                         FROM microbrsoil_db.soil
                         WHERE sample_name = $1
                           AND owner_id = $2
                           AND metadata_description ILIKE $3
                         ORDER BY soil_id ASC
                         LIMIT 1`,
                        [sampleName, ownerId, `%${runId}%`]
                    );
                    existingMatchId = matchRes.rows[0]?.soil_id || null;
                } catch (matchError) {
                    writeLog(`\n[WARNING] Could not check existing soil for sample ${sampleName}: ${matchError.message}`);
                }

                if (existingMatchId) {
                    continue;
                }

                try {
                    soilRecord = await soilFunctions.createSoil(soilData);
                    const createdId = soilRecord.rows[0].soil_id;
                    createdSoilIds.push(createdId);
                } catch (soilError) {
                    writeLog(`\n[WARNING] Failed to create soil record for ${sampleName}: ${soilError.message}`);
                }
            }
        }

        if (createdSoilIds.length > 0) {
            writeLog(`\n[SUCCESS] Created ${createdSoilIds.length} soil records for run ${runId}`);
        }
        
        // If this is a retry, delete old alpha/sample records to prevent duplicates
        if (existingSoilId) {
            try {
                await pool.query('DELETE FROM microbrsoil_db.alpha_tests WHERE soil_id = $1', [soilId]);
                await pool.query('DELETE FROM microbrsoil_db.sample WHERE soil_id = $1', [soilId]);
                writeLog(`\n[INFO] Deleted old alpha_tests and sample records for soil_id ${soilId} (retry cleanup)`);
            } catch (deleteError) {
                writeLog(`\n[WARNING] Could not delete old records: ${deleteError.message}`);
            }
        }

        await ensureSoilOwnerId(soilId, ownerId);
        
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
                    writeLog(`\n[WARNING] Failed to process alpha diversity row: ${alphaError.message}`);
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
                    writeLog(`\n[WARNING] Failed to process taxonomy row ${index}: ${taxError.message}`);
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
                    writeLog(`\n[WARNING] Failed to process OTU row ${index}: ${otuError.message}`);
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
                    writeLog(`\n[WARNING] Failed to create sample for sequence ${sequence}: ${sampleError.message}`);
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
        writeLog(`\n[ERROR] Failed to process and store data: ${error.message}`);
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
