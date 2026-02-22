const API = "http://localhost:5000";
const token = localStorage.getItem("token");

if (!token) window.location.href = "login.html";

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

async function createUser() {

  const username = document.getElementById("newUser").value;
  const password = document.getElementById("newPass").value;
  const role = document.getElementById("newRole").value;

  await fetch(`${API}/admin/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ username, password, role })
  });

  alert("User created");
}

async function loadLogs() {

  const res = await fetch(`${API}/admin/audit-logs`, {
    headers: { Authorization: "Bearer " + token }
  });

  const logs = await res.json();
  const table = document.getElementById("logs");
  table.innerHTML = "";

  logs.forEach(l => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${l.user_id}</td>
      <td>${l.action}</td>
      <td>${l.evidence_id || "-"}</td>
      <td>${l.timestamp}</td>
    `;
    table.appendChild(row);
  });
}

document.getElementById("createUserBtn").addEventListener("click", createUser);

loadLogs();
