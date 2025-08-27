# Dynamic Frontend Implementation

This document describes the implementation of dynamic content for the frontend pages in the MicroBRSoil project.

## Overview

The implementation adds dynamic data loading and display capabilities to three main pages:
- `index.html` - Displays soil sample data
- `register.html` - Displays and manages user data  
- `upload.html` - Displays soil sample data (same as index.html)

## Backend Implementation

### New API Endpoints

All new endpoints are available under `/api/table/`:

#### Soil Data Endpoints

1. **GET /api/table/soil**
   - Retrieves paginated soil sample data
   - Query parameters:
     - `page` (default: 1) - Page number
     - `limit` (default: 20) - Items per page
     - `search` - Search term for sample name, location, or material
     - `material` - Filter by material type
     - `location` - Filter by location
   - Returns: Paginated list of soil samples with metadata

2. **GET /api/table/soil/filters**
   - Retrieves available filter options
   - Returns: Lists of unique materials, locations, and soil types

3. **GET /api/table/soil/:id**
   - Retrieves detailed information for a specific soil sample
   - Returns: Complete soil sample data including coordinates

#### User Data Endpoints

4. **GET /api/table/users**
   - Retrieves paginated user data (for register.html)
   - Query parameters:
     - `page` (default: 1) - Page number
     - `limit` (default: 20) - Items per page
     - `search` - Search by email
   - Returns: User list with registration dates (passwords hidden)

#### Statistics Endpoint

5. **GET /api/table/stats**
   - Retrieves dashboard statistics
   - Returns: Count of soil samples, users, pipelines, etc.

6. **GET /api/table/pipeline-results**
   - Retrieves pipeline execution results
   - Query parameters:
     - `page`, `limit` - Pagination
     - `status` - Filter by pipeline status
     - `user_id` - Filter by user
   - Returns: Pipeline run results with status information

### Database Integration

The endpoints integrate with the existing PostgreSQL database schema:
- `microbrsoil_db.soil` - Main soil samples table
- `microbrsoil_db.users` - User accounts table
- `microbrsoil_db.pipeline_runs` - Pipeline execution tracking
- `microbrsoil_db.pipeline_results` - Pipeline output data

## Frontend Implementation

### JavaScript Modules

#### 1. Soil Data Manager (`soil_data_manager.js`)

Handles dynamic loading and display of soil sample data for `index.html` and `upload.html`.

**Features:**
- Paginated data loading
- Real-time search functionality
- Filter integration
- Detailed soil sample modal display
- Error handling and loading states

**Usage:**
```javascript
// Automatically initialized on pages with .dashboard-table
const soilManager = new SoilDataManager();

// Programmatic usage
soilManager.applyFilters({ material: 'Soil', location: 'Brazil' });
soilManager.goToPage(2);
```

#### 2. User Data Manager (`user_data_manager.js`)

Manages user data display and registration for `register.html`.

**Features:**
- User list with pagination
- Password visibility toggle
- User registration integration
- Search functionality
- Success/error message display

**Usage:**
```javascript
// Automatically initialized on pages with .register-users-table
const userManager = new UserDataManager();
```

#### 3. Enhanced Filter Control (`filter_control.js`)

Improved filter system with dynamic data integration.

**Features:**
- Dynamic filter option population
- Integration with soil data manager
- Multiple filter types (material, location, soil type, depth, pH)
- Clear filters functionality

### CSS Enhancements (`dynamic-content.css`)

Added styling for:
- Pagination controls
- Search inputs
- Loading states
- Error messages
- Modal displays
- Responsive design

## HTML Updates

### index.html
- Added search input to dashboard actions
- Included soil data manager script
- Added dynamic content CSS

### register.html
- Included user data manager script
- Added dynamic content CSS
- Enhanced registration form handling

### upload.html
- Included soil data manager script
- Added dynamic content CSS
- Table displays same soil data as index.html

## Usage Instructions

### For Developers

1. **Starting the Server**
   ```bash
   npm start
   ```

2. **Testing API Endpoints**
   - Include `api-test.js` in any page
   - Run `testAPIEndpoints()` in browser console

3. **Adding New Filters**
   - Update `filter_control.js` to add new filter types
   - Modify backend endpoints to handle new filter parameters
   - Update CSS for new filter styling

### For Users

1. **Soil Data Browsing (index.html, upload.html)**
   - Use search box to find specific samples
   - Click "FILTERS" button to access advanced filtering
   - Click on table rows to view detailed information
   - Use pagination controls to navigate through results

2. **User Management (register.html)**
   - View existing users in the table
   - Register new users with the form
   - Search users by email
   - Toggle password visibility (shows security message)

## Error Handling

The implementation includes comprehensive error handling:
- Network connectivity issues
- Database connection problems
- Invalid data responses
- User input validation
- Loading state management

## Security Considerations

- Password hashes are never sent to frontend
- User passwords display security placeholder only
- Input sanitization on backend
- SQL injection protection through parameterized queries
- CORS and authentication integration ready

## Performance Features

- Paginated data loading (default 20 items per page)
- Debounced search input (500ms delay)
- Efficient database queries with proper indexing
- Lazy loading of detailed information
- Client-side caching of filter options

## Future Enhancements

Suggested improvements:
1. Add data export functionality
2. Implement advanced sorting options
3. Add data visualization charts
4. Include bulk operations for users
5. Add real-time updates via WebSocket
6. Implement data import functionality
7. Add audit logging for user actions

## File Structure

```
backend/src/routes/
├── table.js                     # New API endpoints

src/static/js/
├── soil_data_manager.js         # Soil data handling
├── user_data_manager.js         # User data handling
├── filter_control.js            # Enhanced filters
└── api-test.js                  # Testing utilities

src/static/css/
└── dynamic-content.css          # New styling

src/html/
├── index.html                   # Updated with dynamic content
├── register.html                # Updated with user management
└── upload.html                  # Updated with soil data display
```

## Testing

To test the implementation:

1. Start the backend server
2. Navigate to any of the three pages
3. Verify dynamic data loading
4. Test search and filter functionality
5. Check pagination controls
6. Verify modal displays and forms work correctly

The implementation is now ready for production use and provides a solid foundation for future enhancements.
