const pool = require("../config/db");
const ROLES = require("../config/roles");
const fs = require("fs");
const crypto = require("crypto");
const { ethers } = require("ethers");

exports.verifyAll = async (req, res) => {
  try {
      const { caseId } = req.query;

      let dbEvidence;

      if (caseId) {
        dbEvidence = await pool.query(
          "SELECT * FROM evidence WHERE case_id = $1",
          [caseId]
        );
      } else {
        dbEvidence = await pool.query(
          "SELECT * FROM evidence"
        );
      }
      const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
      const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

      const abi = [
        "function getEvidence(string evidenceId) view returns (tuple(string evidenceHash,string caseId,string uploaderId,uint256 timestamp))"
      ];

      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

      const results = [];

      for (const record of dbEvidence.rows) {
        let status = "NOT REGISTERED";
        let storedHash = null;
        let currentHash = null;

        try {
          const onChain = await contract.getEvidence(record.evidence_id);
          storedHash = onChain.evidenceHash;

          const data = fs.readFileSync(record.storage_path);
          currentHash = crypto.createHash("sha256").update(data).digest("hex");

          status = storedHash === currentHash ? "VERIFIED" : "TAMPERED";
        } catch {
          status = "NOT REGISTERED";
        }

        results.push({
          evidenceId: record.evidence_id,
          caseId: record.case_id,
          storedHash,
          currentHash,
          status
        });
      }

      let filteredResults = results;

      if (
        req.user.role !== ROLES.ADMIN &&
        req.user.role !== ROLES.INVESTIGATING_OFFICER
      ) {
        filteredResults = results.filter(r => r.status !== "NOT REGISTERED");
      }

      await pool.query(
        `INSERT INTO audit_logs (user_id, action)
         VALUES ($1, $2)`,
        [req.user.id, "VERIFY_ALL"]
      );

      res.json(filteredResults);

    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
};