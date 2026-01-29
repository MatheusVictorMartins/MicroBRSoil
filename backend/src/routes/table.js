const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { paths } = require('../utils/moduleResolver');
const pool = require(paths.db());
const { ensurePipelineMetricsColumns } = require(paths.pipelineFunctions());
const { requireAuth, requireAdmin, isAdminRole } = require('../middleware/authenticate');
const { RATE_LIMIT_MESSAGES, PIPELINE_STATUS } = require('../constants');
const { createRateLimiter } = require('../middleware/rateLimit');
const { createResponseCache } = require('../middleware/responseCache');
const { decryptPassword, encryptPassword } = require('../utils/passwordView');
const bcrypt = require('bcrypt');
const isProduction = process.env.NODE_ENV === 'production';

const tableReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: RATE_LIMIT_MESSAGES.TABLE_READ
});

const tableWriteLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: RATE_LIMIT_MESSAGES.TABLE_WRITE
});

const soilListCache = createResponseCache({
  ttlMs: 30 * 1000,
  maxEntries: 200,
  keyPrefix: 'soil:list'
});

const soilFiltersCache = createResponseCache({
  ttlMs: 2 * 60 * 1000,
  maxEntries: 100,
  keyPrefix: 'soil:filters'
});

const soilDetailCache = createResponseCache({
  ttlMs: 60 * 1000,
  maxEntries: 200,
  keyPrefix: 'soil:detail'
});

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

const findUploadedMetadataName = (runId) => {
  if (!runId) return null;
  const runDir = path.join(UPLOADS_DIR, String(runId));
  if (!fs.existsSync(runDir)) return null;

  let entries = [];
  try {
    entries = fs.readdirSync(runDir);
  } catch (err) {
    return null;
  }

  const csvFiles = entries.filter((name) => name.toLowerCase().endsWith('.csv'));
  if (csvFiles.length === 0) return null;

  const metadataNamed = csvFiles.find((name) => name.toLowerCase().includes('metadata'));
  if (metadataNamed) return metadataNamed;

  let best = null;
  let bestSize = -1;
  for (const name of csvFiles) {
    const fullPath = path.join(runDir, name);
    try {
      const size = fs.statSync(fullPath).size;
      if (size > bestSize) {
        bestSize = size;
        best = name;
      }
    } catch (err) {
      // ignore stat failures
    }
  }

  return best || csvFiles[0];
};

const usersListCache = createResponseCache({
  ttlMs: 30 * 1000,
  maxEntries: 100,
  keyPrefix: 'users:list'
});

const pipelineResultsCache = createResponseCache({
  ttlMs: 30 * 1000,
  maxEntries: 200,
  keyPrefix: 'pipeline:results'
});

const statsCache = createResponseCache({
  ttlMs: 60 * 1000,
  maxEntries: 50,
  keyPrefix: 'stats'
});

const alphaCache = createResponseCache({
  ttlMs: 60 * 1000,
  maxEntries: 200,
  keyPrefix: 'alpha'
});

const samplesCache = createResponseCache({
  ttlMs: 60 * 1000,
  maxEntries: 200,
  keyPrefix: 'samples'
});

const pipelineRunsCache = createResponseCache({
  ttlMs: 30 * 1000,
  maxEntries: 200,
  keyPrefix: 'pipeline:runs'
});

const safeErrorBody = (error, fallbackMessage) => ({
  success: false,
  error: fallbackMessage,
  ...(isProduction ? {} : { message: error.message })
});

let passwordViewColumnCached = null;

async function ensurePasswordViewColumn() {
  if (passwordViewColumnCached === true) return true;
  try {
    await pool.query(
      `ALTER TABLE microbrsoil_db.users
       ADD COLUMN IF NOT EXISTS password_view TEXT`
    );
    passwordViewColumnCached = true;
    return true;
  } catch (error) {
    passwordViewColumnCached = false;
    return false;
  }
}

