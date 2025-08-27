/**
 * Test script for the new table API endpoints
 */

async function testAPIEndpoints() {
    const baseURL = 'http://localhost:3000/api/table';
    
    console.log('Testing Table API Endpoints...\n');
    
    // Test soil data endpoint
    try {
        console.log('Testing /api/table/soil...');
        const soilResponse = await fetch(`${baseURL}/soil?page=1&limit=5`);
        const soilData = await soilResponse.json();
        console.log('Soil data response:', soilData);
        console.log('✅ Soil endpoint working\n');
    } catch (error) {
        console.error('❌ Soil endpoint failed:', error);
    }
    
    // Test soil filters endpoint
    try {
        console.log('Testing /api/table/soil/filters...');
        const filtersResponse = await fetch(`${baseURL}/soil/filters`);
        const filtersData = await filtersResponse.json();
        console.log('Filters response:', filtersData);
        console.log('✅ Filters endpoint working\n');
    } catch (error) {
        console.error('❌ Filters endpoint failed:', error);
    }
    
    // Test users endpoint
    try {
        console.log('Testing /api/table/users...');
        const usersResponse = await fetch(`${baseURL}/users?page=1&limit=5`);
        const usersData = await usersResponse.json();
        console.log('Users response:', usersData);
        console.log('✅ Users endpoint working\n');
    } catch (error) {
        console.error('❌ Users endpoint failed:', error);
    }
    
    // Test statistics endpoint
    try {
        console.log('Testing /api/table/stats...');
        const statsResponse = await fetch(`${baseURL}/stats`);
        const statsData = await statsResponse.json();
        console.log('Stats response:', statsData);
        console.log('✅ Stats endpoint working\n');
    } catch (error) {
        console.error('❌ Stats endpoint failed:', error);
    }
}

// Run tests if this script is included in a page
if (typeof window !== 'undefined') {
    window.testAPIEndpoints = testAPIEndpoints;
    console.log('API test functions loaded. Run testAPIEndpoints() to test.');
}

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { testAPIEndpoints };
}
