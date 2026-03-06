const { registerEvidence } = require("../../src/registerEvidence");
const pool = require("../config/db");

exports.registerEvidence = async (req, res) => {
   try {
        const { evidenceId } = req.body;
   
        const result = await registerEvidence(evidenceId);
   
        await pool.query(
          `UPDATE evidence
           SET status = 'REGISTERED'
           WHERE evidence_id = $1`,
           [evidenceId]
        );
   
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, evidence_id)
           VALUES ($1, $2, $3)`,
          [req.user.id, "REGISTER", evidenceId]
        );
   
        res.json({
          evidenceId: result.evidenceId,
          hashSHA256: result.hashSHA256,
          blockNumber: result.blockNumber
        });
   
    }catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};