# Module Path Resolution for Docker

## Problem
The application needs to work in both local development and Docker environments, where the file structure is different:

- **Local Development**: `backend/src/` → `../../../db/`
- **Docker Container**: `/app/src/` → `/app/db/`

## Solution
We use environment-based path resolution:

```javascript
const MODULE_PATH = process.env.NODE_ENV === 'production' 
  ? '/app/db/module'          // Docker path
  : '../../../db/module';     // Local development path
```

## Files Updated

### Backend Routes
- `src/routes/upload.js` - Pipeline functions and database
- `src/routes/pipeline.js` - Pipeline functions  
- `src/routes/results.js` - Pipeline functions
- `src/index.js` - Database for health check

### Workers
- `src/workers/pipeline.worker.js` - Pipeline functions and result processor

### Database Utilities
- `db/utilities/result_processor.js` - All database functions

### Application Startup
- `startup.js` - Database connection
- `test-modules.js` - Module loading verification

## Module Paths

| Module | Local Path | Docker Path |
|--------|------------|-------------|
| Database | `../../../db/db` | `/app/db/db` |
| Pipeline Functions | `../../../db/db_functions/pipeline_functions` | `/app/db/db_functions/pipeline_functions` |
| Result Processor | `../../../db/utilities/result_processor` | `/app/db/utilities/result_processor` |
| Sample Functions | `../../../db/db_functions/sample_funtion` | `/app/db/db_functions/sample_funtion` |
| Alpha Functions | `../../../db/db_functions/alpha_functions` | `/app/db/db_functions/alpha_functions` |
| Soil Functions | `../../../db/db_functions/soil_funtions` | `/app/db/db_functions/soil_funtions` |

## Testing

### Test Module Loading
```bash
# In Docker
docker exec microbrsoil-backend npm run test-modules

# Locally
cd backend && npm run test-modules
```

### Environment Variables
- `NODE_ENV=production` - Use Docker paths
- `NODE_ENV=development` or unset - Use local paths

## Docker Volume Mounting
In `docker-compose.yml`:
```yaml
volumes:
  - ./db:/app/db:ro  # Read-only mount of db folder
```

This ensures the database modules are available at `/app/db/` in the container.

## Error Handling
All module requires are wrapped in try-catch blocks where appropriate, and the startup script verifies all required modules can be loaded before starting the application.
