const pool = require("../config/db");

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

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action)
       VALUES ($1, $2)`,
      [analystId, "CREATE_ANALYSIS_REPORT"]
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


// get reports for evidence

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


// update report

exports.updateReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { report_title, findings, conclusion, confidence_level } = req.body;

    const analystId = req.user.id;

    // Ensure report belongs to this analyst
    const existing = await pool.query(
      `SELECT * FROM analysis_reports
       WHERE report_id = $1`,
      [reportId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    const report = existing.rows[0];

    if (report.analyst_id !== analystId) {
      return res.status(403).json({
        error: "You can only edit your own reports"
      });
    }

    const updated = await pool.query(
      `UPDATE analysis_reports
       SET report_title = $1,
           findings = $2,
           conclusion = $3,
           confidence_level = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE report_id = $5
       RETURNING *`,
      [
        report_title || report.report_title,
        findings || report.findings,
        conclusion || report.conclusion,
        confidence_level || report.confidence_level,
        reportId
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action)
       VALUES ($1, $2)`,
      [analystId, "UPDATE_ANALYSIS_REPORT"]
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