async function hasPasswordViewColumn() {
  if (passwordViewColumnCached !== null) return passwordViewColumnCached;
  try {
    const result = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'microbrsoil_db'
         AND table_name = 'users'
         AND column_name = 'password_view'
       LIMIT 1`
    );
    passwordViewColumnCached = result.rowCount > 0;
  } catch (error) {
    passwordViewColumnCached = false;
  }
  if (!passwordViewColumnCached) {
    await ensurePasswordViewColumn();
  }
  return passwordViewColumnCached;
}

// Get soil data for index.html and upload.html
router.get('/soil', requireAuth, tableReadLimiter, soilListCache, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', material = '', location = '', legacy = '' } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const offset = (pageNumber - 1) * limitNumber;
    const isAdmin = isAdminRole(req.user?.role);
    const useLegacy = ['1', 'true', 'yes'].includes(String(legacy).toLowerCase());

    const buildRunFilters = () => {
      let whereConditions = [];
      let queryParams = [];
      let paramCount = 0;

      if (search) {
        paramCount++;
        whereConditions.push(`(
          s.sample_name ILIKE $${paramCount} OR 
          s.geo_loc_name ILIKE $${paramCount} OR 
          s.env_medium ILIKE $${paramCount} OR
          pr.run_id::text ILIKE $${paramCount}
        )`);
        queryParams.push(`%${search}%`);
      }

      if (material) {
        paramCount++;
        whereConditions.push(`s.env_medium ILIKE $${paramCount}`);
        queryParams.push(`%${material}%`);
      }

      if (location) {
        paramCount++;
        whereConditions.push(`s.geo_loc_name ILIKE $${paramCount}`);
        queryParams.push(`%${location}%`);
      }

      if (!isAdmin) {
        paramCount++;
        whereConditions.push(`COALESCE(pr.user_id, s.owner_id) = $${paramCount}`);
        queryParams.push(req.user.id);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      return { whereClause, queryParams, paramCount };
    };

    const buildSoilFilters = () => {
      let whereConditions = [];
      let queryParams = [];
      let paramCount = 0;

      if (search) {
        paramCount++;
        whereConditions.push(`(
          s.sample_name ILIKE $${paramCount} OR 
          s.geo_loc_name ILIKE $${paramCount} OR 
          s.env_medium ILIKE $${paramCount}
        )`);
        queryParams.push(`%${search}%`);
      }

      if (material) {
        paramCount++;
        whereConditions.push(`s.env_medium ILIKE $${paramCount}`);
        queryParams.push(`%${material}%`);
      }

      if (location) {
        paramCount++;
        whereConditions.push(`s.geo_loc_name ILIKE $${paramCount}`);
        queryParams.push(`%${location}%`);
      }

      if (!isAdmin) {
        paramCount++;
        whereConditions.push(`s.owner_id = $${paramCount}`);
        queryParams.push(req.user.id);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      return { whereClause, queryParams, paramCount };
    };

    const runFilters = buildRunFilters();
    const runCountQuery = `
      SELECT COUNT(*) as total
      FROM microbrsoil_db.pipeline_results pres
      JOIN microbrsoil_db.pipeline_runs pr ON pr.run_id = pres.run_id
      JOIN microbrsoil_db.soil s ON s.soil_id = pres.soil_id
      ${runFilters.whereClause}
    `;

    const runCountResult = await pool.query(runCountQuery, runFilters.queryParams);
    const runTotalRecords = parseInt(runCountResult.rows[0].total, 10) || 0;

    if (runTotalRecords > 0) {
      runFilters.paramCount++;
      runFilters.queryParams.push(limitNumber);
      runFilters.paramCount++;
      runFilters.queryParams.push(offset);

      const dataQuery = `
        SELECT 
          s.soil_id as id,
          s.env_medium as material,
          s.sample_name as project_name,
          s.geo_loc_name as location,
          pr.created_at::date as creation_date,
          u.user_email as owner,
          pr.run_id as run_id
        FROM microbrsoil_db.pipeline_results pres
        JOIN microbrsoil_db.pipeline_runs pr ON pr.run_id = pres.run_id
        JOIN microbrsoil_db.soil s ON s.soil_id = pres.soil_id
        LEFT JOIN microbrsoil_db.users u ON u.user_id = COALESCE(pr.user_id, s.owner_id)
        ${runFilters.whereClause}
        ORDER BY pr.created_at DESC
        LIMIT $${runFilters.paramCount - 1} OFFSET $${runFilters.paramCount}
      `;

      const dataResult = await pool.query(dataQuery, runFilters.queryParams);
      const rows = dataResult.rows.map((row) => {
        const metadataName = findUploadedMetadataName(row.run_id);
        const fallbackName = row.project_name || `Run ${String(row.run_id).slice(0, 8)}`;
        return {
          ...row,
          project_name: metadataName || fallbackName
        };
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          currentPage: pageNumber,
          totalPages: Math.ceil(runTotalRecords / limitNumber),
          totalRecords: runTotalRecords,
          limit: limitNumber
        }
      });
      return;
    }

    if (!useLegacy) {
      res.json({
        success: true,
        data: [],
        pagination: {
          currentPage: pageNumber,
          totalPages: 0,
          totalRecords: 0,
          limit: limitNumber
        }
      });
      return;
    }

    const soilFilters = buildSoilFilters();
    const soilCountQuery = `
      SELECT COUNT(*) as total
      FROM microbrsoil_db.soil s
      ${soilFilters.whereClause}
    `;

    const soilCountResult = await pool.query(soilCountQuery, soilFilters.queryParams);
    const soilTotalRecords = parseInt(soilCountResult.rows[0].total, 10) || 0;

    soilFilters.paramCount++;
    soilFilters.queryParams.push(limitNumber);
    soilFilters.paramCount++;
    soilFilters.queryParams.push(offset);

    const soilDataQuery = `
      SELECT 
        s.soil_id as id,
        s.env_medium as material,
        s.sample_name as project_name,
        s.geo_loc_name as location,
        s.created_at::date as creation_date,
        u.user_email as owner
      FROM microbrsoil_db.soil s
      LEFT JOIN microbrsoil_db.users u ON s.owner_id = u.user_id
      ${soilFilters.whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${soilFilters.paramCount - 1} OFFSET $${soilFilters.paramCount}
    `;

    const soilDataResult = await pool.query(soilDataQuery, soilFilters.queryParams);

    res.json({
      success: true,
      data: soilDataResult.rows,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(soilTotalRecords / limitNumber),
        totalRecords: soilTotalRecords,
        limit: limitNumber
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching soil data', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json(safeErrorBody(error, 'Failed to fetch soil data'));
  }
});

// Get unique values for filters
router.get('/soil/filters', requireAuth, tableReadLimiter, soilFiltersCache, async (req, res) => {
  try {
    const legacy = String(req.query.legacy || '').toLowerCase();
    const useLegacy = ['1', 'true', 'yes'].includes(legacy);
    const isAdmin = isAdminRole(req.user?.role);
    const queryParams = [];
    const whereConditions = [];
    if (!isAdmin) {
      whereConditions.push('COALESCE(pr.user_id, s.owner_id) = $1');
      queryParams.push(req.user.id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const runCountQuery = `
      SELECT COUNT(*) as total
      FROM microbrsoil_db.pipeline_results pres
      JOIN microbrsoil_db.pipeline_runs pr ON pr.run_id = pres.run_id
      JOIN microbrsoil_db.soil s ON s.soil_id = pres.soil_id
      ${whereClause}
    `;

    const runCountResult = await pool.query(runCountQuery, queryParams);
    const runTotal = parseInt(runCountResult.rows[0]?.total || 0, 10);

    let result;
    if (runTotal > 0) {
      const filtersQuery = `
        SELECT 
          ARRAY_AGG(DISTINCT s.env_medium) FILTER (WHERE s.env_medium IS NOT NULL) as materials,
          ARRAY_AGG(DISTINCT s.geo_loc_name) FILTER (WHERE s.geo_loc_name IS NOT NULL) as locations,
          ARRAY_AGG(DISTINCT s.soil_type) FILTER (WHERE s.soil_type IS NOT NULL) as soil_types
        FROM microbrsoil_db.pipeline_results pres
        JOIN microbrsoil_db.pipeline_runs pr ON pr.run_id = pres.run_id
        JOIN microbrsoil_db.soil s ON s.soil_id = pres.soil_id
        ${whereClause}
      `;
      result = await pool.query(filtersQuery, queryParams);
    } else if (useLegacy) {
      const soilQueryParams = [];
      const soilWhereConditions = [];
      if (!isAdmin) {
        soilWhereConditions.push('s.owner_id = $1');
        soilQueryParams.push(req.user.id);
      }
      const soilWhereClause = soilWhereConditions.length > 0 ? `WHERE ${soilWhereConditions.join(' AND ')}` : '';
      const filtersQuery = `
        SELECT 
          ARRAY_AGG(DISTINCT s.env_medium) FILTER (WHERE s.env_medium IS NOT NULL) as materials,
          ARRAY_AGG(DISTINCT s.geo_loc_name) FILTER (WHERE s.geo_loc_name IS NOT NULL) as locations,
          ARRAY_AGG(DISTINCT s.soil_type) FILTER (WHERE s.soil_type IS NOT NULL) as soil_types
        FROM microbrsoil_db.soil s
        ${soilWhereClause}
      `;
      result = await pool.query(filtersQuery, soilQueryParams);
    } else {
      result = { rows: [] };
    }
    
    const row = result?.rows?.[0] || {};
    res.json({
      success: true,
      filters: {
        materials: row.materials || [],
        locations: row.locations || [],
        soilTypes: row.soil_types || []
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching filter options', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json(safeErrorBody(error, 'Failed to fetch filter options'));
  }
});

// Get detailed soil data by ID
router.get('/soil/:id', requireAuth, tableReadLimiter, soilDetailCache, async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = isAdminRole(req.user?.role);

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
      ${isAdmin ? '' : 'AND s.owner_id = $2'}
    `;

    const params = isAdmin ? [soilId] : [soilId, req.user.id];
    const result = await pool.query(query, params);

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
    res.status(500).json(safeErrorBody(error, 'Failed to fetch soil detail'));
  }
});

