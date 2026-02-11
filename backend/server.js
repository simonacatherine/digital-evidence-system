const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { ethers } = require("ethers");

const { registerEvidence } = require("../src/registerEvidence");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const BASE_DIR = path.join(__dirname, "..");
const EVIDENCE_DIR = path.join(BASE_DIR, "data", "evidence");
const RECORDS_DIR = path.join(BASE_DIR, "data", "records");

if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
if (!fs.existsSync(RECORDS_DIR)) fs.mkdirSync(RECORDS_DIR, { recursive: true });

app.post("/upload", upload.single("file"), (req, res) => {
  try{
    const evidenceId = crypto.randomUUID();
    const caseId = req.body.caseId;
    const uploaderId = "INV-001";

    const storedPath = path.join(
      EVIDENCE_DIR,
      `${evidenceId}_${req.file.originalname}`
    );

    fs.renameSync(req.file.path, storedPath);

    const record = {
      evidenceId,
      caseId,
      uploaderId,
      timestamp: new Date().toISOString(),
      storagePath: storedPath,
      status: "NOT REGISTERED"
    };

    fs.writeFileSync(
      path.join(RECORDS_DIR, `${evidenceId}.json`),
      JSON.stringify(record, null, 2)
    );

    res.json(record);
  }catch (err){
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/register", async (req, res) => {
  try{
    const { evidenceId } = req.body;

    const result = await registerEvidence(evidenceId);

    res.json({
      evidenceId: result.evidenceId,
      hashSHA256: result.hashSHA256,
      blockNumber: result.blockNumber
    });
  }catch (err){
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/evidence", (req, res) => {
  if(!fs.existsSync(RECORDS_DIR)){
    return res.json([]);
  }

  const files = fs.readdirSync(RECORDS_DIR);
  const records = files.map((f) =>
    JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, f)))
  );

  res.json(records);
});

app.get("/verify", async (req, res) => {
  const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

  const abi = [
    "function getEvidence(string evidenceId) view returns (tuple(string evidenceHash,string caseId,string uploaderId,uint256 timestamp))"
  ];

  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  const files = fs.readdirSync(RECORDS_DIR);
  const results = [];

  for(const file of files){
    const record = JSON.parse(
      fs.readFileSync(path.join(RECORDS_DIR, file))
    );

    let status = "NOT REGISTERED";
    let storedHash = null;
    let currentHash = null;

    try{
      const onChain = await contract.getEvidence(record.evidenceId);
      storedHash = onChain.evidenceHash;

      const data = fs.readFileSync(record.storagePath);
      currentHash = crypto.createHash("sha256").update(data).digest("hex");

      status = storedHash === currentHash ? "VERIFIED" : "TAMPERED";
    }catch{
      status = "NOT REGISTERED";
    }

    results.push({
      evidenceId: record.evidenceId,
      caseId: record.caseId,
      storedHash,
      currentHash,
      status
    });
  }

  res.json(results);
});


app.get("/evidence/:id/view", (req, res) => {
  try {
    const evidenceId = req.params.id;
    const recordPath = path.join(RECORDS_DIR, `${evidenceId}.json`);

    if (!fs.existsSync(recordPath)) {
      return res.status(404).send("Evidence not found");
    }

    const record = JSON.parse(fs.readFileSync(recordPath));
    const filePath = path.resolve(record.storagePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File missing");
    }

    res.sendFile(filePath, {
      headers: {
        "Content-Disposition": `inline; filename="${path.basename(filePath)}"`
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error viewing evidence");
  }
});



const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
