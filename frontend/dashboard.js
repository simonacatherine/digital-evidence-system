const API = "http://localhost:5000";
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) window.location.href = "login.html";

document.getElementById("roleDisplay").innerText = "Logged in as: " + role;

const legalRoles = [
  "FORENSIC_ANALYST",
  "INVESTIGATING_OFFICER",
  "PUBLIC_PROSECUTOR",
  "DEFENCE_ADVOCATE",
  "JUDGE"
];

let selectedCase = "";

function updateSelectedCase() {
  const selector = document.getElementById("caseSelector");
  selectedCase = selector.value;
  loadEvidence();
}

if (legalRoles.includes(role)) {
  document.getElementById("analysisSection").style.display = "block";
}

if (role !== "FORENSIC_ANALYST") {
  document.getElementById("createReportForm").style.display = "none";
}

if (role !== "INVESTIGATING_OFFICER") {
  document.getElementById("uploadSection").style.display = "none";
  document.getElementById("createCaseSection").style.display = "none";
} else {
  // Show location fields only for investigating officer
  document.getElementById("locationFields").style.display = "flex";
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

async function loadEvidence() {
  if (!selectedCase) return;
  try {
    const res = await fetch(`${API}/verify?caseId=${selectedCase}`, {
      headers: { Authorization: "Bearer " + token }
    });

    if (res.status === 401 || res.status === 403) {
      alert("Session expired");
      logout();
      return;
    }

    const records = await res.json();
    const table = document.getElementById("table");
    table.innerHTML = "";

    records.forEach(r => {
      const row = document.createElement("tr");
      let actions = "";

      if (role === "INVESTIGATING_OFFICER" && r.status === "NOT REGISTERED") {
        actions += `<button onclick="registerEvidence('${r.evidenceId}')">Register</button> `;
      }

      if (r.status !== "NOT REGISTERED") {
        actions += `<button onclick="viewFile('${r.evidenceId}')">View</button> `;
        actions += `<button onclick="verifyEvidence('${r.evidenceId}')">Verify</button> `;
      }

      if (r.file_type === "VIDEO" && role === "FORENSIC_ANALYST") {
        actions += `<button onclick="analyzeVideo('${r.evidenceId}')">Analyse Video</button> `;
      }

      row.innerHTML = `
        <td>${r.evidenceId}</td>
        <td>${r.caseId}</td>
        <td>${r.status}</td>
        <td>${r.detected_action || "N/A"}</td>
        <td>${actions}</td>
      `;

      table.appendChild(row);
    });

  } catch (err) {
    console.error("Load error:", err);
  }
}

// Open map page — pass evidenceId so map can highlight it
function openMap(evidenceId) {
  if (evidenceId) {
    localStorage.setItem("mapFocusEvidence", evidenceId);
  }
  window.location.href = "map.html";
}

async function loadCases() {
  try {
    const res = await fetch(`${API}/cases`, {
      headers: { Authorization: "Bearer " + token }
    });

    const cases = await res.json();
    const selector = document.getElementById("caseSelector");
    selector.innerHTML = `<option value="">-- Select Case --</option>`;

    cases.forEach(c => {
      const option = document.createElement("option");
      option.value = c.case_id;
      option.textContent = `${c.case_id} - ${c.case_name}`;
      selector.appendChild(option);
    });

  } catch (err) {
    console.error("Failed to load cases");
  }
}

async function createCase() {
  const case_id = document.getElementById("newCaseId").value.trim();
  const case_name = document.getElementById("newCaseName").value.trim();

  if (!case_id || !case_name) {
    alert("Case ID and name required");
    return;
  }

  try {
    const res = await fetch(`${API}/cases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ case_id, case_name })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to create case");
      return;
    }

    alert("Case created successfully");
    document.getElementById("newCaseId").value = "";
    document.getElementById("newCaseName").value = "";
    loadCases();

  } catch (err) {
    console.error(err);
    alert("Error creating case");
  }
}

async function uploadEvidence() {
  const file = document.getElementById("file").files[0];
  if (!file || !selectedCase) {
    alert("File and Case ID required");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("caseId", selectedCase);

  // Geocode address if provided (officer only)
  const addressInput = document.getElementById("uploadAddress");
  const address = addressInput ? addressInput.value.trim() : "";

  if (address) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const geoData = await geoRes.json();
      if (geoData.length) {
        formData.append("latitude",      geoData[0].lat);
        formData.append("longitude",     geoData[0].lon);
        formData.append("location_name", address);
      } else {
        console.warn("Address not found, uploading without location");
      }
    } catch (e) {
      console.warn("Geocoding failed, uploading without location");
    }
  }

  const uploadRes = await fetch(`${API}/evidence/upload`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData
  });

  document.getElementById("uploadStatus").innerText =
    uploadRes.ok ? "Upload successful" : "Upload failed";

  if (addressInput) addressInput.value = "";
  loadEvidence();
}

async function registerEvidence(id) {
  await fetch(`${API}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ evidenceId: id })
  });
  loadEvidence();
}

