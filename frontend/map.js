const API   = "http://localhost:5000";
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) window.location.href = "login.html";
document.getElementById("roleDisplay").textContent = "Logged in as: " + role;

if (role === "INVESTIGATING_OFFICER" || role === "ADMIN") {
  document.getElementById("updatePanel").style.display = "block";
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

const map = L.map("map").setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19
}).addTo(map);

function getIcon(fileType, status) {
  const colors = { VIDEO: "#1a73e8", IMAGE: "#188038", TEXT: "#c5221f" };
  const color  = colors[fileType] || "#555";
  const border = status === "TAMPERED" ? "#c5221f"
               : status === "VERIFIED" ? "#188038"
               : "#f0a500";

  return L.divIcon({
    className: "",
    html: `<div style="
      width:14px; height:14px; border-radius:50%;
      background:${color}; border:3px solid ${border};
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize:    [14, 14],
    iconAnchor:  [7, 7],
    popupAnchor: [0, -10]
  });
}

let markers    = [];
let pathLine   = null;
let showPath   = false;
let allRecords = [];

function clearMap() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
}

function renderMap(records) {
  clearMap();
  allRecords = records;

  const located = records.filter(r => r.latitude != null && r.longitude != null);
  const list    = document.getElementById("evidenceList");

  if (located.length === 0) {
    list.innerHTML = "<p class='no-location'>No evidence with location data for this case.</p>";
    return;
  }

  list.innerHTML = "";
  const bounds   = [];

  located.forEach(r => {
    const lat = parseFloat(r.latitude);
    const lng = parseFloat(r.longitude);
    bounds.push([lat, lng]);

    const marker = L.marker([lat, lng], { icon: getIcon(r.file_type, r.status) })
      .addTo(map)
      .bindPopup(`
        <strong>${r.location_name || "Evidence location"}</strong><br>
        <small>ID: ${r.evidence_id}</small><br>
        Type: ${r.file_type || "—"}<br>
        Status: ${r.status}<br>
        ${r.detected_action ? "Action: " + r.detected_action : ""}
      `);

    markers.push(marker);

    const card = document.createElement("div");
    card.className = "evidence-card";
    card.innerHTML = `
      <div class="eid">${r.evidence_id}</div>
      <div class="loc">${r.location_name || lat.toFixed(4) + ", " + lng.toFixed(4)}</div>
      <span class="badge badge-${(r.file_type || "").toLowerCase()}">${r.file_type || "—"}</span>
      <span class="badge badge-${
        r.status === "VERIFIED"  ? "verified"  :
        r.status === "TAMPERED"  ? "tampered"  : "pending"
      }">${r.status}</span>
      ${r.detected_action ? `<div style="margin-top:4px;color:#555;">Action: ${r.detected_action}</div>` : ""}
    `;
    card.onclick = () => { map.setView([lat, lng], 16); marker.openPopup(); };
    list.appendChild(card);
  });

  if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
  if (showPath) drawPath(located);
}

function drawPath(records) {
  if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
  const coords = records.map(r => [parseFloat(r.latitude), parseFloat(r.longitude)]);
  if (coords.length > 1) {
    pathLine = L.polyline(coords, {
      color: "#4a6cf7", weight: 2, dashArray: "6 4", opacity: 0.8
    }).addTo(map);
  }
}

function togglePath() {
  showPath = !showPath;
  const btn = document.getElementById("pathToggle");
  btn.classList.toggle("active", showPath);
  btn.textContent = showPath ? "Hide Movement Path" : "Show Movement Path";

  const located = allRecords.filter(r => r.latitude != null && r.longitude != null);
  if (showPath) drawPath(located);
  else if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
}

// =========================
// LOAD CASES
// =========================
async function loadCases() {
  try {
    const res   = await fetch(`${API}/cases`, {
      headers: { Authorization: "Bearer " + token }
    });
    const cases = await res.json();
    const sel   = document.getElementById("caseSelector");
    sel.innerHTML = `<option value="">-- Select Case --</option>`;
    cases.forEach(c => {
      const o       = document.createElement("option");
      o.value       = c.case_id;
      o.textContent = `${c.case_id} - ${c.case_name}`;
      sel.appendChild(o);
    });
  } catch (err) { console.error("loadCases:", err); }
}

async function loadMapEvidence() {
  const caseId = document.getElementById("caseSelector").value;
  if (!caseId) { clearMap(); return; }

  try {
    const res     = await fetch(`${API}/evidence?caseId=${caseId}`, {
      headers: { Authorization: "Bearer " + token }
    });
    const records = await res.json();
    renderMap(records);
  } catch (err) { console.error("loadMapEvidence:", err); }
}

async function geocodeSearch() {
  const query = document.getElementById("searchAddress").value.trim();
  if (!query) return;

  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();

    if (!data.length) { alert("Address not found"); return; }

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    map.setView([lat, lng], 15);
    L.marker([lat, lng])
      .addTo(map)
      .bindPopup(`<strong>Searched:</strong> ${data[0].display_name}`)
      .openPopup();

    document.getElementById("upLat").value = lat;
    document.getElementById("upLng").value = lng;

  } catch (err) {
    console.error("geocode:", err);
    alert("Geocoding failed");
  }
}

async function saveLocation() {
  const evidenceId = document.getElementById("upEvidenceId").value.trim();
  const address    = document.getElementById("upAddress").value.trim();
  let   lat        = document.getElementById("upLat").value;
  let   lng        = document.getElementById("upLng").value;
  const statusEl   = document.getElementById("upStatus");

  if (!evidenceId) { statusEl.textContent = "Evidence ID required"; return; }

  if (address && (!lat || !lng)) {
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (!data.length) { statusEl.textContent = "Address not found"; return; }
      lat = data[0].lat;
      lng = data[0].lon;
    } catch {
      statusEl.textContent = "Geocoding failed";
      return;
    }
  }

  if (!lat || !lng) { statusEl.textContent = "Provide address or coordinates"; return; }

  try {
    const res = await fetch(`${API}/evidence/${evidenceId}/location`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization:  "Bearer " + token
      },
      body: JSON.stringify({
        latitude:      parseFloat(lat),
        longitude:     parseFloat(lng),
        location_name: address || null
      })
    });

    const data = await res.json();

    if (!res.ok) { statusEl.textContent = data.error || "Failed to save"; return; }

    statusEl.textContent = "Location saved successfully";
    document.getElementById("upEvidenceId").value = "";
    document.getElementById("upAddress").value    = "";
    document.getElementById("upLat").value        = "";
    document.getElementById("upLng").value        = "";

    loadMapEvidence();

  } catch (err) {
    console.error("saveLocation:", err);
    statusEl.textContent = "Request failed";
  }
}

// Click map to set coordinates in update panel
map.on("click", (e) => {
  if (role !== "INVESTIGATING_OFFICER" && role !== "ADMIN") return;
  document.getElementById("upLat").value = e.latlng.lat.toFixed(6);
  document.getElementById("upLng").value = e.latlng.lng.toFixed(6);
});

loadCases();

// Pre-fill evidence ID if coming from dashboard
const focusId = localStorage.getItem("mapFocusEvidence");
if (focusId) {
  document.getElementById("upEvidenceId").value = focusId;
  localStorage.removeItem("mapFocusEvidence");
}