const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");
const tableBody = document.getElementById("evidenceTable");

const API = "http://localhost:5000";

uploadBtn.addEventListener("click", async () => {
  const fileInput = document.getElementById("evidenceFile");
  const caseIdInput = document.getElementById("caseId");

  if(!fileInput.files[0] || !caseIdInput.value){
    uploadStatus.textContent = "Please select a file and enter Case ID";
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  formData.append("caseId", caseIdInput.value);

  uploadStatus.textContent = "Uploading...";

  try{
    const response = await fetch(`${API}/upload`,{
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    uploadStatus.textContent =
      "Uploaded successfully. Evidence ID: " + data.evidenceId;

    fileInput.value = "";
    caseIdInput.value = "";

    loadEvidence();
  }catch{
    uploadStatus.textContent = "Upload failed";
  }
});

async function loadEvidence(){
  tableBody.innerHTML = "";

  try{
    const res = await fetch(`${API}/verify`);
    const records = await res.json();
    renderTable(records);
  }catch (err){
    console.error("Failed to load evidence", err);
  }
}

function renderTable(records){
  tableBody.innerHTML = "";

  records.forEach((r) => {
    const row = document.createElement("tr");

    const status = r.status;

    let statusClass = "status-NOT";
    if (status === "VERIFIED") statusClass = "status-VERIFIED";
    if (status === "TAMPERED") statusClass = "status-TAMPERED";

    row.innerHTML = `
      <td>${r.evidenceId}</td>
      <td>${r.caseId}</td>
      <td class="${statusClass}">${status}</td>
      <td></td>
    `;

    const actionCell = row.querySelector("td:last-child");

    if(status === "NOT REGISTERED"){
      const btn = document.createElement("button");
      btn.textContent = "Register";
      btn.onclick = () => registerEvidence(r.evidenceId);
      actionCell.appendChild(btn);
    }

    if(status !== "NOT REGISTERED"){
      const verifyBtn = document.createElement("button");
      verifyBtn.textContent = "Verify";
      verifyBtn.style.marginLeft = "6px";
      verifyBtn.onclick = () => verifyEvidence(r.evidenceId);
      actionCell.appendChild(verifyBtn);
    }

    if(r.status !== "NOT REGISTERED"){
      const viewBtn = document.createElement("button");
      viewBtn.textContent = "View / Download";
      viewBtn.style.marginLeft = "6px";
      viewBtn.onclick = () => {
        window.open(`${API}/evidence/${r.evidenceId}/view`, "_blank");
      };
      actionCell.appendChild(viewBtn);
    }

    tableBody.appendChild(row);
  });
}

async function registerEvidence(evidenceId){
  try{
    const res = await fetch(`${API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId }),
    });

    const data = await res.json();
    alert(`Evidence registered\nBlock: ${data.blockNumber}`);

    loadEvidence();
  }catch{
    alert("Registration failed");
  }
}

async function verifyEvidence(evidenceId){
  try{
    const res = await fetch(`${API}/verify`);
    const results = await res.json();

    const result = results.find(r => r.evidenceId === evidenceId);
    if (!result) return alert("Verification failed");

    alert(
      `Verification Result\n\n` +
      `Stored Hash: ${result.storedHash}\n` +
      `Current Hash: ${result.currentHash}\n` +
      `Status: ${result.status}`
    );

    loadEvidence();
  }catch{
    alert("Verification failed");
  }
}

loadEvidence();