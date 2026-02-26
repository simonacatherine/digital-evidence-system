const fs = require("fs");
const crypto = require("crypto");
const { ethers } = require("ethers");
const pool = require("../backend/db");

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
const RPC_URL = "http://127.0.0.1:8545";

const ABI = [
  "function registerEvidence(string evidenceId,string evidenceHash,string caseId,string uploaderId)",
  "function getEvidence(string evidenceId) view returns (tuple(string evidenceHash,string caseId,string uploaderId,uint256 timestamp))"
];

// Blockchain connection
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = provider.getSigner(0);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

async function registerEvidence(evidenceId) {

  // Fetch evidence from database
  const result = await pool.query(
    "SELECT * FROM evidence WHERE evidence_id = $1",
    [evidenceId]
  );

  if (result.rows.length === 0) {
    throw new Error("Evidence not found in database");
  }

  const record = result.rows[0];

  if (!fs.existsSync(record.storage_path)) {
    throw new Error("Stored evidence file missing");
  }

  // Read file and hash
  const fileData = fs.readFileSync(record.storage_path);
  const hash = crypto.createHash("sha256").update(fileData).digest("hex");

  // Write to blockchain
  const tx = await contract.registerEvidence(
    record.evidence_id,
    hash,
    record.case_id,
    String(record.uploader_id)
  );

  const receipt = await tx.wait();

  // Return data (DB status updated in server.js)
  return {
    evidenceId: record.evidence_id,
    hashSHA256: hash,
    blockNumber: receipt.blockNumber
  };
}

module.exports = { registerEvidence };