async function verifyEvidence(id) {
  const res = await fetch(`${API}/verify`, {
    headers: { Authorization: "Bearer " + token }
  });

  const results = await res.json();
  const result = results.find(r => r.evidenceId === id);

  alert(
    `Stored Hash: ${result.storedHash}\n` +
    `Current Hash: ${result.currentHash}\n` +
    `Status: ${result.status}`
  );

  loadEvidence();
}

function viewFile(id) {
  const url = `${API}/evidence/${id}/view?token=${token}`;
  window.open(url, "_blank");
}

async function analyzeVideo(evidenceId) {
  const card  = document.getElementById("actionAnalysisCard");
  const label = document.getElementById("actionAnalysisLabel");
  const panel = document.getElementById("actionResultPanel");

  card.style.display = "block";
  label.textContent  = `Running action analysis on evidence: ${evidenceId}...`;
  panel.innerHTML    = "Please wait...";
  card.scrollIntoView({ behavior: "smooth" });

  try {
    const res = await fetch(`${API}/analysis/${evidenceId}/video?top_n=5`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    });

    if (res.status === 401 || res.status === 403) {
      alert("Session expired or access denied");
      logout();
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      panel.innerHTML = `<p style="color:red;">Error: ${data.error || "Analysis failed"}</p>`;
      return;
    }

    label.textContent =
      `Evidence: ${data.evidence_id} — Model: ${data.model_used}` +
      ` — Primary action: ${data.primary.action} (${(data.primary.confidence * 100).toFixed(1)}%)`;

    const rows = (data.top_actions || []).map(a => {
      const pct      = (a.confidence * 100).toFixed(1);
      const barWidth = Math.round(a.confidence * 120);
      return `
        <tr>
          <td>${a.rank}</td>
          <td>${a.forensic_tag}</td>
          <td style="color:#555; font-size:12px;">${a.raw_label}</td>
          <td>
            <span class="conf-bar-wrap">
              <span class="conf-bar" style="width:${barWidth}px;"></span>
            </span>
            &nbsp;${pct}%
          </td>
        </tr>
      `;
    }).join("");

    panel.innerHTML = `
      <table>
        <thead>
          <tr><th>#</th><th>Forensic tag</th><th>Raw label</th><th>Confidence</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

  } catch (err) {
    console.error("analyzeVideo error:", err);
    panel.innerHTML = `<p style="color:red;">Request failed. Is the server running?</p>`;
  }
}

async function performSemanticSearch() {
  const query  = document.getElementById("searchQuery").value.trim();
  const caseId = selectedCase;

  if (!query) { alert("Please enter search text"); return; }

  const container = document.getElementById("searchResults");
  container.innerHTML = "Searching...";

  try {
    const response = await fetch(`${API}/search/semantic-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ query, caseId: caseId || null })
    });

    if (response.status === 401 || response.status === 403) {
      alert("Session expired");
      logout();
      return;
    }

    const data = await response.json();
    displaySearchResults(data.results);

  } catch (err) {
    console.error("Search error:", err);
    container.innerHTML = "Search failed.";
  }
}

