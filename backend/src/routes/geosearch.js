const express = require('express');
const router = express.Router();
const { getSoil } = require('/app/db/db_functions/soil_funtions');
const { apiLogger } = require('../utils/logger');

// Endpoint to get all soil samples for geosearch map
router.get('/', async (req, res) => {
    try {
        console.log("GOOD MORNING");
        // Get all soil samples from the database
        const soilData = await getSoil(0); // 0 means get all records
        console.log("GOOD MORNING");
        console.log("soilData", soilData);
        if (!soilData || !soilData.rows) {
            return res.status(404).json({
                success: false,
                message: 'No soil samples found'
            });
        }

        // Transform the data for Leaflet map consumption
        const mapData = soilData.rows.map(sample => {
            // Extract latitude and longitude from POINT data
            // PostgreSQL POINT format is typically "(lat,lon)" or parsed as object
            let latitude, longitude;
            
            if (sample.lat_lon) {
                // Handle different POINT formats from PostgreSQL
                if (typeof sample.lat_lon === 'string') {
                    // Format: "(longitude,latitude)" - PostgreSQL POINT follows (x,y) convention
                    const coords = sample.lat_lon.replace(/[()]/g, '').split(',');
                    longitude = parseFloat(coords[1]); // x = longitude
                    latitude = parseFloat(coords[0]);  // y = latitude
                } else if (sample.lat_lon.x !== undefined && sample.lat_lon.y !== undefined) {
                    // Format: {x: lon, y: lat} - PostgreSQL POINT object format
                    latitude = sample.lat_lon.x;   // y = latitude
                    longitude = sample.lat_lon.y;  // x = longitude
                } else {
                    // Fallback - try to parse as object with lat/lon properties
                    latitude = sample.lat_lon.latitude || sample.lat_lon.lat;
                    longitude = sample.lat_lon.longitude || sample.lat_lon.lon;
                }
            }

            return {
                id: sample.soil_id,
                sampleName: sample.sample_name,
                latitude: latitude,
                longitude: longitude,
                collectionDate: sample.collection_date,
                soilDepth: sample.soil_depth ? `${sample.soil_depth}cm` : 'N/A',
                soilType: sample.soil_type || 'N/A',
                soilTexture: sample.soil_text || 'N/A',
                pH: sample.ph,
                elevation: sample.elev,
                geoLocation: sample.geo_loc_name,
                currentLandUse: sample.cur_land_use,
                currentVegetation: sample.cur_vegetation,
                soilHorizon: sample.soil_horizon,
                totalNitrogen: sample.tot_nitro,
                totalOrganicCarbon: sample.tot_org_carb,
                microbialBiomass: sample.microbial_biomass,
                // Environmental context
                envBroadScale: sample.env_broad_scale,
                envLocalScale: sample.env_local_scale,
                envMedium: sample.env_medium,
                // Additional metadata
                description: sample.metadata_description,
                createdAt: sample.created_at
            };
        });

        // Filter out samples without valid coordinates
        const validSamples = mapData.filter(sample => 
            sample.latitude !== null && 
            sample.longitude !== null && 
            !isNaN(sample.latitude) && 
            !isNaN(sample.longitude)
        );

        apiLogger.info(`Geosearch: Retrieved ${validSamples.length} valid soil samples out of ${mapData.length} total samples`);

        res.json({
            success: true,
            data: validSamples,
            total: validSamples.length,
            message: `Retrieved ${validSamples.length} soil samples for mapping`
        });

    } catch (error) {
        apiLogger.error('Error in geosearch endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching soil samples',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Endpoint to get a specific soil sample by ID
router.get('/:id', async (req, res) => {
    try {
        const soilId = parseInt(req.params.id);
        
        if (isNaN(soilId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid soil sample ID'
            });
        }

        const soilData = await getSoil(soilId);
        
        if (!soilData || !soilData.rows || soilData.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Soil sample not found'
            });
        }

        const sample = soilData.rows[0];
        
        // Extract coordinates
        let latitude, longitude;
        if (sample.lat_lon) {
            if (typeof sample.lat_lon === 'string') {
                // Format: "(longitude,latitude)" - PostgreSQL POINT follows (x,y) convention
                const coords = sample.lat_lon.replace(/[()]/g, '').split(',');
                longitude = parseFloat(coords[0]); // x = longitude
                latitude = parseFloat(coords[1]);  // y = latitude
            } else if (sample.lat_lon.x !== undefined && sample.lat_lon.y !== undefined) {
                // Format: {x: lon, y: lat} - PostgreSQL POINT object format
                latitude = sample.lat_lon.y;   // y = latitude
                longitude = sample.lat_lon.x;  // x = longitude
            }
        }

        const detailedSample = {
            id: sample.soil_id,
            sampleName: sample.sample_name,
            coordinates: {
                latitude: latitude,
                longitude: longitude
            },
            collectionDate: sample.collection_date,
            soilDepth: sample.soil_depth,
            elevation: sample.elev,
            geoLocation: sample.geo_loc_name,
            
            // Soil properties
            soilType: sample.soil_type,
            soilTexture: sample.soil_text,
            soilHorizon: sample.soil_horizon,
            pH: sample.ph,
            totalNitrogen: sample.tot_nitro,
            totalOrganicCarbon: sample.tot_org_carb,
            microbialBiomass: sample.microbial_biomass,
            
            // Environmental context
            envBroadScale: sample.env_broad_scale,
            envLocalScale: sample.env_local_scale,
            envMedium: sample.env_medium,
            currentLandUse: sample.cur_land_use,
            currentVegetation: sample.cur_vegetation,
            
            // Agricultural/management data
            cropRotation: sample.crop_rotation,
            tillage: sample.tillage,
            previousLandUse: sample.previous_land_use,
            agrochemAddition: sample.agrochem_addition,
            
            // Enzyme activities
            enzymeAril: sample.Enz_Aril,
            enzymeBeta: sample.Enz_Beta,
            enzymeFosf: sample.Enz_Fosf,
            
            // Environmental factors
            aluminumSaturation: sample.al_sat,
            altitude: sample.altitude,
            annualPrecipitation: sample.annual_precpt,
            annualTemperature: sample.annual_temp,
            extremeEvent: sample.extreme_event,
            fire: sample.fire,
            flooding: sample.flooding,
            heavyMetals: sample.heavy_metals,
            
            // Classification
            faoClass: sample.fao_class,
            localClass: sample.local_class,
            
            // Metadata
            description: sample.metadata_description,
            ownerId: sample.owner_id,
            createdAt: sample.created_at
        };

        apiLogger.info(`Geosearch: Retrieved detailed data for soil sample ${soilId}`);

        res.json({
            success: true,
            data: detailedSample
        });

    } catch (error) {
        apiLogger.error(`Error retrieving soil sample ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching soil sample details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;