// Delete soil data by ID (admin only)
router.delete('/soil/:id', requireAdmin, tableWriteLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const soilId = parseInt(id, 10);

    if (isNaN(soilId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid soil ID - must be a number'
      });
    }

    const ownerRes = await pool.query(
      'SELECT owner_id FROM microbrsoil_db.soil WHERE soil_id = $1',
      [soilId]
    );
    if (ownerRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Soil sample not found' });
    }

    const ownerId = ownerRes.rows[0].owner_id;
    const runRes = await pool.query(
      'SELECT run_id FROM microbrsoil_db.pipeline_results WHERE soil_id = $1',
      [soilId]
    );
    const runId = runRes.rows[0]?.run_id || null;

    let deleted = [];
    if (runId) {
      const deleteResult = await pool.query(
        `DELETE FROM microbrsoil_db.soil
         WHERE owner_id = $1
           AND (soil_id = $2 OR metadata_description ILIKE $3)
         RETURNING soil_id`,
        [ownerId, soilId, `%${runId}%`]
      );
      deleted = deleteResult.rows;
    } else {
      const deleteResult = await pool.query(
        'DELETE FROM microbrsoil_db.soil WHERE soil_id = $1 RETURNING soil_id',
        [soilId]
      );
      deleted = deleteResult.rows;
    }

    if (!deleted.length) {
      return res.status(404).json({ success: false, error: 'Soil sample not found' });
    }

    return res.json({ success: true, deleted, count: deleted.length });
  } catch (error) {
    req.logger?.error('Error deleting soil', {
      error: error.message,
      stack: error.stack,
      soilId: req.params.id
    });
    res.status(500).json(safeErrorBody(error, 'Failed to delete soil sample'));
  }
});

