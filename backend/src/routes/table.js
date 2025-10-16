const express = require('express');
const router = express.Router();
const pool = require('/app/db/db');

// Get soil data for index.html and upload.html
router.get('/soil', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', material = '', location = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Add search filter
    if (search) {
      paramCount++;
      whereConditions.push(`(
        s.sample_name ILIKE $${paramCount} OR 
        s.geo_loc_name ILIKE $${paramCount} OR 
        s.env_medium ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    // Add material filter
    if (material) {
      paramCount++;
      whereConditions.push(`s.env_medium ILIKE $${paramCount}`);
      queryParams.push(`%${material}%`);
    }

    // Add location filter
    if (location) {
      paramCount++;
      whereConditions.push(`s.geo_loc_name ILIKE $${paramCount}`);
      queryParams.push(`%${location}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM microbrsoil_db.soil s
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countResult.rows[0].total);

    // Get paginated data
    paramCount++;
    queryParams.push(limit);
    paramCount++;
    queryParams.push(offset);

    const dataQuery = `
      SELECT 
        s.soil_id as id,
        s.env_medium as material,
        s.sample_name as project_name,
        s.geo_loc_name as location,
        s.created_at::date as creation_date,
        s.collection_date::date as collection_date,
        s.soil_depth,
        s.elev,
        s.env_broad_scale,
        s.env_local_scale,
        s.lat_lon,
        s.ph,
        s.soil_type,
        s.tot_org_carb,
        s.tot_nitro,
        u.user_email as owner
      FROM microbrsoil_db.soil s
      LEFT JOIN microbrsoil_db.users u ON s.owner_id = u.user_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching soil data', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch soil data',
      message: error.message
    });
  }
});

// Get unique values for filters
router.get('/soil/filters', async (req, res) => {
  try {
    const filtersQuery = `
      SELECT 
        ARRAY_AGG(DISTINCT s.env_medium) FILTER (WHERE s.env_medium IS NOT NULL) as materials,
        ARRAY_AGG(DISTINCT s.geo_loc_name) FILTER (WHERE s.geo_loc_name IS NOT NULL) as locations,
        ARRAY_AGG(DISTINCT s.soil_type) FILTER (WHERE s.soil_type IS NOT NULL) as soil_types
      FROM microbrsoil_db.soil s
    `;

    const result = await pool.query(filtersQuery);
    
    res.json({
      success: true,
      filters: {
        materials: result.rows[0].materials || [],
        locations: result.rows[0].locations || [],
        soilTypes: result.rows[0].soil_types || []
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching filter options', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch filter options',
      message: error.message
    });
  }
});

// Get detailed soil data by ID
router.get('/soil/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    const soilId = parseInt(id, 10);
    if (isNaN(soilId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid soil ID - must be a number'
      });
    }

    const query = `
      SELECT 
        s.soil_id,
        s.sample_name,
        s.collection_date,
        s.soil_depth,
        s.elev,
        s.env_broad_scale,
        s.env_local_scale,
        s.env_medium as material,
        s.geo_loc_name as location,
        s.ph,
        s.soil_type,
        s.tot_org_carb,
        s.tot_nitro,
        s.created_at,
        u.user_email as owner,
        s.lat_lon::text as lat_lon_text
      FROM microbrsoil_db.soil s
      LEFT JOIN microbrsoil_db.users u ON s.owner_id = u.user_id
      WHERE s.soil_id = $1
    `;

    const result = await pool.query(query, [soilId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Soil sample not found'
      });
    }

    // Parse lat_lon if exists
    const row = result.rows[0];
    if (row.lat_lon_text) {
      try {
        // Format is "(x,y)" - parse it
        const match = row.lat_lon_text.match(/\(([^,]+),([^)]+)\)/);
        if (match) {
          row.coordinates = {
            longitude: parseFloat(match[1]),
            latitude: parseFloat(match[2])
          };
        }
      } catch (e) {
        console.error('Error parsing coordinates:', e);
      }
    }
    delete row.lat_lon_text;

    res.json({
      success: true,
      data: row
    });

  } catch (error) {
    req.logger?.error('Error fetching soil detail', { 
      error: error.message, 
      stack: error.stack,
      soilId: req.params.id
    });
    console.error('Soil detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch soil detail',
      message: error.message
    });
  }
});

// Get user data for register.html
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Add search filter
    if (search) {
      paramCount++;
      whereConditions.push(`u.user_email ILIKE $${paramCount}`);
      queryParams.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM microbrsoil_db.users u
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countResult.rows[0].total);

    // Get paginated data (excluding password hash for security)
    paramCount++;
    queryParams.push(limit);
    paramCount++;
    queryParams.push(offset);

    const dataQuery = `
      SELECT 
        u.user_id,
        u.user_email as username,
        '********* ' as password,
        u.created_at::date as register_date,
        u.last_login_at::date as last_login,
        u.is_active,
        r.role_name
      FROM microbrsoil_db.users u
      LEFT JOIN microbrsoil_db.roles r ON u.role_id = r.role_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching users data', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users data',
      message: error.message
    });
  }
});

