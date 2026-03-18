const pool = require("../config/db");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

const AI_SERVER = process.env.AI_SERVER_URL || "http://localhost:8000";

// =============================================================================
// CREATE REPORT
// =============================================================================
exports.createReport = async (req, res) => {
  try {
    const { evidenceId } = req.params;
    const { report_title, findings, conclusion, confidence_level } = req.body;

    if (!report_title || !findings) {
      return res.status(400).json({
        error: "Report title and findings are required"
      });
    }

    const analystId = req.user.id;

    const result = await pool.query(
      `INSERT INTO analysis_reports
       (evidence_id, analyst_id, report_title, findings, conclusion, confidence_level)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        evidenceId,
        analystId,
        report_title,
        findings,
        conclusion || null,
        confidence_level || null
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, evidence_id)
       VALUES ($1, $2, $3)`,
      [analystId, "CREATE_ANALYSIS_REPORT", evidenceId]
    );

    return res.status(201).json({
      message: "Analysis report created successfully",
      report: result.rows[0]
    });

  } catch (err) {
    console.error("CREATE REPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// =============================================================================
// GET REPORTS BY EVIDENCE
// =============================================================================
exports.getReportsByEvidence = async (req, res) => {
  try {
    const { evidenceId } = req.params;

    const result = await pool.query(
      `SELECT ar.*, u.username
       FROM analysis_reports ar
       LEFT JOIN users u ON ar.analyst_id = u.id
       WHERE ar.evidence_id = $1
       ORDER BY ar.created_at DESC`,
      [evidenceId]
    );

    return res.json({
      evidenceId,
      reports: result.rows
    });

  } catch (err) {
    console.error("GET REPORTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// =============================================================================
// UPDATE REPORT
// =============================================================================
exports.updateReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { report_title, findings, conclusion, confidence_level } = req.body;

    const analystId = req.user.id;

    const existing = await pool.query(
      `SELECT * FROM analysis_reports WHERE report_id = $1`,
      [reportId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    const report = existing.rows[0];

    const isOwner = report.analyst_id === analystId;
    const isAdmin = req.user.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: "You can only edit your own reports"
      });
    }

    const updated = await pool.query(
      `UPDATE analysis_reports
       SET report_title      = $1,
           findings          = $2,
           conclusion        = $3,
           confidence_level  = $4,
           updated_at        = CURRENT_TIMESTAMP
       WHERE report_id = $5
       RETURNING *`,
      [
        report_title     || report.report_title,
        findings         || report.findings,
        conclusion       || report.conclusion,
        confidence_level || report.confidence_level,
        reportId
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, evidence_id)
       VALUES ($1, $2, $3)`,
      [analystId, "UPDATE_ANALYSIS_REPORT", report.evidence_id]
    );

    return res.json({
      message: "Report updated successfully",
      report: updated.rows[0]
    });

  } catch (err) {
    console.error("UPDATE REPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// =============================================================================
// ANALYZE VIDEO
// =============================================================================
exports.analyzeVideo = async (req, res) => {
  try {
    const { evidenceId } = req.params;
    const topN = parseInt(req.query.top_n, 10) || 5;

    // 1. Fetch evidence record — correct PK column: evidence_id
    const evidenceResult = await pool.query(
      `SELECT * FROM evidence WHERE evidence_id = $1`,
      [evidenceId]
    );

    if (evidenceResult.rows.length === 0) {
      return res.status(404).json({ error: "Evidence not found" });
    }

    const evidence = evidenceResult.rows[0];

    // 2. Correct column name: storage_path (not file_path)
    const filePath = path.resolve(evidence.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Evidence file not found on disk" });
    }

    // 3. Send to AI server using axios (consistent with rest of project)
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("top_n", String(topN));

    const actionRes = await axios.post(
      `${AI_SERVER}/action-detect`,
      formData,
      { headers: formData.getHeaders() }
    );

    const actionData = actionRes.data;

    // 4. Audit log — evidence_id column exists in your schema
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, evidence_id)
       VALUES ($1, $2, $3)`,
      [req.user.id, "VIDEO_ACTION_ANALYSIS", evidenceId]
    );

    // 5. Return result — no DB update needed, action stored on upload
    return res.json({
      evidence_id: evidenceId,
      model_used:  actionData.model_used,
      top_actions: actionData.top_actions,
      primary: {
        action:     actionData.action,
        raw_label:  actionData.raw_label,
        confidence: actionData.confidence
      }
    });

  } catch (err) {
    console.error("ANALYZE VIDEO ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};