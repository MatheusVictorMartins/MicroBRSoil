const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const writeLog = require('../log_files/log_handler');
const roleFuntions = require('../db_functions/role_funcions');
const userFuntions = require('../db_functions/user_functions');
const soilFunctions = require('../db_functions/soil_funtions');
const sampleFuntions = require('../db_functions/sample_funtion');
const alphaFunctions = require('../db_functions/alpha_functions');
const fileFunctions = require('../db_functions/file_paths_functions');

// Data extractor
// Pass the folder path and file names
// Async, do not forget to await promises
const dataExtractor = async (folderPath, tableName) => {
    const results = [];
    return new Promise((resolve, reject) => {// CSV reader is async so it needs a promise
        fs.createReadStream((path.join(folderPath, tableName)))
            .on('error', (err) => {
                writeLog(`\nError BEFORE reading CSV ${tableName} in folder ${folderPath}\nerror: ` + err);
            })
            .pipe(csv({
                mapValues: ({ header, index, value }) => (value === 'NA' || value === '' ?  null : value),// N/A values become null
                mapHeaders: ({ header, index }) => (header === '' ? 'sequence' : header).toLowerCase(),// headers lowercase; empty headers become 'sequence' because two files have no sequence header
            })// the line above breaks the alpha table by adding a blank column; handled in dataFormater
                .on('data', (data) => {//redrum
                    Object.keys(data).forEach((key) => {//redrum
                        if (!Number.isNaN(Number(data[key])) && data[key] != null) {//redrum
                            data[key] = Number(data[key]);//redrum
                        }//redrum
                    });//redrum
                    results.push(data);//redrum
                })//redrum
                .on('end', () => {
                    resolve(results);
                })
                .on('error', (err) => {
                    writeLog(`\nError DURING CSV read: ${tableName} in folder: ${folderPath}\nerror: ` + err);
                    reject(err);
                })
            );

    });
};

// Formatter
// Places results into the respective arrays
const dataFormater = async (tax, alpha, otu, metadata) => {
    try {
        let resultObj = [];// stores all data in an organized object array
        let resultArray = [];// stores arrays (without keys) sequentially to ease DB insertion
        let taxArray = [];
        let alphaArray = [];
        let otuArray = [];
        let metaArray = [];

        tax.forEach(element => {
            resultObj.push(element);
            resultArray.push(Object.values(element));
            taxArray.push(Object.values(element));
        });

        alpha.forEach(element => {// handles the bug generated in dataExtractor
            delete element.sequence;
            resultObj.push(element);
            resultArray.push(Object.values(element));
            alphaArray.push(Object.values(element));
        });

        for (let i = 0; i < resultObj.length - 2; i++) {
            resultObj[i].otuTest1 = otu[i].test1;
            resultObj[i].otuTest2 = otu[i].test2;
            resultArray.push([resultObj[i].otuTest1, resultObj[i].otuTest2]);
            otuArray.push([resultObj[i].otuTest1, resultObj[i].otuTest2]);
        }

        metadata.forEach(element => {
            const splitLatLon = (element.lat_lon).split(" ");
            element.lat_lon = [Number(splitLatLon[0]), Number(splitLatLon[2])];
            Object.keys(element).forEach((key)=>{
                if(typeof(element[key]) === 'string'){
                    element[key] = element[key].replace(/\./g, '').replace(',', '.');
                    if(!Number.isNaN(Number(element[key]))){
                        element[key] = Number(element[key]); 
                    }
                }
            });
            resultObj.push(element);
            resultArray.push(Object.values(element));
            metaArray.push(Object.values(element));
        });

        return [resultObj, resultArray, taxArray, alphaArray, otuArray, metaArray];
    } catch (err) {
        writeLog("\n[ERROR]\nerror message: " + err);
        return false;
    }

}

// const workplace = async (folder) => {// FOR TESTING PURPOSES
//     const [tax, otu, alpha, metadata] = await Promise.all([
//         dataExtractor(folder, 'taxonomy_table.csv'),
//         dataExtractor(folder, 'otu_table.csv'),
//         dataExtractor(folder, 'alpha_diversity_metrics.csv'),
//         dataExtractor(folder, 'METADATAFONTEKV2025.xlsx - MIMARKS.survey.soil.6.0.csv')
//     ]);

//     const [resultObj, resultArray, taxArray, alphaArray, otuArray, metaArray] = await dataFormater(tax, alpha, otu, metadata);
//     //const roleResp = await roleFuntions.createRole({name:"z", description:"Test Description"});
//     //const userResp = await userFuntions.createUser({email: "zzzzzzzzzzzzzzzz", password: "qweqweqwe", role: 5});
//     //const soilResp = await soilFunctions.createSoil({ metadataArray: metaArray[0], id: 7 });

//     // const fileResp = await fileFunctions.createInputPath({inputPath: folder, soilId: 26});

//     taxArray.forEach(async (element, index) => {
//         const sampleResp = await sampleFuntions.createSample({ id: 29, taxArray: element, otuArray: otuArray[index] });
//     });

//     // alphaArray.forEach(async (element) => {
//     //     const alphaResp = await alphaFunctions.createAlpha({ id: soilResp.rows[0].soil_id, alphaArray: element });
//     // });

//     // await fileFunctions.updatePaths({outputPath: folder,id: 1});
//     // await fileFunctions.getPathsById({id: 1});
//     // await fileFunctions.getPathsBySoil({soilId: 26});

//     // await roleFuntions.deleteRole(6);
//     // await roleFuntions.getRole();
//     // await userFuntions.getUser();
//     // await soilFunctions.getSoil();
//     // await sampleFuntions.getSample();
//     // await alphaFunctions.getAlpha();
// }




// workplace("D:/utfpr - atual/CRUD/TESTING FOLDER/MicroBRSoil/mock_results_csv");//PARA FINS DE TESTE

// Export functions for use in other modules
module.exports = {
    dataExtractor,
    dataFormater
};
