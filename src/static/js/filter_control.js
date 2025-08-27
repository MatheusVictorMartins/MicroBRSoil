 let filter_dropdown_activeted = false;

function createFilterDropDown(){
    const filter = document.getElementById("filter_dropdown");
    let html = "";
    if(filter_dropdown_activeted == false){
    html = `<div class="filters-dropdown basic-frame">
              <div class="filter-row1">
              <select id="materialFilter" class="form-select filter-item" aria-label="Material filter">
                <option value="">All Materials</option>
              </select>
              <select id="locationFilter" class="form-select filter-item" aria-label="Location filter">
                <option value="">All Locations</option>
              </select>
              <select id="soilTypeFilter" class="form-select filter-item" aria-label="Soil type filter">
                <option value="">All Soil Types</option>
              </select>
              </div>
              <div class="filter-row2">
              <select id="depthFilter" class="form-select filter-item" aria-label="Depth filter">
                <option value="">All Depths</option>
                <option value="0-10">0-10m</option>
                <option value="10-50">10-50m</option>
                <option value="50+">50m+</option>
              </select>
              <select id="phFilter" class="form-select filter-item" aria-label="pH filter">
                <option value="">All pH Levels</option>
                <option value="acidic">Acidic (< 6.0)</option>
                <option value="neutral">Neutral (6.0-8.0)</option>
                <option value="alkaline">Alkaline (> 8.0)</option>
              </select>
              <button type="button" class="btn btn-outline-secondary filter-item" onclick="clearAllFilters()">
                <span class="material-symbols-rounded">clear</span> Clear Filters
              </button>
              </div>
          </div>`;
          filter_dropdown_activeted = true;
          
          // Populate filter options if soil manager is available
          setTimeout(() => {
              if (window.soilManager && window.soilManager.availableFilters) {
                  populateFilterOptions(window.soilManager.availableFilters);
              }
          }, 100);
    }
        else{
            html = "";
            filter_dropdown_activeted = false;
        }
    
    filter.innerHTML = html;
}

function populateFilterOptions(filters) {
    // Populate material filter
    const materialFilter = document.getElementById('materialFilter');
    if (materialFilter && filters.materials) {
        filters.materials.forEach(material => {
            const option = document.createElement('option');
            option.value = material;
            option.textContent = material;
            materialFilter.appendChild(option);
        });
    }
    
    // Populate location filter
    const locationFilter = document.getElementById('locationFilter');
    if (locationFilter && filters.locations) {
        filters.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            locationFilter.appendChild(option);
        });
    }
    
    // Populate soil type filter
    const soilTypeFilter = document.getElementById('soilTypeFilter');
    if (soilTypeFilter && filters.soilTypes) {
        filters.soilTypes.forEach(soilType => {
            const option = document.createElement('option');
            option.value = soilType;
            option.textContent = soilType;
            soilTypeFilter.appendChild(option);
        });
    }
    
    // Add event listeners for filter changes
    setupFilterEventListeners();
}

function setupFilterEventListeners() {
    const filterIds = ['materialFilter', 'locationFilter', 'soilTypeFilter', 'depthFilter', 'phFilter'];
    
    filterIds.forEach(filterId => {
        const filterElement = document.getElementById(filterId);
        if (filterElement) {
            filterElement.addEventListener('change', applyFilters);
        }
    });
}

function applyFilters() {
    if (!window.soilManager) return;
    
    const filters = {
        material: document.getElementById('materialFilter')?.value || '',
        location: document.getElementById('locationFilter')?.value || '',
        soil_type: document.getElementById('soilTypeFilter')?.value || '',
        depth: document.getElementById('depthFilter')?.value || '',
        ph: document.getElementById('phFilter')?.value || ''
    };
    
    // Convert depth filter to actual depth values
    if (filters.depth) {
        const depthRanges = {
            '0-10': { min: 0, max: 10 },
            '10-50': { min: 10, max: 50 },
            '50+': { min: 50, max: 999999 }
        };
        filters.depthRange = depthRanges[filters.depth];
        delete filters.depth;
    }
    
    // Convert pH filter to actual pH values
    if (filters.ph) {
        const phRanges = {
            'acidic': { min: 0, max: 6.0 },
            'neutral': { min: 6.0, max: 8.0 },
            'alkaline': { min: 8.0, max: 14.0 }
        };
        filters.phRange = phRanges[filters.ph];
        delete filters.ph;
    }
    
    window.soilManager.applyFilters(filters);
}

function clearAllFilters() {
    const filterIds = ['materialFilter', 'locationFilter', 'soilTypeFilter', 'depthFilter', 'phFilter'];
    
    filterIds.forEach(filterId => {
        const filterElement = document.getElementById(filterId);
        if (filterElement) {
            filterElement.value = '';
        }
    });
    
    if (window.soilManager) {
        window.soilManager.applyFilters({});
    }
}