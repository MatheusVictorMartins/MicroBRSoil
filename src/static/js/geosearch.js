// Initialize map
const map = L.map('map').setView([-15.5, -50], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const markers = L.markerClusterGroup();

// Function to load soil samples from API
async function loadSoilSamples() {
  try {
    console.log('Starting fetch to backend API...');
    // Call backend directly to bypass nginx routing issues
    const response = await fetch('http://localhost:3000/api/geosearch');
    console.log('Response received:', response);

    // Check if response is ok before parsing JSON
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Parsed JSON result:', result);

    if (!result.success) {
      console.error('Error loading soil samples:', result.message);
      alert('Error loading soil samples: ' + result.message);
      return;
    }
    
    const soilSamples = result.data;
    console.log(`Loaded ${soilSamples.length} soil samples`);
    
    // Clear existing markers
    markers.clearLayers();
    
    // Add markers for each soil sample
    soilSamples.forEach(sample => {
      // Skip samples without valid coordinates
      if (!sample.latitude || !sample.longitude || 
          isNaN(sample.latitude) || isNaN(sample.longitude)) {
        return;
      }
      
      const marker = L.marker([sample.latitude, sample.longitude]);

      const popupContent = `
        <div class="soil-sample-popup">
          <h4>${sample.sampleName}</h4>
          <div class="sample-info">
            <strong>ID:</strong> ${sample.id}<br/>
            <strong>Location:</strong> ${sample.geoLocation || 'N/A'}<br/>
            <strong>Soil Type:</strong> ${sample.soilType || 'N/A'}<br/>
            <strong>Soil Texture:</strong> ${sample.soilTexture || 'N/A'}<br/>
            <strong>Depth:</strong> ${sample.soilDepth}<br/>
            <strong>pH:</strong> ${sample.pH !== null ? sample.pH.toFixed(2) : 'N/A'}<br/>
            <strong>Elevation:</strong> ${sample.elevation}m<br/>
            <strong>Collection Date:</strong> ${new Date(sample.collectionDate).toLocaleDateString()}<br/>
            ${sample.currentLandUse ? `<strong>Land Use:</strong> ${sample.currentLandUse}<br/>` : ''}
            ${sample.currentVegetation ? `<strong>Vegetation:</strong> ${sample.currentVegetation}<br/>` : ''}
          </div>
          <div class="popup-actions">
            <button class="btn btn-primary btn-sm" onclick="verDetalhes('${sample.id}')">Ver detalhes</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      markers.addLayer(marker);
    });

    map.addLayer(markers);
    
    // Update UI with sample count
    updateSampleCount(soilSamples.length);
    
  } catch (error) {
    console.error('Error fetching soil samples:', error);
    alert('Error loading soil samples. Please try again later.');
  }
}

// Function to update sample count in UI
function updateSampleCount(count) {
  const countElement = document.getElementById('sample-count');
  if (countElement) {
    countElement.textContent = `${count} samples loaded`;
  }
}

// Function to view sample details
window.verDetalhes = async function(id) {
  try {
    const response = await fetch(`http://localhost:3000/api/geosearch/${id}`);
    const result = await response.json();
    
    if (!result.success) {
      alert('Error loading sample details: ' + result.message);
      return;
    }
    
    const sample = result.data;
    
    // Create detailed modal or redirect to details page
    showSampleDetails(sample);
    
  } catch (error) {
    console.error('Error fetching sample details:', error);
    alert('Error loading sample details. Please try again later.');
  }
};

// Function to show detailed sample information in a modal
function showSampleDetails(sample) {
  const modalContent = `
    <div class="modal fade" id="sampleDetailsModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Sample Details: ${sample.sampleName}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6">
                <h6>Basic Information</h6>
                <table class="table table-sm">
                  <tr><td><strong>Sample ID:</strong></td><td>${sample.id}</td></tr>
                  <tr><td><strong>Collection Date:</strong></td><td>${new Date(sample.collectionDate).toLocaleDateString()}</td></tr>
                  <tr><td><strong>Location:</strong></td><td>${sample.geoLocation}</td></tr>
                  <tr><td><strong>Coordinates:</strong></td><td>${sample.coordinates.latitude.toFixed(6)}, ${sample.coordinates.longitude.toFixed(6)}</td></tr>
                  <tr><td><strong>Elevation:</strong></td><td>${sample.elevation}m</td></tr>
                  <tr><td><strong>Soil Depth:</strong></td><td>${sample.soilDepth}cm</td></tr>
                </table>
                
                <h6>Soil Properties</h6>
                <table class="table table-sm">
                  <tr><td><strong>Soil Type:</strong></td><td>${sample.soilType || 'N/A'}</td></tr>
                  <tr><td><strong>Texture:</strong></td><td>${sample.soilTexture || 'N/A'}</td></tr>
                  <tr><td><strong>Horizon:</strong></td><td>${sample.soilHorizon || 'N/A'}</td></tr>
                  <tr><td><strong>pH:</strong></td><td>${sample.pH !== null ? sample.pH.toFixed(2) : 'N/A'}</td></tr>
                </table>
              </div>
              
              <div class="col-md-6">
                <h6>Chemical Properties</h6>
                <table class="table table-sm">
                  <tr><td><strong>Total Nitrogen:</strong></td><td>${sample.totalNitrogen !== null ? sample.totalNitrogen.toFixed(3) : 'N/A'}</td></tr>
                  <tr><td><strong>Total Organic Carbon:</strong></td><td>${sample.totalOrganicCarbon !== null ? sample.totalOrganicCarbon.toFixed(3) : 'N/A'}</td></tr>
                  <tr><td><strong>Microbial Biomass:</strong></td><td>${sample.microbialBiomass !== null ? sample.microbialBiomass.toFixed(3) : 'N/A'}</td></tr>
                  <tr><td><strong>Aluminum Saturation:</strong></td><td>${sample.aluminumSaturation !== null ? sample.aluminumSaturation.toFixed(2) : 'N/A'}</td></tr>
                </table>
                
                <h6>Environmental Context</h6>
                <table class="table table-sm">
                  <tr><td><strong>Current Land Use:</strong></td><td>${sample.currentLandUse || 'N/A'}</td></tr>
                  <tr><td><strong>Current Vegetation:</strong></td><td>${sample.currentVegetation || 'N/A'}</td></tr>
                  <tr><td><strong>Previous Land Use:</strong></td><td>${sample.previousLandUse || 'N/A'}</td></tr>
                  <tr><td><strong>Climate - Annual Temp:</strong></td><td>${sample.annualTemperature !== null ? sample.annualTemperature.toFixed(1) + '°C' : 'N/A'}</td></tr>
                  <tr><td><strong>Climate - Annual Precip:</strong></td><td>${sample.annualPrecipitation !== null ? sample.annualPrecipitation.toFixed(1) + 'mm' : 'N/A'}</td></tr>
                </table>
              </div>
            </div>
            
            ${sample.description ? `
            <div class="row mt-3">
              <div class="col-12">
                <h6>Description</h6>
                <p>${sample.description}</p>
              </div>
            </div>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if present
  const existingModal = document.getElementById('sampleDetailsModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalContent);
  
  // Show modal using Bootstrap
  const modal = new bootstrap.Modal(document.getElementById('sampleDetailsModal'));
  modal.show();
}

// Load soil samples when page loads
document.addEventListener('DOMContentLoaded', function() {
  loadSoilSamples();
});

// Add refresh button functionality
function refreshSamples() {
  loadSoilSamples();
}
