const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const evidenceRoutes = require("./routes/evidenceRoutes");
const searchRoutes = require("./routes/searchRoutes");
const adminRoutes = require("./routes/adminRoutes");
const verifyRoutes = require("./routes/verifyRoutes");
const registerRoutes = require("./routes/registerRoutes");
const analysisRoutes = require("./routes/analysisRoutes");
const caseRoutes = require("./routes/caseRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/evidence", evidenceRoutes);
app.use("/search", searchRoutes);
app.use("/admin", adminRoutes);
app.use("/verify", verifyRoutes);
app.use("/register", registerRoutes);
app.use("/analysis", analysisRoutes);
app.use("/cases", caseRoutes);

module.exports = app;