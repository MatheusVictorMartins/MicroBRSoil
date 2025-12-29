const radios = document.querySelectorAll('input[name="btnradio"]');
const text = document.getElementById("searchtype-text");
const searchButton = document.querySelector(".btn-sequence-search");
const sequenceInput = document.getElementById("exampleFormControlTextarea1");
const fileInput = document.getElementById("formFile");
const resultsPanel = document.getElementById("sequenceResultsPanel");
const resultsBody = document.getElementById("sequenceResultsBody");
const resultsCount = document.getElementById("sequenceResultsCount");
const resultsMessage = document.getElementById("sequenceResultsMessage");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  return levels
    .filter((level) => level.value)
    .map((level) => {
      return `<span class="taxon-chip"><span class="taxon-chip-label">${level.label}</span>${escapeHtml(level.value)}</span>`;
    })
    .join("");
}

function formatTaxonLabel(sample) {
  if (!sample) return "Unknown taxon";
  const genus = sample.tax_genus;
  const species = sample.tax_species;
  if (genus && species) return `${genus} ${species}`;
  if (species) return species;
  return (
    sample.tax_genus ||
    sample.tax_family ||
    sample.tax_order ||
    sample.tax_class ||
    sample.tax_phylum ||
    sample.tax_kingdom ||
    "Unknown taxon"
  );
}

function changeTextByChecked() {
  const selected = document.querySelector('input[name="btnradio"]:checked');
  let htmlText = "";

  if (!selected) return;

  switch (selected.id) {
    case "btnradio1":
      htmlText = `<p class="description-text searchtype-des-text">*input 1-100 sequences; only complete ITS1 or ITS2</p>`;
      break;
    case "btnradio2":
      htmlText = `<p class="description-text searchtype-des-text">*input 1-100 sequences; ITS1 or ITS2</p>`;
      break;
    case "btnradio3":
      htmlText = `<p class="description-text searchtype-des-text">*input 1 sequence; ITS1 or ITS2</p>`;
      break;
  }

  text.innerHTML = htmlText;
}

function getSelectedMode() {
  const selected = document.querySelector('input[name="btnradio"]:checked');
  if (!selected) return "exact";
  if (selected.id === "btnradio1") return "exact";
  if (selected.id === "btnradio2") return "best";
  return "group";
}

function normalizeSequence(sequence) {
  return String(sequence || "").replace(/\s+/g, "").toUpperCase().trim();
}

function parseFasta(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  if (!raw.includes(">")) {
    const cleaned = normalizeSequence(raw);
    return cleaned ? [cleaned] : [];
  }

  const sequences = [];
  let current = "";
  raw.split(/\r?\n/).forEach((line) => {
    if (line.startsWith(">")) {
      if (current) {
        sequences.push(normalizeSequence(current));
        current = "";
      }
      return;
    }
    current += line.trim();
  });
  if (current) sequences.push(normalizeSequence(current));
  return sequences.filter(Boolean);
}

function renderResults(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const totalMatches = results.reduce((sum, entry) => sum + (entry.matches?.length || 0), 0);

  if (resultsPanel) resultsPanel.style.display = "block";
  if (resultsCount) resultsCount.textContent = `${totalMatches} match(es)`;
  if (resultsMessage) resultsMessage.textContent = totalMatches ? "Showing results from your database." : "No matches found.";

  if (!resultsBody) return;
  if (!results.length) {
    resultsBody.innerHTML = `<div class="text-muted small">No results found for this query.</div>`;
    return;
  }

  resultsBody.innerHTML = results
    .map((entry, idx) => {
      const queryLabel = entry.query ? `Query ${idx + 1}` : `Query ${idx + 1}`;
      const matches = Array.isArray(entry.matches) ? entry.matches : [];
      const grouped = Array.isArray(entry.grouped) ? entry.grouped : [];

      const matchHtml = matches.length
        ? matches
            .map((row) => {
              const sample = row.sample || {};
              const soil = row.soil || {};
              const pipeline = row.pipeline || {};
              const user = row.user || {};
              const taxLabel = formatTaxonLabel(sample);
              const location = soil.geo_loc_name || "Unknown location";
              const seq = sample.plant_sequence || "";
              const seqShort = seq.length > 80 ? `${seq.slice(0, 80)}...` : seq;
              const pipelineLabel = pipeline?.pipeline_type ? String(pipeline.pipeline_type).toUpperCase() : "-";
              const fullJson = escapeHtml(JSON.stringify(row, null, 2));
              const createdAt = formatDate(pipeline?.created_at);
              const taxonChips = buildTaxonChips(sample);
              const sampleName = soil?.sample_name || taxLabel;
              const hasFullSequence = seq.length > 120;

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
                        ${user?.user_email ? `<span class="meta-pill">Owner: ${escapeHtml(user.user_email)}</span>` : ""}
                      </div>
                    </div>
                  </summary>
                  <div class="result-details">
                    <div class="result-grid">
                      <div class="detail-card">
                        <div class="result-label">Sequence</div>
                        <div class="mono sequence-preview">${escapeHtml(seqShort || "-")}</div>
                        ${hasFullSequence ? `<details class="inline-details"><summary>Show full sequence</summary><div class="mono sequence-full">${escapeHtml(seq)}</div></details>` : ""}
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
            .join("")
        : `<div class="text-muted small">No matches for this query.</div>`;

      const groupHtml = grouped.length
        ? `
          <div class="result-group">
            <div class="small text-muted">Grouped hits</div>
            <div class="group-list">
              ${grouped
                .map((group) => `<span class="group-pill">${escapeHtml(group.taxon)} (${group.count})</span>`)
                .join("")}
            </div>
          </div>`
        : "";

      return `
        <div class="sequence-result-block">
          <div class="result-title">${escapeHtml(queryLabel)}</div>
          <div class="result-subtitle">${escapeHtml(entry.query || "")}</div>
          ${groupHtml}
          ${matchHtml}
        </div>
      `;
    })
    .join("");
}

async function runSearch() {
  const mode = getSelectedMode();
  const inputText = sequenceInput?.value || "";
  let sequences = parseFasta(inputText);

  if (fileInput?.files?.length) {
    const file = fileInput.files[0];
    const content = await file.text();
    const fileSequences = parseFasta(content);
    sequences = fileSequences.length ? fileSequences : sequences;
  }

  sequences = sequences.filter(Boolean).slice(0, 100);

  if (!sequences.length) {
    alert("Provide a sequence or FASTA file.");
    return;
  }

  if (resultsPanel) resultsPanel.style.display = "block";
  if (resultsMessage) resultsMessage.textContent = "Loading results...";
  if (resultsBody) resultsBody.innerHTML = "";

  try {
    const response = await fetch("/sequence_search/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mode, sequences })
    });
    const data = await response.json();
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || "Search failed.");
    }
    renderResults(data);
  } catch (error) {
    if (resultsPanel) resultsPanel.style.display = "block";
    if (resultsMessage) resultsMessage.textContent = "Failed to load results.";
    if (resultsBody) resultsBody.innerHTML = `<div class="text-danger small">${escapeHtml(error.message)}</div>`;
  }
}

radios.forEach((r) => r.addEventListener("change", changeTextByChecked));
changeTextByChecked();
searchButton?.addEventListener("click", () => {
  runSearch();
});
