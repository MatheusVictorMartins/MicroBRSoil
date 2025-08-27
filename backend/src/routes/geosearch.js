const express = require('express');
const router = express.Router();
// const { getSoil } = require('/app/db/db_functions/soil_funtions'); // No longer needed - using random data
const logger = require('../utils/logger');

// Endpoint to get all soil samples for geosearch map - generates 300 random points
router.get('/', async (req, res) => {
    try {
        // Generate 300 random points instead of querying database
        const randomSamples = [];
        const sampleTypes = ['Clay', 'Sandy', 'Loam', 'Silt', 'Peat', 'Chalky'];
        const landUses = ['Agricultural', 'Forest', 'Grassland', 'Urban', 'Wetland', 'Desert'];
        const vegetationTypes = ['Crops', 'Deciduous Forest', 'Coniferous Forest', 'Grassland', 'Shrubland', 'Bare Soil'];
        const countries = ['Brazil', 'United States', 'Canada', 'Germany', 'France', 'Japan', 'Australia', 'Argentina', 'India', 'China'];

        for (let i = 1; i <= 300; i++) {
            // Generate random coordinates (global distribution)
            const latitude = (Math.random() - 0.5) * 160; // -80 to 80 degrees
            const longitude = (Math.random() - 0.5) * 360; // -180 to 180 degrees
            
            // Generate random sample data
            const sample = {
                id: i,
                sampleName: `Sample_${i.toString().padStart(4, '0')}`,
                latitude: parseFloat(latitude.toFixed(6)),
                longitude: parseFloat(longitude.toFixed(6)),
                collectionDate: new Date(2020 + Math.floor(Math.random() * 5), 
                                       Math.floor(Math.random() * 12), 
                                       Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
                soilDepth: `${Math.floor(Math.random() * 50) + 5}cm`,
                soilType: sampleTypes[Math.floor(Math.random() * sampleTypes.length)],
                soilTexture: sampleTypes[Math.floor(Math.random() * sampleTypes.length)],
                pH: parseFloat((Math.random() * 6 + 4).toFixed(2)), // pH 4-10
                elevation: Math.floor(Math.random() * 3000), // 0-3000m
                geoLocation: countries[Math.floor(Math.random() * countries.length)],
                currentLandUse: landUses[Math.floor(Math.random() * landUses.length)],
                currentVegetation: vegetationTypes[Math.floor(Math.random() * vegetationTypes.length)],
                soilHorizon: ['A', 'B', 'C', 'O'][Math.floor(Math.random() * 4)],
                totalNitrogen: parseFloat((Math.random() * 2).toFixed(3)), // 0-2%
                totalOrganicCarbon: parseFloat((Math.random() * 5).toFixed(2)), // 0-5%
                microbialBiomass: parseFloat((Math.random() * 1000).toFixed(1)), // 0-1000 mg/kg
                // Environmental context
                envBroadScale: 'terrestrial biome',
                envLocalScale: 'soil horizon',
                envMedium: 'soil',
                // Additional metadata
                description: `Randomly generated soil sample ${i}`,
                createdAt: new Date().toISOString()
            };
            
            randomSamples.push(sample);
        }

        logger.info(`Geosearch: Generated 300 random soil sample points`);

        res.json({
            success: true,
            data: randomSamples,
            total: randomSamples.length,
            message: `Generated ${randomSamples.length} random soil samples for mapping`
        });

    } catch (error) {
        logger.error('Error in geosearch endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while generating random soil samples',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Endpoint to get a specific soil sample by ID - generates random data for the requested ID
router.get('/:id', async (req, res) => {
    try {
        const soilId = parseInt(req.params.id);
        
        if (isNaN(soilId) || soilId < 1 || soilId > 300) {
            return res.status(400).json({
                success: false,
                message: 'Invalid soil sample ID. ID must be between 1 and 300.'
            });
        }

        // Generate consistent random data for the specific ID (using ID as seed for consistency)
        const sampleTypes = ['Clay', 'Sandy', 'Loam', 'Silt', 'Peat', 'Chalky'];
        const landUses = ['Agricultural', 'Forest', 'Grassland', 'Urban', 'Wetland', 'Desert'];
        const vegetationTypes = ['Crops', 'Deciduous Forest', 'Coniferous Forest', 'Grassland', 'Shrubland', 'Bare Soil'];
        const countries = ['Brazil', 'United States', 'Canada', 'Germany', 'France', 'Japan', 'Australia', 'Argentina', 'India', 'China'];
        const horizons = ['A', 'B', 'C', 'O'];

        // Use soilId as seed for consistent random values
        const seed = soilId * 12345; // Simple seed multiplication
        function seededRandom(seed) {
            const x = Math.sin(seed) * 10000;
            return x - Math.floor(x);
        }

        // Generate consistent coordinates based on ID
        const latitude = (seededRandom(seed) - 0.5) * 160; // -80 to 80 degrees
        const longitude = (seededRandom(seed + 1) - 0.5) * 360; // -180 to 180 degrees

        const detailedSample = {
            id: soilId,
            sampleName: `Sample_${soilId.toString().padStart(4, '0')}`,
            coordinates: {
                latitude: parseFloat(latitude.toFixed(6)),
                longitude: parseFloat(longitude.toFixed(6))
            },
            collectionDate: new Date(2020 + Math.floor(seededRandom(seed + 2) * 5), 
                                   Math.floor(seededRandom(seed + 3) * 12), 
                                   Math.floor(seededRandom(seed + 4) * 28) + 1).toISOString().split('T')[0],
            soilDepth: Math.floor(seededRandom(seed + 5) * 50) + 5,
            elevation: Math.floor(seededRandom(seed + 6) * 3000),
            geoLocation: countries[Math.floor(seededRandom(seed + 7) * countries.length)],
            
            // Soil properties
            soilType: sampleTypes[Math.floor(seededRandom(seed + 8) * sampleTypes.length)],
            soilTexture: sampleTypes[Math.floor(seededRandom(seed + 9) * sampleTypes.length)],
            soilHorizon: horizons[Math.floor(seededRandom(seed + 10) * horizons.length)],
            pH: parseFloat((seededRandom(seed + 11) * 6 + 4).toFixed(2)), // pH 4-10
            totalNitrogen: parseFloat((seededRandom(seed + 12) * 2).toFixed(3)), // 0-2%
            totalOrganicCarbon: parseFloat((seededRandom(seed + 13) * 5).toFixed(2)), // 0-5%
            microbialBiomass: parseFloat((seededRandom(seed + 14) * 1000).toFixed(1)), // 0-1000 mg/kg
            
            // Environmental context
            envBroadScale: 'terrestrial biome',
            envLocalScale: 'soil horizon',
            envMedium: 'soil',
            currentLandUse: landUses[Math.floor(seededRandom(seed + 15) * landUses.length)],
            currentVegetation: vegetationTypes[Math.floor(seededRandom(seed + 16) * vegetationTypes.length)],
            
            // Agricultural/management data (generated values)
            cropRotation: seededRandom(seed + 17) > 0.5 ? 'Yes' : 'No',
            tillage: ['Conventional', 'Reduced', 'No-till'][Math.floor(seededRandom(seed + 18) * 3)],
            previousLandUse: landUses[Math.floor(seededRandom(seed + 19) * landUses.length)],
            agrochemAddition: seededRandom(seed + 20) > 0.3 ? 'Yes' : 'No',
            
            // Enzyme activities (random values)
            enzymeAril: parseFloat((seededRandom(seed + 21) * 100).toFixed(2)),
            enzymeBeta: parseFloat((seededRandom(seed + 22) * 50).toFixed(2)),
            enzymeFosf: parseFloat((seededRandom(seed + 23) * 75).toFixed(2)),
            
            // Environmental factors
            aluminumSaturation: parseFloat((seededRandom(seed + 24) * 100).toFixed(1)),
            altitude: Math.floor(seededRandom(seed + 25) * 3000),
            annualPrecipitation: Math.floor(seededRandom(seed + 26) * 2000 + 200), // 200-2200mm
            annualTemperature: parseFloat((seededRandom(seed + 27) * 30 + 5).toFixed(1)), // 5-35°C
            extremeEvent: seededRandom(seed + 28) > 0.8 ? 'Yes' : 'No',
            fire: seededRandom(seed + 29) > 0.9 ? 'Yes' : 'No',
            flooding: seededRandom(seed + 30) > 0.85 ? 'Yes' : 'No',
            heavyMetals: seededRandom(seed + 31) > 0.7 ? 'Detected' : 'Not detected',
            
            // Classification
            faoClass: `FAO_${Math.floor(seededRandom(seed + 32) * 20) + 1}`,
            localClass: `Local_${Math.floor(seededRandom(seed + 33) * 15) + 1}`,
            
            // Metadata
            description: `Randomly generated detailed soil sample ${soilId} with consistent properties`,
            ownerId: Math.floor(seededRandom(seed + 34) * 100) + 1,
            createdAt: new Date().toISOString()
        };

        logger.info(`Geosearch: Generated detailed data for random soil sample ${soilId}`);

        res.json({
            success: true,
            data: detailedSample
        });

    } catch (error) {
        logger.error(`Error generating soil sample ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while generating soil sample details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;