// Get user data for register.html
router.get('/users', requireAdmin, tableReadLimiter, usersListCache, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const offset = (pageNumber - 1) * limitNumber;

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
    const totalRecords = parseInt(countResult.rows[0].total, 10) || 0;

    // Get paginated data (excluding password hash for security)
    paramCount++;
    queryParams.push(limitNumber);
    paramCount++;
    queryParams.push(offset);

    const includePasswordView = await hasPasswordViewColumn();
    const passwordSelect = includePasswordView ? 'u.password_view' : "NULL as password_view";

    const dataQuery = `
      SELECT 
        u.user_id,
        u.user_email as username,
        ${passwordSelect},
        u.created_at::date as register_date,
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
      data: dataResult.rows.map((user) => {
        const decrypted = user.password_view ? decryptPassword(user.password_view) : null;
        return {
          ...user,
          password: decrypted || '',
          password_view: undefined
        };
      }),
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalRecords / limitNumber),
        totalRecords,
        limit: limitNumber
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching users data', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json(safeErrorBody(error, 'Failed to fetch users data'));
  }
});

// Update user password (admin only, non-admin users)
router.put('/users/:id/password', requireAdmin, tableWriteLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const { password } = req.body || {};

    if (Number.isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
    }

    const userLookup = await pool.query(
      `SELECT u.user_id, u.user_email, u.role_id, r.role_name
       FROM microbrsoil_db.users u
       LEFT JOIN microbrsoil_db.roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [userId]
    );

    if (userLookup.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const target = userLookup.rows[0];
    const roleName = String(target.role_name || '').toLowerCase();
    const isAdminTarget = roleName === 'admin' || String(target.role_id) === '1';
    const isSystemTarget = String(target.user_email || '').toLowerCase() === 'system@microbrsoil.local';

    if (isAdminTarget || isSystemTarget) {
      return res.status(403).json({ success: false, error: 'Cannot update admin/system user password' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const passwordView = encryptPassword(password);
    const canStoreView = await ensurePasswordViewColumn();

    let updateQuery = 'UPDATE microbrsoil_db.users SET password_hash = $1 WHERE user_id = $2 RETURNING user_id, user_email';
    let updateValues = [passwordHash, userId];

    if (canStoreView) {
      updateQuery = 'UPDATE microbrsoil_db.users SET password_hash = $1, password_view = $2 WHERE user_id = $3 RETURNING user_id, user_email';
      updateValues = [passwordHash, passwordView, userId];
    }

    const result = await pool.query(updateQuery, updateValues);
    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    req.logger?.error('Error updating user password', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json(safeErrorBody(error, 'Failed to update user password'));
  }
});

// Delete user (admin only, non-admin users)
router.delete('/users/:id', requireAdmin, tableWriteLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    if (Number.isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    if (String(req.user?.id) === String(userId)) {
      return res.status(403).json({ success: false, error: 'Cannot delete current admin user' });
    }

    const userLookup = await pool.query(
      `SELECT u.user_id, u.user_email, u.role_id, r.role_name
       FROM microbrsoil_db.users u
       LEFT JOIN microbrsoil_db.roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [userId]
    );

    if (userLookup.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const target = userLookup.rows[0];
    const roleName = String(target.role_name || '').toLowerCase();
    const isAdminTarget = roleName === 'admin' || String(target.role_id) === '1';
    const isSystemTarget = String(target.user_email || '').toLowerCase() === 'system@microbrsoil.local';

    if (isAdminTarget || isSystemTarget) {
      return res.status(403).json({ success: false, error: 'Cannot delete admin/system user' });
    }

    const result = await pool.query(
      'DELETE FROM microbrsoil_db.users WHERE user_id = $1 RETURNING user_id, user_email',
      [userId]
    );

    return res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    req.logger?.error('Error deleting user', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json(safeErrorBody(error, 'Failed to delete user'));
  }
});

// Get pipeline results data
router.get('/pipeline-results', requireAuth, tableReadLimiter, pipelineResultsCache, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', user_id = '', user = '', from = '', to = '', sort = '', order = '' } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const offset = (pageNumber - 1) * limitNumber;
    const isAdmin = isAdminRole(req.user?.role);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    const rawStatus = typeof status === 'string' ? status.trim() : '';
    const statusFilter = rawStatus === 'all' ? '' : rawStatus;
    const userIdFilter = isAdmin ? String(user_id || '').trim() : String(req.user?.id || '').trim();
    const userEmailFilter = isAdmin ? String(user || '').trim() : '';
    const fromDate = typeof from === 'string' ? from.trim() : '';
    const toDate = typeof to === 'string' ? to.trim() : '';
    const sortBy = typeof sort === 'string' ? sort.toLowerCase().trim() : '';
    const sortOrder = typeof order === 'string' ? order.toLowerCase().trim() : '';

    if (statusFilter) {
      if (statusFilter === 'active') {
        whereConditions.push(`pr.status NOT IN ('completed', 'failed')`);
      } else {
        paramCount++;
        whereConditions.push(`pr.status = $${paramCount}`);
        queryParams.push(statusFilter);
      }
    }

    if (userIdFilter) {
      const parsedUserId = parseInt(userIdFilter, 10);
      if (Number.isNaN(parsedUserId)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
      }
      paramCount++;
      whereConditions.push(`pr.user_id = $${paramCount}`);
      queryParams.push(parsedUserId);
    }

    if (userEmailFilter) {
      paramCount++;
      whereConditions.push(`u.user_email ILIKE $${paramCount}`);
      queryParams.push(`%${userEmailFilter}%`);
    }

    if (fromDate) {
      paramCount++;
      whereConditions.push(`pr.created_at >= $${paramCount}::date`);
      queryParams.push(fromDate);
    }

    if (toDate) {
      paramCount++;
      whereConditions.push(`pr.created_at < ($${paramCount}::date + interval '1 day')`);
      queryParams.push(toDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const userJoin = 'LEFT JOIN microbrsoil_db.users u ON pr.user_id = u.user_id';
    const sortMap = {
      created_at: 'pr.created_at',
      status: 'pr.status',
      user: 'u.user_email',
      pipeline: 'pr.pipeline_type'
    };
    const sortColumn = sortMap[sortBy] || 'pr.created_at';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const nullsClause = sortColumn === 'u.user_email' ? 'NULLS LAST' : '';

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM microbrsoil_db.pipeline_runs pr
      ${userJoin}
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countResult.rows[0].total, 10) || 0;

    // Get paginated data
    paramCount++;
    queryParams.push(limitNumber);
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
      ${userJoin}
      LEFT JOIN microbrsoil_db.pipeline_results pres ON pr.run_id = pres.run_id
      LEFT JOIN microbrsoil_db.soil s ON pres.soil_id = s.soil_id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection} ${nullsClause}
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalRecords / limitNumber),
        totalRecords,
        limit: limitNumber
      }
    });

  } catch (error) {
    req.logger?.error('Error fetching pipeline results', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json(safeErrorBody(error, 'Failed to fetch pipeline results'));
  }
});

// Get statistics for dashboard
router.get('/stats', requireAuth, tableReadLimiter, statsCache, async (req, res) => {
  try {
    const ensured = await ensurePipelineMetricsColumns();
    if (!ensured) {
      return res.status(500).json(safeErrorBody(new Error('pipeline_runs metrics columns missing'), 'Failed to fetch statistics'));
    }
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM microbrsoil_db.soil) as total_soil_samples,
        (SELECT COUNT(*) FROM microbrsoil_db.users WHERE is_active = true) as total_active_users,
        (SELECT COUNT(*) FROM microbrsoil_db.pipeline_runs WHERE status = '${PIPELINE_STATUS.COMPLETED}') as completed_pipelines,
        (SELECT COUNT(*) FROM microbrsoil_db.pipeline_runs WHERE status = '${PIPELINE_STATUS.RUNNING}') as running_pipelines,
        (SELECT COUNT(*) FROM microbrsoil_db.pipeline_runs WHERE status = '${PIPELINE_STATUS.QUEUED}') as queued_pipelines,
        (SELECT COUNT(*) FROM microbrsoil_db.pipeline_runs WHERE status = '${PIPELINE_STATUS.FAILED}') as failed_pipelines,
        (SELECT COALESCE(AVG(duration_ms), 0)::BIGINT FROM microbrsoil_db.pipeline_runs WHERE duration_ms IS NOT NULL) as avg_pipeline_duration_ms,
        (SELECT COALESCE(MAX(duration_ms), 0)::BIGINT FROM microbrsoil_db.pipeline_runs WHERE duration_ms IS NOT NULL) as max_pipeline_duration_ms,
        (SELECT COALESCE(SUM(upload_size_bytes), 0)::BIGINT FROM microbrsoil_db.pipeline_runs WHERE upload_size_bytes IS NOT NULL) as total_upload_bytes,
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
    res.status(500).json(safeErrorBody(error, 'Failed to fetch statistics'));
  }
});

// Get alpha diversity tests by soil ID
router.get('/alpha/soil/:soilId', requireAuth, tableReadLimiter, alphaCache, async (req, res) => {
  try {
    const { soilId } = req.params;
    const isAdmin = isAdminRole(req.user?.role);
    
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
        alpha_tests.alpha_id,
        alpha_tests.soil_id,
        alpha_tests.alpha_observed,
        alpha_tests.alpha_shannon,
        alpha_tests.alpha_simpson,
        alpha_tests.alpha_chao1,
        alpha_tests.alpha_goods
      FROM microbrsoil_db.alpha_tests
      ${isAdmin ? '' : 'JOIN microbrsoil_db.soil s ON alpha_tests.soil_id = s.soil_id'}
      WHERE alpha_tests.soil_id = $1
      ${isAdmin ? '' : 'AND s.owner_id = $2'}
      ORDER BY alpha_tests.alpha_id DESC
    `;

    const params = isAdmin ? [id] : [id, req.user.id];
    const result = await pool.query(query, params);

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
    res.status(500).json(safeErrorBody(error, 'Failed to fetch alpha tests'));
  }
});

// Get all alpha diversity tests (with optional pagination)
router.get('/alpha', requireAuth, tableReadLimiter, alphaCache, async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
    const offset = (pageNumber - 1) * limitNumber;
    const isAdmin = isAdminRole(req.user?.role);

    const query = `
      SELECT 
        alpha_tests.alpha_id,
        alpha_tests.soil_id,
        alpha_tests.alpha_observed,
        alpha_tests.alpha_shannon,
        alpha_tests.alpha_simpson,
        alpha_tests.alpha_chao1,
        alpha_tests.alpha_goods
      FROM microbrsoil_db.alpha_tests
      ${isAdmin ? '' : 'JOIN microbrsoil_db.soil s ON alpha_tests.soil_id = s.soil_id'}
      ${isAdmin ? '' : 'WHERE s.owner_id = $3'}
      ORDER BY alpha_tests.alpha_id DESC
      LIMIT $1 OFFSET $2
    `;

    const params = isAdmin ? [limitNumber, offset] : [limitNumber, offset, req.user.id];
    const result = await pool.query(query, params);

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
    res.status(500).json(safeErrorBody(error, 'Failed to fetch alpha tests'));
  }
});