function displaySearchResults(results) {
  const container = document.getElementById("searchResults");
  container.innerHTML = "";

  if (!Array.isArray(results) || results.length === 0) {
    container.innerHTML = "<p>No relevant matches found.</p>";
    return;
  }

  const table = document.createElement("table");
  table.classList.add("search-results-table");
  table.innerHTML = `
    <thead>
      <tr><th>ID</th><th>Case</th><th>Type</th><th>Score</th><th>Action</th></tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  results.forEach(r => {
    const score = r.final_score ?? 0;
    let scoreClass = "similarity-low";
    if (score > 0.5) scoreClass = "similarity-high";
    else if (score > 0.3) scoreClass = "similarity-medium";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${r.evidence_id}</td>
      <td>${r.case_id}</td>
      <td>${r.type}</td>
      <td class="${scoreClass}">${score.toFixed(4)}</td>
      <td><button onclick="viewFile('${r.evidence_id}')">View</button></td>
    `;
    tbody.appendChild(row);
  });

  container.appendChild(table);
}

document.getElementById("uploadBtn")?.addEventListener("click", uploadEvidence);

loadCases();

async function loadReports() {
  const evidenceId = document.getElementById("analysisEvidenceId").value;
  if (!evidenceId) { alert("Enter Evidence ID"); return; }

  try {
    const res  = await fetch(`${API}/analysis/${evidenceId}/reports`, {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    const container = document.getElementById("reportsContainer");
    container.innerHTML = "";

    if (!data.reports || data.reports.length === 0) {
      container.innerHTML = "No reports found.";
      return;
    }

    data.reports.forEach(r => {
      const div = document.createElement("div");
      div.style.border        = "1px solid #ccc";
      div.style.padding       = "8px";
      div.style.marginBottom  = "10px";
      div.innerHTML = `
        <strong>${r.report_title}</strong><br>
        <strong>Findings:</strong> ${r.findings}<br>
        <strong>Conclusion:</strong> ${r.conclusion || "N/A"}<br>
        <strong>Confidence:</strong> ${r.confidence_level || "N/A"}<br>
        <small>By: ${r.username || "Unknown"} | ${new Date(r.created_at).toLocaleString()}</small>
      `;
      container.appendChild(div);
    });

  } catch (err) {
    console.error(err);
    alert("Failed to load reports");
  }
}

async function createReport() {
  const evidenceId       = document.getElementById("analysisEvidenceId").value;
  const report_title     = document.getElementById("reportTitle").value;
  const findings         = document.getElementById("findings").value;
  const conclusion       = document.getElementById("conclusion").value;
  const confidence_level = document.getElementById("confidenceLevel").value;

  if (!evidenceId || !report_title || !findings) {
    alert("Evidence ID, title and findings required");
    return;
  }

  try {
    const res = await fetch(`${API}/analysis/${evidenceId}/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ report_title, findings, conclusion, confidence_level })
    });

    const data = await res.json();
    if (!res.ok) { alert(data.error || "Failed to create report"); return; }

    alert("Report created successfully");
    document.getElementById("reportTitle").value    = "";
    document.getElementById("findings").value       = "";
    document.getElementById("conclusion").value     = "";
    document.getElementById("confidenceLevel").value = "";
    loadReports();

  } catch (err) {
    console.error(err);
    alert("Error creating report");
  }
}

window.registerEvidence    = registerEvidence;
window.verifyEvidence      = verifyEvidence;
window.viewFile            = viewFile;
window.performSemanticSearch = performSemanticSearch;
window.createCase          = createCase;
window.createReport        = createReport;
window.loadReports         = loadReports;
window.analyzeVideo        = analyzeVideo;