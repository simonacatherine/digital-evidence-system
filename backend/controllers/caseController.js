const pool = require("../config/db");

exports.getAllCases = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM cases ORDER BY created_at DESC"
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch cases" });
  }
};

exports.createCase = async (req, res) => {
  try {
    const { case_id, case_name } = req.body;

    if (!case_id || !case_name) {
      return res.status(400).json({ error: "Case ID and name required" });
    }

    await pool.query(
      "INSERT INTO cases (case_id, case_name) VALUES ($1, $2)",
      [case_id, case_name]
    );

    res.json({ message: "Case created successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create case" });
  }
};