// Get pipeline results data
router.get('/pipeline-results', async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', user_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Add status filter
    if (status) {
      paramCount++;
      whereConditions.push(`pr.status = $${paramCount}`);
      queryParams.push(status);
    }

    // Add user filter
    if (user_id) {
      paramCount++;
      whereConditions.push(`pr.user_id = $${paramCount}`);
      queryParams.push(user_id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM microbrsoil_db.pipeline_runs pr
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countResult.rows[0].total);

    // Get paginated data
    paramCount++;
    queryParams.push(limit);
    paramCount++;
    queryParams.push(offset);

    const dataQuery = `
      SELECT 
        pr.run_id,
        pr.job_id,
        pr.status,
        pr.pipeline_type,
        pr.created_at,
        pr.started_at,
        pr.finished_at,
        u.user_email as user_email,
        pres.soil_id,
        s.sample_name as soil_sample_name
      FROM microbrsoil_db.pipeline_runs pr
      LEFT JOIN microbrsoil_db.users u ON pr.user_id = u.user_id
      LEFT JOIN microbrsoil_db.pipeline_results pres ON pr.run_id = pres.run_id
      LEFT JOIN microbrsoil_db.soil s ON pres.soil_id = s.soil_id
      ${whereClause}
      ORDER BY pr.created_at DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching pipeline results', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pipeline results',
      message: error.message
    });
  }
});

// Get statistics for dashboard
router.get('/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM microbrsoil_db.soil) as total_soil_samples,
        (SELECT COUNT(*) FROM microbrsoil_db.users WHERE is_active = true) as total_active_users,
        (SELECT COUNT(*) FROM microbrsoil_db.pipeline_runs WHERE status = 'completed') as completed_pipelines,
        (SELECT COUNT(*) FROM microbrsoil_db.pipeline_runs WHERE status = 'running') as running_pipelines,
        (SELECT COUNT(DISTINCT geo_loc_name) FROM microbrsoil_db.soil) as unique_locations
    `;

    const result = await pool.query(statsQuery);
    
    res.json({
      success: true,
      stats: result.rows[0]
    });

  } catch (error) {
    req.logger?.error('Error fetching stats', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

// Get alpha diversity tests by soil ID
router.get('/alpha/soil/:soilId', async (req, res) => {
  try {
    const { soilId } = req.params;
    
    // Validate ID
    const id = parseInt(soilId, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid soil ID - must be a number'
      });
    }

    const query = `
      SELECT 
        alpha_id,
        soil_id,
        alpha_observed,
        alpha_shannon,
        alpha_simpson,
        alpha_chao1,
        alpha_goods
      FROM microbrsoil_db.alpha_tests
      WHERE soil_id = $1
      ORDER BY alpha_id DESC
    `;

    const result = await pool.query(query, [id]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    req.logger?.error('Error fetching alpha tests for soil', { 
      error: error.message, 
      stack: error.stack,
      soilId: req.params.soilId
    });
    console.error('Alpha tests fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alpha tests',
      message: error.message
    });
  }
});

// Get all alpha diversity tests (with optional pagination)
router.get('/alpha', async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        alpha_id,
        soil_id,
        alpha_observed,
        alpha_shannon,
        alpha_simpson,
        alpha_chao1,
        alpha_goods
      FROM microbrsoil_db.alpha_tests
      ORDER BY alpha_id DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    req.logger?.error('Error fetching all alpha tests', { 
      error: error.message, 
      stack: error.stack 
    });
    console.error('Alpha tests fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alpha tests',
      message: error.message
    });
  }
});

module.exports = router;
