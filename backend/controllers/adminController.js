const pool = require("../config/db");
const bcrypt = require("bcrypt");

exports.createUser = async (req, res) => {
   const { username, password, role } = req.body;

    try {
      if (!Object.values(ROLES).includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const hash = await bcrypt.hash(password, 10);

      await pool.query(
        `INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, $3)`,
        [username, hash, role]
      );

      await pool.query(
        `INSERT INTO audit_logs (user_id, action)
         VALUES ($1, $2)`,
        [req.user.id, "CREATE_USER"]
      );

      res.json({ message: "User created successfully" });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error creating user" });
    }
};

exports.getAuditLogs = async (req, res) => {
   try {
      const logs = await pool.query(
        `SELECT * FROM audit_logs ORDER BY timestamp DESC`
      );
      res.json(logs.rows);
    } catch (err) {
      res.status(500).json({ error: "Error fetching logs" });
    }
};