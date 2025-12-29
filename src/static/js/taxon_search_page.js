const searchSelect = document.getElementById("tx_srh_select");
const searchBox = document.getElementById("search-box");
const searchButton = document.querySelector(".btn-taxon-search");
const resultsPanel = document.getElementById("taxonResultsPanel");
const resultsBody = document.getElementById("taxonResultsBody");
const resultsCount = document.getElementById("taxonResultsCount");
const resultsMessage = document.getElementById("taxonResultsMessage");

let speciesList = [];
let genusList = [];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTaxonomy(sample) {
  const parts = [
    sample?.tax_kingdom,
    sample?.tax_phylum,
    sample?.tax_class,
    sample?.tax_order,
    sample?.tax_family,
    sample?.tax_genus,
    sample?.tax_species
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Unknown taxonomy";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildTaxonChips(sample) {
  const levels = [
    { label: "K", value: sample?.tax_kingdom },
    { label: "P", value: sample?.tax_phylum },
    { label: "C", value: sample?.tax_class },
    { label: "O", value: sample?.tax_order },
    { label: "F", value: sample?.tax_family },
    { label: "G", value: sample?.tax_genus },
    { label: "S", value: sample?.tax_species }
  ];
  const chips = levels
    .filter((level) => level.value)
    .map((level) => {
      return `<span class="taxon-chip"><span class="taxon-chip-label">${level.label}</span>${escapeHtml(level.value)}</span>`;
    })
    .join("");
  return chips;
}

function shortenSequence(sequence) {
  if (!sequence) return "";
  const value = String(sequence);
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

function buildOptions(list, keyName) {
  if (!Array.isArray(list) || list.length === 0) {
    return '<option value="" disabled>No options found</option>';
  }
  return list
    .map((item) => {
      const value = item[keyName];
      if (!value) return "";
      return `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`;
    })
    .join("");
}

function updateSearchBox() {
  const value = searchSelect.value;
  let html = "";
  if (value === "sh") {
    html = `<input type="text" name="tselect_sh" id="tselect_sh" class="text-input register-text-input" placeholder="Enter SH / sequence">`;
  } else if (value === "species") {
    html = `<select class="form-select species-select search-select" aria-label="Species select">
              <option value="" selected disabled>Select a species...</option>
              ${buildOptions(speciesList, "tax_species")}
            </select>`;
  } else if (value === "genus") {
    html = `<select class="form-select genus-select search-select" aria-label="Genus select">
              <option value="" selected disabled>Select a genus...</option>
              ${buildOptions(genusList, "tax_genus")}
            </select>`;
  }

  searchBox.innerHTML = html;
}

async function loadLists() {
  try {
    const response = await fetch("/taxon_search/api/getLists", { credentials: "include" });
    if (!response.ok) throw new Error("Failed to load taxon lists.");
    const data = await response.json();
    speciesList = Array.isArray(data.speciesList) ? data.speciesList : [];
    genusList = Array.isArray(data.genusList) ? data.genusList : [];
  } catch (error) {
    speciesList = [];
    genusList = [];
  } finally {
    updateSearchBox();
  }
}

function getSelectedValue() {
  const type = searchSelect.value;
  if (type === "sh") {
    return document.getElementById("tselect_sh")?.value?.trim() || "";
  }
  const selectEl = searchBox.querySelector("select");
  return selectEl?.value?.trim() || "";
}

function renderResults(results) {
  const safeResults = Array.isArray(results) ? results : [];
  const count = safeResults.length;

  if (resultsPanel) resultsPanel.style.display = "block";
  if (resultsCount) resultsCount.textContent = `${count} result(s)`;
  if (resultsMessage) {
    resultsMessage.textContent = count ? "Showing matches from your database." : "No matches found.";
  }

  if (!resultsBody) return;
  if (!count) {
    resultsBody.innerHTML = `<div class="text-muted small">No results found for this query.</div>`;
    return;
  }

  resultsBody.innerHTML = safeResults
    .map((row, index) => {
      const sample = row.sample || {};
      const soil = row.soil || {};
      const pipeline = row.pipeline || {};
      const user = row.user || {};
      const pipelineLabel = pipeline?.pipeline_type ? String(pipeline.pipeline_type).toUpperCase() : "-";
      const fullSequence = sample?.plant_sequence || "";
      const sequence = shortenSequence(fullSequence);
      const taxLabel = formatTaxonomy(sample);
      const taxonChips = buildTaxonChips(sample);
      const location = soil?.geo_loc_name || "Unknown location";
      const sampleName = soil?.sample_name || `Sample ${index + 1}`;
      const userLabel = user?.user_email || "-";
      const createdAt = formatDate(pipeline?.created_at);
      const fullJson = escapeHtml(JSON.stringify(row, null, 2));
      const hasFullSequence = fullSequence && fullSequence.length > 120;
      const soilId = soil?.soil_id || soil?.soilId || null;
      const sampleLink = soilId ? `/individual_page?soilId=${encodeURIComponent(soilId)}` : "";

      return `
        <details class="result-item">
          <summary>
            <div class="result-summary">
              <div class="result-summary-main">
                <div class="result-title">${escapeHtml(sampleName)}</div>
                <div class="result-subtitle">${escapeHtml(taxLabel)}</div>
                ${taxonChips ? `<div class="taxon-chips">${taxonChips}</div>` : ""}
              </div>
              <div class="result-summary-meta">
                ${pipelineLabel !== "-" ? `<span class="meta-pill">Pipeline: ${escapeHtml(pipelineLabel)}</span>` : ""}
                ${userLabel !== "-" ? `<span class="meta-pill">Owner: ${escapeHtml(userLabel)}</span>` : ""}
                ${sampleLink
                  ? `<a class="btn btn-sm btn-outline-primary result-action" href="${sampleLink}">View results</a>`
                  : `<button class="btn btn-sm btn-outline-secondary result-action" disabled>No results</button>`}
              </div>
            </div>
          </summary>
          <div class="result-details">
            <div class="result-grid">
              <div class="detail-card">
                <div class="result-label">Sequence</div>
                <div class="mono sequence-preview">${escapeHtml(sequence || "-")}</div>
                ${hasFullSequence ? `<details class="inline-details"><summary>Show full sequence</summary><div class="mono sequence-full">${escapeHtml(fullSequence)}</div></details>` : ""}
              </div>
              <div class="detail-card">
                <div class="result-label">Run ID</div>
                <div class="mono">${escapeHtml(pipeline?.run_id || "-")}</div>
              </div>
              <div class="detail-card">
                <div class="result-label">Created at</div>
                <div>${escapeHtml(createdAt)}</div>
              </div>
              <div class="detail-card">
                <div class="result-label">Location</div>
                <div>${escapeHtml(location)}</div>
              </div>
            </div>
            <details class="result-json">
              <summary>Full record (JSON)</summary>
              <pre>${fullJson}</pre>
            </details>
          </div>
        </details>
      `;
    })
    .join("");
}

async function runSearch() {
  const type = searchSelect.value;
  const value = getSelectedValue();
  if (!value) {
    alert("Select or enter a value to search.");
    return;
  }

  if (resultsPanel) resultsPanel.style.display = "block";
  if (resultsMessage) resultsMessage.textContent = "Loading results...";
  if (resultsBody) resultsBody.innerHTML = "";

  try {
    const response = await fetch(`/taxon_search/api/${type}/${encodeURIComponent(value)}/result`, {
      credentials: "include"
    });
    const data = await response.json();
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || "Search failed.");
    }
    renderResults(data.sampleList || []);
  } catch (error) {
    if (resultsPanel) resultsPanel.style.display = "block";
    if (resultsMessage) resultsMessage.textContent = "Failed to load results.";
    if (resultsBody) resultsBody.innerHTML = `<div class="text-danger small">${escapeHtml(error.message)}</div>`;
  }
}

updateSearchBox();
searchSelect.addEventListener("change", updateSearchBox);
searchButton?.addEventListener("click", runSearch);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadLists);
} else {
  loadLists();
}
