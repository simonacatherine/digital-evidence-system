const API = "http://localhost:5000";
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

window.registerEvidence = registerEvidence;
window.verifyEvidence = verifyEvidence;
window.viewFile = viewFile;
window.performSemanticSearch = performSemanticSearch;

if (!token) window.location.href = "login.html";

document.getElementById("roleDisplay").innerText =
  "Logged in as: " + role;

if (role !== "INVESTIGATING_OFFICER") {
  document.getElementById("uploadSection").style.display = "none";
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

// load evidence table
async function loadEvidence() {
  try {
    const res = await fetch(`${API}/verify`, {
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

      if (
        role === "INVESTIGATING_OFFICER" &&
        r.status === "NOT REGISTERED"
      ) {
        actions += `<button onclick="registerEvidence('${r.evidenceId}')">Register</button>`;
      }

      if (r.status !== "NOT REGISTERED") {
        actions += `<button onclick="viewFile('${r.evidenceId}')">View</button>`;
        actions += `<button onclick="verifyEvidence('${r.evidenceId}')">Verify</button>`;
      }

      row.innerHTML = `
        <td>${r.evidenceId}</td>
        <td>${r.caseId}</td>
        <td>${r.status}</td>
        <td>${actions}</td>
      `;

      table.appendChild(row);
    });

  } catch (err) {
    console.error("Load error:", err);
  }
}

// upload
async function uploadEvidence() {
  const file = document.getElementById("file").files[0];
  const caseId = document.getElementById("caseId").value;

  if (!file || !caseId) {
    alert("File and Case ID required");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("caseId", caseId);

  await fetch(`${API}/upload`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData
  });

  document.getElementById("uploadStatus").innerText =
    "Upload successful";

  loadEvidence();
}

// register
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

// verify
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

// view file
async function viewFile(id) {
  const res = await fetch(`${API}/evidence/${id}/view`, {
    headers: { Authorization: "Bearer " + token }
  });

  if (res.status === 403) {
    alert("Access denied");
    return;
  }

  const blob = await res.blob();
  window.open(URL.createObjectURL(blob));
}

// semantic seaarch
async function performSemanticSearch() {
  const query = document.getElementById("searchQuery").value.trim();
  const caseId = document.getElementById("searchCaseId").value.trim();

  if (!query) {
    alert("Please enter search text");
    return;
  }

  const container = document.getElementById("searchResults");
  container.innerHTML = "Searching...";

  try {
    const response = await fetch(`${API}/semantic-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        query,
        caseId: caseId || null
      })
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

// display search results
function displaySearchResults(results) {
  const container = document.getElementById("searchResults");
  container.innerHTML = "";

  if (!results || results.length === 0) {
    container.innerHTML = "<p>No relevant matches found.</p>";
    return;
  }

  // Similarity threshold
  const filtered = results.filter(r => r.similarity > 0.20);

  if (filtered.length === 0) {
    container.innerHTML = "<p>No strong matches found.</p>";
    return;
  }

  const table = document.createElement("table");
  table.classList.add("search-results-table");

  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Case</th>
        <th>Type</th>
        <th>Similarity</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  filtered.forEach(r => {
    const row = document.createElement("tr");

    let similarityClass = "similarity-low";
    if (r.similarity > 0.5) similarityClass = "similarity-high";
    else if (r.similarity > 0.3) similarityClass = "similarity-medium";

    row.innerHTML = `
      <td>${r.evidence_id}</td>
      <td>${r.case_id}</td>
      <td>${r.type}</td>
      <td class="${similarityClass}">
        ${parseFloat(r.similarity).toFixed(4)}
      </td>
      <td>
        <button onclick="viewFile('${r.evidence_id}')">View</button>
      </td>
    `;

    tbody.appendChild(row);

    const detailRow = document.createElement("tr");
    const detailCell = document.createElement("td");
    detailCell.colSpan = 5;
    detailCell.style.background = "#f9f9f9";
    detailCell.style.padding = "10px";

    let detailsHTML = "";

    // Show matched sentence for documents
    if (r.chunk_text) {
      detailsHTML += `
        <strong>Matched Text:</strong>
        <div style="margin-top:5px;color:#444">
          ${r.chunk_text}
        </div>
      `;
    }

    // Show detected objects for images
    if (r.detected_objects && r.detected_objects.length > 0) {
      detailsHTML += `
        <strong>Detected Objects:</strong>
        <div style="margin-top:5px;color:#444">
          ${r.detected_objects.join(", ")}
        </div>
      `;
    }

    if (detailsHTML !== "") {
      detailCell.innerHTML = detailsHTML;
      detailRow.appendChild(detailCell);
      tbody.appendChild(detailRow);
    }

  });

  container.appendChild(table);
}

document
  .getElementById("uploadBtn")
  ?.addEventListener("click", uploadEvidence);

loadEvidence();