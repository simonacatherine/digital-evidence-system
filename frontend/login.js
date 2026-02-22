const API = "http://localhost:5000";

document.getElementById("loginBtn").addEventListener("click", async () => {

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (!data.token) {
    document.getElementById("error").innerText = "Invalid credentials";
    return;
  }

  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.role);

  if (data.role === "ADMIN") {
    window.location.href = "admin.html";
  } else {
    window.location.href = "dashboard.html";
  }
});
