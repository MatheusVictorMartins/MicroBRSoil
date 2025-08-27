/**
 * Dynamic content loader for index.html (soil data)
 */

class SoilDataManager {
    constructor() {
        this.currentPage = 1;
        this.limit = 20;
        this.filters = {
            search: '',
            material: '',
            location: ''
        };
        this.init();
    }

    async init() {
        await this.loadFilters();
        await this.loadSoilData();
        this.setupEventListeners();
    }

    async loadFilters() {
        try {
            const response = await fetch('/api/table/soil/filters');
            const data = await response.json();
            
            if (data.success) {
                this.availableFilters = data.filters;
                this.populateFilterDropdowns(data.filters);
                
                // Make filters available globally for filter_control.js
                window.soilFilters = data.filters;
            }
        } catch (error) {
            console.error('Error loading filters:', error);
        }
    }

    populateFilterDropdowns(filters) {
        // Store filters for later use by filter_control.js
        this.availableFilters = filters;
        
        // If filter dropdowns exist, populate them
        const materialFilter = document.getElementById('materialFilter');
        if (materialFilter && filters.materials) {
            // Clear existing options except the first one
            while (materialFilter.children.length > 1) {
                materialFilter.removeChild(materialFilter.lastChild);
            }
            
            filters.materials.forEach(material => {
                const option = document.createElement('option');
                option.value = material;
                option.textContent = material;
                materialFilter.appendChild(option);
            });
        }
        
        const locationFilter = document.getElementById('locationFilter');
        if (locationFilter && filters.locations) {
            // Clear existing options except the first one
            while (locationFilter.children.length > 1) {
                locationFilter.removeChild(locationFilter.lastChild);
            }
            
            filters.locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                locationFilter.appendChild(option);
            });
        }
        
        const soilTypeFilter = document.getElementById('soilTypeFilter');
        if (soilTypeFilter && filters.soilTypes) {
            // Clear existing options except the first one
            while (soilTypeFilter.children.length > 1) {
                soilTypeFilter.removeChild(soilTypeFilter.lastChild);
            }
            
            filters.soilTypes.forEach(soilType => {
                const option = document.createElement('option');
                option.value = soilType;
                option.textContent = soilType;
                soilTypeFilter.appendChild(option);
            });
        }
    }

    async loadSoilData() {
        try {
            const queryParams = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                ...this.filters
            });

            const response = await fetch(`/api/table/soil?${queryParams}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderSoilTable(data.data);
                this.renderPagination(data.pagination);
            } else {
                console.error('Error fetching soil data:', data.error);
                this.showError('Failed to load soil data');
            }
        } catch (error) {
            console.error('Error loading soil data:', error);
            this.showError('Network error while loading data');
        }
    }

    renderSoilTable(soilData) {
        const tableBody = document.querySelector('.dashboard-table tbody');
        if (!tableBody) return;

        // Clear existing rows
        tableBody.innerHTML = '';

        if (soilData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">No soil samples found</td>
                </tr>
            `;
            return;
        }

        soilData.forEach(soil => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <th scope="row">${soil.id.toString().padStart(5, '0')}</th>
                <td>${soil.material || 'N/A'}</td>
                <td>${soil.project_name || 'N/A'}</td>
                <td>${soil.location || 'N/A'}</td>
                <td>${soil.creation_date || 'N/A'}</td>
            `;
            
            // Add click event to show details
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => this.showSoilDetails(soil.id));
            
            tableBody.appendChild(row);
        });
    }

    renderPagination(pagination) {
        // Create pagination controls
        const tableContainer = document.querySelector('.dashboard-table').parentElement;
        let paginationDiv = document.querySelector('.pagination-controls');
        
        if (!paginationDiv) {
            paginationDiv = document.createElement('div');
            paginationDiv.className = 'pagination-controls mt-3 d-flex justify-content-between align-items-center';
            tableContainer.appendChild(paginationDiv);
        }

        paginationDiv.innerHTML = `
            <div class="pagination-info">
                Showing ${((pagination.currentPage - 1) * pagination.limit) + 1} to 
                ${Math.min(pagination.currentPage * pagination.limit, pagination.totalRecords)} 
                of ${pagination.totalRecords} results
            </div>
            <div class="pagination-buttons">
                <button class="btn btn-sm btn-outline-primary me-2" 
                        onclick="soilManager.goToPage(${pagination.currentPage - 1})"
                        ${pagination.currentPage <= 1 ? 'disabled' : ''}>
                    Previous
                </button>
                <span class="current-page">Page ${pagination.currentPage} of ${pagination.totalPages}</span>
                <button class="btn btn-sm btn-outline-primary ms-2" 
                        onclick="soilManager.goToPage(${pagination.currentPage + 1})"
                        ${pagination.currentPage >= pagination.totalPages ? 'disabled' : ''}>
                    Next
                </button>
            </div>
        `;
    }

    async showSoilDetails(soilId) {
        try {
            const response = await fetch(`/api/table/soil/${soilId}`);
            const data = await response.json();
            
            if (data.success) {
                this.displaySoilModal(data.data);
            } else {
                console.error('Error fetching soil details:', data.error);
            }
        } catch (error) {
            console.error('Error loading soil details:', error);
        }
    }

    displaySoilModal(soil) {
        // Create a modal to display detailed soil information
        const modalHtml = `
            <div class="modal fade" id="soilDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Soil Sample Details - ${soil.sample_name}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>Basic Information</h6>
                                    <p><strong>Sample Name:</strong> ${soil.sample_name}</p>
                                    <p><strong>Location:</strong> ${soil.geo_loc_name}</p>
                                    <p><strong>Collection Date:</strong> ${soil.collection_date}</p>
                                    <p><strong>Soil Depth:</strong> ${soil.soil_depth}m</p>
                                    <p><strong>Elevation:</strong> ${soil.elev}m</p>
                                </div>
                                <div class="col-md-6">
                                    <h6>Environmental Data</h6>
                                    <p><strong>Broad Scale:</strong> ${soil.env_broad_scale || 'N/A'}</p>
                                    <p><strong>Local Scale:</strong> ${soil.env_local_scale || 'N/A'}</p>
                                    <p><strong>Medium:</strong> ${soil.env_medium || 'N/A'}</p>
                                    <p><strong>pH:</strong> ${soil.ph || 'N/A'}</p>
                                    <p><strong>Soil Type:</strong> ${soil.soil_type || 'N/A'}</p>
                                </div>
                            </div>
                            ${soil.coordinates ? `
                                <div class="row mt-3">
                                    <div class="col-12">
                                        <h6>Coordinates</h6>
                                        <p><strong>Latitude:</strong> ${soil.coordinates.latitude}</p>
                                        <p><strong>Longitude:</strong> ${soil.coordinates.longitude}</p>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal
        const existingModal = document.getElementById('soilDetailModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add new modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('soilDetailModal'));
        modal.show();
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.filters.search = e.target.value;
                    this.currentPage = 1;
                    this.loadSoilData();
                }, 500);
            });
        }

        // Filter dropdowns (would be integrated with existing filter system)
        const materialFilter = document.getElementById('materialFilter');
        if (materialFilter) {
            materialFilter.addEventListener('change', (e) => {
                this.filters.material = e.target.value;
                this.currentPage = 1;
                this.loadSoilData();
            });
        }

        const locationFilter = document.getElementById('locationFilter');
        if (locationFilter) {
            locationFilter.addEventListener('change', (e) => {
                this.filters.location = e.target.value;
                this.currentPage = 1;
                this.loadSoilData();
            });
        }
    }

    goToPage(page) {
        if (page < 1) return;
        this.currentPage = page;
        this.loadSoilData();
    }

    applyFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
        this.currentPage = 1;
        this.loadSoilData();
    }

    showError(message) {
        const tableBody = document.querySelector('.dashboard-table tbody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        <i class="material-symbols-rounded">error</i> ${message}
                    </td>
                </tr>
            `;
        }
    }
}

// Initialize when DOM is loaded
let soilManager;
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the index page
    if (document.querySelector('.dashboard-table')) {
        soilManager = new SoilDataManager();
    }
});

// Export for global access
window.soilManager = soilManager;
