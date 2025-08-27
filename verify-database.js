const roleFuntions = require('./db/db_functions/role_funcions');
const userFuntions = require('./db/db_functions/user_functions');
const soilFunctions = require('./db/db_functions/soil_funtions');
const sampleFuntions = require('./db/db_functions/sample_funtion');
const alphaFunctions = require('./db/db_functions/alpha_functions');
const fileFunctions = require('./db/db_functions/file_paths_functions');

// Function to query and display database contents
const queryDatabase = async () => {
    try {
        console.log('=== DATABASE CONTENTS VERIFICATION ===\n');
        
        // Get all roles
        console.log('📋 ROLES:');
        console.log('-------');
        const roles = await roleFuntions.getRole();
        if (roles.rows && roles.rows.length > 0) {
            roles.rows.forEach((role, index) => {
                console.log(`${index + 1}. ID: ${role.role_id} | Name: "${role.role_name}" | Description: "${role.description}"`);
            });
        } else {
            console.log('No roles found in database');
        }
        
        // Get all users
        console.log('\n👥 USERS:');
        console.log('--------');
        const users = await userFuntions.getUser();
        if (users.rows && users.rows.length > 0) {
            users.rows.forEach((user, index) => {
                console.log(`${index + 1}. ID: ${user.user_id} | Email: "${user.user_email}" | Role ID: ${user.role_id} | Active: ${user.is_active}`);
            });
        } else {
            console.log('No users found in database');
        }
        
        // Get all soil records
        console.log('\n🌱 SOIL SAMPLES:');
        console.log('---------------');
        const soils = await soilFunctions.getSoil();
        if (soils.rows && soils.rows.length > 0) {
            soils.rows.forEach((soil, index) => {
                console.log(`${index + 1}. ID: ${soil.soil_id} | Sample: "${soil.sample_name}" | Location: "${soil.geo_loc_name}" | Owner: ${soil.owner_id}`);
                console.log(`    Coordinates: ${soil.lat_lon} | pH: ${soil.ph} | Depth: ${soil.soil_depth}cm`);
            });
        } else {
            console.log('No soil samples found in database');
        }
        
        // Get sample count per soil
        console.log('\n🧬 SAMPLES (Taxonomy + OTU):');
        console.log('---------------------------');
        const samples = await sampleFuntions.getSample();
        if (samples.rows && samples.rows.length > 0) {
            console.log(`Total samples: ${samples.rows.length}`);
            
            // Group by soil_id
            const samplesBySoil = samples.rows.reduce((acc, sample) => {
                if (!acc[sample.soil_id]) acc[sample.soil_id] = [];
                acc[sample.soil_id].push(sample);
                return acc;
            }, {});
            
            Object.keys(samplesBySoil).forEach(soilId => {
                const soilSamples = samplesBySoil[soilId];
                console.log(`\nSoil ID ${soilId}: ${soilSamples.length} samples`);
                soilSamples.slice(0, 3).forEach((sample, index) => {
                    console.log(`  ${index + 1}. Sample ID: ${sample.sample_id} | Genus: "${sample.tax_genus}" | Species: "${sample.tax_species}"`);
                    console.log(`     OTU Test1: ${sample.otu_test1} | OTU Test2: ${sample.otu_test2}`);
                });
                if (soilSamples.length > 3) {
                    console.log(`  ... and ${soilSamples.length - 3} more samples`);
                }
            });
        } else {
            console.log('No samples found in database');
        }
        
        // Get alpha diversity records
        console.log('\n📊 ALPHA DIVERSITY:');
        console.log('------------------');
        const alphas = await alphaFunctions.getAlpha();
        if (alphas.rows && alphas.rows.length > 0) {
            alphas.rows.forEach((alpha, index) => {
                console.log(`${index + 1}. ID: ${alpha.alpha_id} | Soil ID: ${alpha.soil_id}`);
                console.log(`    Shannon: ${alpha.alpha_shannon} | Simpson: ${alpha.alpha_simpson} | Observed: ${alpha.alpha_observed}`);
                console.log(`    Chao1: ${alpha.alpha_chao1} | Goods: ${alpha.alpha_goods}`);
            });
        } else {
            console.log('No alpha diversity records found in database');
        }
        
        // Try to get file paths (this might need specific IDs)
        console.log('\n📁 FILE PATHS:');
        console.log('-------------');
        try {
            // Try to get paths for each soil
            if (soils.rows && soils.rows.length > 0) {
                for (const soil of soils.rows) {
                    try {
                        const filePaths = await fileFunctions.getPathsBySoil({soilId: soil.soil_id});
                        if (filePaths.rows && filePaths.rows.length > 0) {
                            filePaths.rows.forEach((fp, index) => {
                                console.log(`${index + 1}. Path ID: ${fp.path_id} | Soil ID: ${fp.soil_id}`);
                                console.log(`    Input: "${fp.input_path}"`);
                                console.log(`    Output: "${fp.output_path || 'Not set'}"`);
                            });
                        }
                    } catch (err) {
                        // Skip if no paths found for this soil
                    }
                }
            } else {
                console.log('No file paths found in database');
            }
        } catch (error) {
            console.log('Could not retrieve file paths');
        }
        
        console.log('\n=== VERIFICATION COMPLETED ===');
        
    } catch (error) {
        console.error('❌ Error querying database:', error.message);
        console.error('Stack trace:', error.stack);
    }
};

// Run if called directly
if (require.main === module) {
    queryDatabase()
        .then(() => {
            console.log('\nDatabase query completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Database query failed:', error);
            process.exit(1);
        });
}

module.exports = { queryDatabase };
