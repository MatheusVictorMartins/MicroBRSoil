(() => {
/**
 * Dynamic content loader for index.html (soil data)
 */

const APP_CONSTANTS = window.APP_CONSTANTS || {};
const ROUTES = APP_CONSTANTS.ROUTES || {};
const MESSAGES = APP_CONSTANTS.MESSAGES || {};
const TABLE_BASE = ROUTES.TABLE_BASE || '/api/table';
const TABLE_SOIL_ROUTE = ROUTES.TABLE_SOIL || `${TABLE_BASE}/soil`;
const TABLE_SOIL_FILTERS_ROUTE = ROUTES.TABLE_SOIL_FILTERS || `${TABLE_BASE}/soil/filters`;
const STATS_ROUTE = ROUTES.PIPELINE_STATS || `${TABLE_BASE}/stats`;
const LOADING_MESSAGE = MESSAGES.LOADING || 'Loading...';

class SoilDataManager {
    constructor() {
        this.currentPage = 1;
        this.limit = 20;
        this.filters = {
            search: '',
            material: '',
            location: ''
        };
        this.authState = { authenticated: false, isAdmin: false, user: null };
        this.init();
    }

    async init() {
        await this.refreshAuthState();
        this.configureTableHeader();
        await this.loadAdminStats();
        if (this.authState.authenticated) {
            await this.loadFilters();
            await this.loadSoilData();
        } else {
            this.renderBlankTable();
        }
        this.setupEventListeners();
    }

    async refreshAuthState(forceRefresh = false) {
        if (typeof getAuthStatus !== 'function') {
            this.authState = { authenticated: false, isAdmin: false, user: null };
            return this.authState;
        }

        try {
            const status = await getAuthStatus(forceRefresh);
            if (typeof isAdminRole === 'function') {
                status.isAdmin = status.isAdmin ?? isAdminRole(status.user?.role);
            }
            this.authState = status;
            return status;
        } catch (error) {
            this.authState = { authenticated: false, isAdmin: false, user: null };
            return this.authState;
        }
    }

    configureTableHeader() {
        const headerRow = document.querySelector('.dashboard-table thead tr');
        if (!headerRow) return;

        const existingOwner = headerRow.querySelector('[data-owner-col="true"]');
        const existingAction = headerRow.querySelector('[data-actions-col="true"]');
        if (this.authState.isAdmin) {
            if (!existingOwner) {
                const thOwner = document.createElement('th');
                thOwner.textContent = 'USER';
                thOwner.setAttribute('data-owner-col', 'true');
                const locationHeader = headerRow.children[3] || null;
                headerRow.insertBefore(thOwner, locationHeader);
            }
            if (!existingAction) {
                const th = document.createElement('th');
                th.textContent = 'ACTIONS';
                th.setAttribute('data-actions-col', 'true');
                headerRow.appendChild(th);
            }
        } else {
            if (existingOwner) {
                existingOwner.remove();
            }
            if (existingAction) {
                existingAction.remove();
            }
        }
    }

    clearPagination() {
        const paginationDiv = document.querySelector('.pagination-controls');
        if (paginationDiv) {
            paginationDiv.remove();
        }
    }

    renderBlankTable() {
        const tableBody = document.querySelector('.dashboard-table tbody');
        if (!tableBody) return;

        this.clearPagination();
        tableBody.innerHTML = '';

        const headerCells = document.querySelectorAll('.dashboard-table thead th');
        const columnCount = headerCells.length || 5;
        const blankCells = Array.from({ length: columnCount }, (_, idx) => {
            return idx === 0 ? '<th scope="row">&nbsp;</th>' : '<td>&nbsp;</td>';
        }).join('');

        tableBody.innerHTML = `<tr>${blankCells}</tr>`;
    }

    showLoading() {
        const tableBody = document.querySelector('.dashboard-table tbody');
        if (!tableBody) return;

        this.clearPagination();
        const headerCells = document.querySelectorAll('.dashboard-table thead th');
        const columnCount = headerCells.length || 5;
        tableBody.innerHTML = `
            <tr>
                <td colspan="${columnCount}" class="text-center">${LOADING_MESSAGE}</td>
            </tr>
        `;
    }

    formatDuration(ms) {
        const value = Number(ms);
        if (!Number.isFinite(value) || value <= 0) return '-';
        const totalSeconds = Math.round(value / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }

    formatBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = value;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    async loadAdminStats() {
        const panel = document.getElementById('adminDashboard');
        if (!panel) return;

        panel.classList.toggle('d-none', !this.authState.isAdmin);
        if (!this.authState.isAdmin) return;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText('adminQueuedCount', LOADING_MESSAGE);
        setText('adminRunningCount', LOADING_MESSAGE);
        setText('adminFailedCount', LOADING_MESSAGE);
        setText('adminAvgDuration', LOADING_MESSAGE);
        setText('adminTotalUpload', LOADING_MESSAGE);

        try {
            const response = await fetch(STATS_ROUTE);
            if (response.status === 401 || response.status === 403) {
                panel.classList.add('d-none');
                return;
            }

            const payload = await response.json();
            const stats = payload.stats || {};
            setText('adminQueuedCount', stats.queued_pipelines ?? 0);
            setText('adminRunningCount', stats.running_pipelines ?? 0);
            setText('adminFailedCount', stats.failed_pipelines ?? 0);
            setText('adminAvgDuration', this.formatDuration(stats.avg_pipeline_duration_ms));
            setText('adminTotalUpload', this.formatBytes(stats.total_upload_bytes));

            const updated = document.getElementById('adminStatsUpdated');
            if (updated) {
                updated.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
            }
        } catch (error) {
            const updated = document.getElementById('adminStatsUpdated');
            if (updated) {
                updated.textContent = 'Stats unavailable';
            }
        }
    }

    async loadFilters() {
        if (!this.authState.authenticated) return;
        try {
            const response = await fetch(TABLE_SOIL_FILTERS_ROUTE);
            if (response.status === 401 || response.status === 403) {
                this.renderBlankTable();
                return;
            }
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
        if (!this.authState.authenticated) {
            this.renderBlankTable();
            return;
        }

        this.showLoading();
        try {
            const queryParams = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                ...this.filters
            });

            const response = await fetch(`${TABLE_SOIL_ROUTE}?${queryParams}`);
            if (response.status === 401 || response.status === 403) {
                this.renderBlankTable();
                return;
            }
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
            const headerCells = document.querySelectorAll('.dashboard-table thead th');
            const columnCount = headerCells.length || 5;
            tableBody.innerHTML = `
                <tr>
                    <td colspan="${columnCount}" class="text-center">No soil samples found</td>
                </tr>
            `;
            return;
        }

        soilData.forEach(soil => {
            const row = document.createElement('tr');
            const ownerCell = this.authState.isAdmin ? `<td>${soil.owner || 'N/A'}</td>` : '';
            const actionCell = this.authState.isAdmin
                ? `<td><button class="btn btn-sm btn-outline-danger" data-action="delete">Delete</button></td>`
                : '';
            row.innerHTML = `
                <th scope="row">${soil.id.toString().padStart(5, '0')}</th>
                <td>${soil.material || 'N/A'}</td>
                <td>${soil.project_name || 'N/A'}</td>
                ${ownerCell}
                <td>${soil.location || 'N/A'}</td>
                <td>${soil.creation_date || 'N/A'}</td>
                ${actionCell}
            `;
            
            // Make row clickable to navigate to individual page
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => {
                window.location.href = `/individual_page?soilId=${soil.id}`;
            });

            if (this.authState.isAdmin) {
                const deleteButton = row.querySelector('[data-action="delete"]');
                if (deleteButton) {
                    deleteButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.deleteSoilRecord(soil.id, row);
                    });
                }
            }
            
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

    async deleteSoilRecord(soilId, rowElement) {
        if (!soilId) return;
        if (!window.confirm('Delete this soil sample? This cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/table/soil/${soilId}`, {
                method: 'DELETE',
                headers: { Accept: 'application/json' }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const message = errorData?.error || 'Failed to delete soil sample';
                this.showError(message);
                return;
            }

            if (rowElement) {
                rowElement.remove();
            }

            const tableBody = document.querySelector('.dashboard-table tbody');
            if (tableBody && tableBody.children.length === 0) {
                await this.loadSoilData();
            }
        } catch (error) {
            this.showError('Network error while deleting sample');
        }
    }

    async showSoilDetails(soilId) {
        try {
            const response = await fetch(`${TABLE_SOIL_ROUTE}/${soilId}`);
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
            const headerCells = document.querySelectorAll('.dashboard-table thead th');
            const columnCount = headerCells.length || 5;
            tableBody.innerHTML = `
                <tr>
                    <td colspan="${columnCount}" class="text-center text-danger">
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
        window.soilManager = soilManager;
    }
});
})();