// Get samples by soil ID
router.get('/samples/soil/:soilId', requireAuth, tableReadLimiter, samplesCache, async (req, res) => {
  try {
    const { soilId } = req.params;
    const isAdmin = isAdminRole(req.user?.role);
    
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
        sample.sample_id,
        sample.soil_id,
        sample.plant_sequence,
        sample.tax_kingdom,
        sample.tax_phylum,
        sample.tax_class,
        sample.tax_order,
        sample.tax_family,
        sample.tax_genus,
        sample.tax_species,
        sample.otu_test1,
        sample.otu_test2
      FROM microbrsoil_db.sample
      ${isAdmin ? '' : 'JOIN microbrsoil_db.soil s ON sample.soil_id = s.soil_id'}
      WHERE sample.soil_id = $1
      ${isAdmin ? '' : 'AND s.owner_id = $2'}
      ORDER BY sample.sample_id ASC
    `;

    const params = isAdmin ? [id] : [id, req.user.id];
    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    req.logger?.error('Error fetching samples for soil', { 
      error: error.message, 
      stack: error.stack,
      soilId: req.params.soilId
    });
    console.error('Samples fetch error:', error);
    res.status(500).json(safeErrorBody(error, 'Failed to fetch samples'));
  }
});

// Get pipeline runs by soil ID
router.get('/pipeline-runs/soil/:soilId', requireAuth, tableReadLimiter, pipelineRunsCache, async (req, res) => {
  try {
    const { soilId } = req.params;
    const isAdmin = isAdminRole(req.user?.role);
    
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
        pr.run_id,
        pr.job_id,
        pr.status,
        pr.pipeline_type,
        pr.created_at,
        pr.started_at,
        pr.finished_at,
        pr.error_message,
        u.user_email as user_email,
        pres.processed_at
      FROM microbrsoil_db.pipeline_runs pr
      LEFT JOIN microbrsoil_db.users u ON pr.user_id = u.user_id
      LEFT JOIN microbrsoil_db.pipeline_results pres ON pr.run_id = pres.run_id
      LEFT JOIN microbrsoil_db.soil s ON pres.soil_id = s.soil_id
      WHERE pres.soil_id = $1
      ${isAdmin ? '' : 'AND s.owner_id = $2'}
      ORDER BY pr.created_at DESC
    `;

    const params = isAdmin ? [id] : [id, req.user.id];
    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    req.logger?.error('Error fetching pipeline runs for soil', { 
      error: error.message, 
      stack: error.stack,
      soilId: req.params.soilId
    });
    console.error('Pipeline runs fetch error:', error);
    res.status(500).json(safeErrorBody(error, 'Failed to fetch pipeline runs'));
  }
});

module.exports = router;
