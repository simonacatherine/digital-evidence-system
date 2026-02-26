const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { ethers } = require("ethers");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");


const { registerEvidence } = require("../src/registerEvidence");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const BASE_DIR = path.join(__dirname, "..");
const EVIDENCE_DIR = path.join(BASE_DIR, "data", "evidence");

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const ROLES = {
  INVESTIGATING_OFFICER: "INVESTIGATING_OFFICER",
  FORENSIC_ANALYST: "FORENSIC_ANALYST",
  PUBLIC_PROSECUTOR: "PUBLIC_PROSECUTOR",
  DEFENCE_ADVOCATE: "DEFENCE_ADVOCATE",
  JUDGE: "JUDGE",
  ADMIN: "ADMIN"
};

// login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({ token, role: user.role });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// auth
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  let token;

  if (authHeader) {
    token = authHeader.split(" ")[1];
  } else if (queryToken) {
    token = queryToken;
  } else {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

function authorize(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

// admin create user 
app.post(
  "/admin/create-user",
  authenticate,
  authorize([ROLES.ADMIN]),
  async (req, res) => {
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
  }
);

// admin view audit
app.get(
  "/admin/audit-logs",
  authenticate,
  authorize([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const logs = await pool.query(
        `SELECT * FROM audit_logs ORDER BY timestamp DESC`
      );
      res.json(logs.rows);
    } catch (err) {
      res.status(500).json({ error: "Error fetching logs" });
    }
  }
);

// uploads
app.post(
  "/upload",
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INVESTIGATING_OFFICER]),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const evidenceId = crypto.randomUUID();
      const caseId = req.body.caseId;
      const originalName = req.file.originalname || "";

      const ext = path
        .extname(originalName)
        .toLowerCase()
        .replace(/\s/g, "");

      const storedPath = path.join(
        EVIDENCE_DIR,
        `${evidenceId}_${originalName}`
      );

      fs.renameSync(req.file.path, storedPath);

      console.log("Detected extension:", ext);

      const isTextFile = ext.endsWith(".txt");
      const isVideoFile =
        ext === ".mp4" || ext === ".avi" || ext === ".mov";

      /* ================= TEXT FILE ================= */
      if (isTextFile) {

        const textContent = fs.readFileSync(storedPath, "utf-8");

        const sentences = textContent
          .split(/[.!?]\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 20);

        for (const sentence of sentences) {

          const aiResponse = await axios.post(
            "http://localhost:8000/embed-document",
            { text: sentence }
          );

          const rawEmbedding = aiResponse.data.embedding;
          const textEmbedding = `[${rawEmbedding.join(",")}]`;

          await pool.query(
            `INSERT INTO evidence
            (evidence_id, case_id, uploader_id, storage_path, status, text_embedding, chunk_text, file_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              evidenceId,
              caseId,
              req.user.id,
              storedPath,
              "NOT_REGISTERED",
              textEmbedding,
              sentence,
              "TEXT"
            ]
          );
        }

      }

      /* ================= VIDEO FILE ================= */
      else if (isVideoFile) {

        const videoResponse = await axios.post(
          "http://localhost:8000/analyze-video",
          { video_path: storedPath }
        );

        const detections = videoResponse.data.detections || [];

        await pool.query(
          `INSERT INTO evidence
          (evidence_id, case_id, uploader_id, storage_path, status, video_metadata, file_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            evidenceId,
            caseId,
            req.user.id,
            storedPath,
            "NOT_REGISTERED",
            JSON.stringify(detections),
            "VIDEO"
          ]
        );
      }

      /* ================= IMAGE FILE ================= */
      else {

        const aiResponse = await axios.post(
          "http://localhost:8000/embed-image",
          { image_path: storedPath }
        );

        const rawEmbedding = aiResponse.data.embedding;

        if (!rawEmbedding || rawEmbedding.length !== 512) {
          return res.status(500).json({
            error: "Invalid image embedding returned"
          });
        }

        const imageEmbedding = `[${rawEmbedding.join(",")}]`;

        const yoloResponse = await axios.post(
          "http://localhost:8000/detect-objects",
          { image_path: storedPath }
        );

        console.log("YOLO RESPONSE:", yoloResponse.data);

        const detectedObjects = yoloResponse.data.objects || [];

        await pool.query(
          `INSERT INTO evidence
          (evidence_id, case_id, uploader_id, storage_path, status, embedding, detected_objects, file_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            evidenceId,
            caseId,
            req.user.id,
            storedPath,
            "NOT_REGISTERED",
            imageEmbedding,
            detectedObjects,
            "IMAGE"
          ]
        );
      }

      /* ================= AUDIT LOG ================= */
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, evidence_id)
         VALUES ($1, $2, $3)`,
        [req.user.id, "UPLOAD", evidenceId]
      );

      res.json({
        evidenceId,
        caseId,
        status: "NOT_REGISTERED"
      });

    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// register
app.post(
  "/register",
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INVESTIGATING_OFFICER]),
  async (req, res) => {
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

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// evidence list
app.get(
  "/evidence",
  authenticate,
  authorize(Object.values(ROLES)),
  async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM evidence");

      let records = result.rows;

      if (
        req.user.role !== ROLES.ADMIN &&
        req.user.role !== ROLES.INVESTIGATING_OFFICER
      ) {
        records = records.filter(r => r.status === "REGISTERED");
      }

      res.json(records);

    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  }
);

// semantic search (clean weighted scoring)
app.post(
  "/semantic-search",
  authenticate,
  authorize(Object.values(ROLES)),
  async (req, res) => {
    try {
      const { query, caseId } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Query text is required" });
      }

      const queryLower = query.toLowerCase().trim();

      //1. GET DOCUMENT EMBEDDING (384)
      const docResponse = await axios.post(
        "http://localhost:8000/embed-document",
        { text: query }
      );

      const docEmbeddingRaw = docResponse.data.embedding;

      if (!docEmbeddingRaw || docEmbeddingRaw.length !== 384) {
        return res.status(500).json({ error: "Invalid document embedding" });
      }

      const docEmbedding = `[${docEmbeddingRaw.join(",")}]`;

      //2.GET CLIP TEXT EMBEDDING (512)
      const clipResponse = await axios.post(
        "http://localhost:8000/embed-text-clip",
        { text: query }
      );

      const clipEmbeddingRaw = clipResponse.data.embedding;

      if (!clipEmbeddingRaw || clipEmbeddingRaw.length !== 512) {
        return res.status(500).json({ error: "Invalid CLIP embedding" });
      }

      const clipEmbedding = `[${clipEmbeddingRaw.join(",")}]`;

      //3. SEARCH DOCUMENTS
      let docSql = `
        SELECT 
          evidence_id,
          case_id,
          uploader_id,
          storage_path,
          status,
          created_at,
          chunk_text,
          1 - (text_embedding <=> $1) AS similarity,
          'DOCUMENT' as type
        FROM evidence
        WHERE status = 'REGISTERED'
        AND text_embedding IS NOT NULL
      `;

      const docValues = [docEmbedding];

      if (caseId) {
        docSql += ` AND case_id = $2`;
        docValues.push(caseId);
      }

      docSql += `
        ORDER BY text_embedding <=> $1
        LIMIT 10
      `;

      const docResults = await pool.query(docSql, docValues);

      //4. SEARCH IMAGE
      let imgSql = `
        SELECT 
          evidence_id,
          case_id,
          uploader_id,
          storage_path,
          status,
          created_at,
          detected_objects,
          1 - (embedding <=> $1) AS similarity,
          'IMAGE' as type
        FROM evidence
        WHERE status = 'REGISTERED'
        AND embedding IS NOT NULL
      `;

      const imgValues = [clipEmbedding];

      if (caseId) {
        imgSql += ` AND case_id = $2`;
        imgValues.push(caseId);
      }

      imgSql += `
        ORDER BY embedding <=> $1
        LIMIT 10
      `;

      const imgResults = await pool.query(imgSql, imgValues);

      //5. search videos
      let videoSql = `
        SELECT 
          evidence_id,
          case_id,
          uploader_id,
          storage_path,
          status,
          created_at,
          video_metadata,
          0 AS similarity,
          'VIDEO' as type
        FROM evidence
        WHERE status = 'REGISTERED'
        AND video_metadata IS NOT NULL
      `;

      const videoValues = [];

      if (caseId) {
        videoSql += ` AND case_id = $1`;
        videoValues.push(caseId);
      }

      videoSql += ` LIMIT 10`;

      const videoResults = await pool.query(videoSql, videoValues);

      //6. STRUCTURED SCORING
      const combined = [
        ...docResults.rows,
        ...imgResults.rows,
        ...videoResults.rows
      ];

      let maxVideoScore = 0;
      const videoScoreMap = {};

      combined.forEach(r => {
        if (r.type === "VIDEO" && r.video_metadata) {

          let events = [];
          try {
            events = typeof r.video_metadata === "string"
              ? JSON.parse(r.video_metadata)
              : r.video_metadata;
          } catch {}

          const queryWords = queryLower.split(/\s+/);

          let frequency = 0;
          let confidenceSum = 0;

          events.forEach(event => {
            if (event.label && event.confidence) {

              const labelLower = event.label.toLowerCase();

              queryWords.forEach(word => {
                if (labelLower.includes(word) || word.includes(labelLower)) {
                  frequency++;
                  confidenceSum += event.confidence;
                }
              });
            }
          });

          // Avoid divide by zero
          const avgConfidence = frequency > 0
            ? confidenceSum / frequency
            : 0;

          // Weighted internal video score
          const videoScore =
            (0.7 * frequency) +
            (0.3 * avgConfidence * 10);

          videoScoreMap[r.evidence_id] = videoScore;

          if (videoScore > maxVideoScore) {
            maxVideoScore = videoScore;
          }
        }
      });

      const weightedResults = combined.map(r => {

        //1. Semantic score (clamped)
        const semantic_score = r.type === "VIDEO" ? 0 : Math.max(0, r.similarity || 0);

        //2. Keyword exact match (documents only)
        let keyword_score = 0;
        if (
          r.type === "DOCUMENT" &&
          r.chunk_text &&
          r.chunk_text.toLowerCase().includes(queryLower)
        ) {
          keyword_score = 1;
        }

        //3. Object match score (images only)
        let object_score = 0;
        if (
          r.type === "IMAGE" &&
          r.detected_objects &&
          r.detected_objects.some(obj =>
            queryLower.includes(obj.toLowerCase()) ||
            obj.toLowerCase().includes(queryLower)
          )
        ) {
          object_score = 1;
        }

        //4. Object score (videos)
        if (r.type === "VIDEO") {

          const videoScore = videoScoreMap[r.evidence_id] || 0;

          if (maxVideoScore > 0) {
            object_score = videoScore / maxVideoScore;
          }
        }

        //5. Final weighted score
        const final_score =
            0.6 * semantic_score +
            0.3 * object_score +
            0.1 * keyword_score;

        return {
          ...r,
          semantic_score,
          keyword_score,
          object_score,
          final_score
        };
      });

      //6. Sort by final_score descending
      weightedResults.sort((a, b) => b.final_score - a.final_score);

      //7. AUDIT LOG
      await pool.query(
        `INSERT INTO audit_logs (user_id, action)
         VALUES ($1, $2)`,
        [req.user.id, "SEMANTIC_SEARCH"]
      );

      res.json({
        query,
        caseId: caseId || null,
        results: weightedResults.slice(0, 5)
      });

    } catch (err) {
      console.error("SEMANTIC SEARCH ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// verify
app.get(
  "/verify",
  authenticate,
  authorize(Object.values(ROLES)),
  async (req, res) => {
    try {
      const dbEvidence = await pool.query("SELECT * FROM evidence");

      const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
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
  }
);

// view file
app.get(
  "/evidence/:id/view",
  authenticate,
  authorize(Object.values(ROLES)),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        "SELECT * FROM evidence WHERE evidence_id = $1",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).send("Evidence not found");
      }

      const record = result.rows[0];

      if (
        req.user.role !== ROLES.ADMIN &&
        req.user.role !== ROLES.INVESTIGATING_OFFICER &&
        record.status !== "REGISTERED"
      ) {
        return res.status(403).send("Access denied");
      }

      if (!fs.existsSync(record.storage_path)) {
        return res.status(404).send("File missing");
      }

      await pool.query(
        `INSERT INTO audit_logs (user_id, action, evidence_id)
         VALUES ($1, $2, $3)`,
        [req.user.id, "VIEW", id]
      );

      const filePath = path.resolve(record.storage_path);
      const ext = path.extname(filePath).toLowerCase();

      /* ================= VIDEO STREAMING ================= */
      if (ext === ".mp4" || ext === ".mov" || ext === ".avi") {

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        const contentType =
          ext === ".mp4" ? "video/mp4" :
          ext === ".mov" ? "video/quicktime" :
          "video/x-msvideo";

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1]
            ? parseInt(parts[1], 10)
            : fileSize - 1;

          const chunkSize = (end - start) + 1;
          const fileStream = fs.createReadStream(filePath, { start, end });

          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": contentType
          });

          fileStream.pipe(res);

        } else {
          res.writeHead(200, {
            "Content-Length": fileSize,
            "Content-Type": contentType
          });

          fs.createReadStream(filePath).pipe(res);
        }

        return;
      }

      /* ================= NON-VIDEO FILES ================= */
      let contentType = "application/octet-stream";

      if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      if (ext === ".png") contentType = "image/png";
      if (ext === ".txt") contentType = "text/plain";

      res.setHeader("Content-Type", contentType);
      res.sendFile(filePath);

    } catch (err) {
      console.error("VIEW ERROR:", err);
      res.status(500).send("Error viewing evidence");
    }
  }
);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
