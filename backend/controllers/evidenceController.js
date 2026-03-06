const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const pool = require("../config/db");

const BASE_DIR = path.join(__dirname, "..", "..");
const EVIDENCE_DIR = path.join(BASE_DIR, "data", "evidence");

exports.uploadEvidence = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const evidenceId = crypto.randomUUID();
    const caseId = req.body.caseId;
    if (!caseId) {
      return res.status(400).json({ error: "Case ID required" });
    }

    // Ensure case exists
    const caseCheck = await pool.query(
      "SELECT case_id FROM cases WHERE case_id = $1",
      [caseId]
    );

    if (caseCheck.rows.length === 0) {
      return res.status(400).json({ error: "Invalid case ID" });
    }
    const originalName = req.file.originalname || "";

    const ext = path.extname(originalName).toLowerCase();
    const storedPath = path.join(
      EVIDENCE_DIR,
      `${evidenceId}_${originalName}`
    );

    fs.renameSync(req.file.path, storedPath);

    const isTextFile = ext.endsWith(".txt");
    const isVideoFile =
      ext === ".mp4" || ext === ".avi" || ext === ".mov";

    // text
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
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
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

    // video
    else if (isVideoFile) {
      const videoResponse = await axios.post(
        "http://localhost:8000/analyze-video",
        { video_path: storedPath }
      );

      const detections = videoResponse.data.detections || [];
      const clipEmbeddingRaw = videoResponse.data.clip_embedding;

      const videoEmbedding = `[${clipEmbeddingRaw.join(",")}]`;

      await pool.query(
        `INSERT INTO evidence
        (evidence_id, case_id, uploader_id, storage_path, status, video_metadata, embedding, file_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          evidenceId,
          caseId,
          req.user.id,
          storedPath,
          "NOT_REGISTERED",
          JSON.stringify(detections),
          videoEmbedding,
          "VIDEO"
        ]
      );
    }

    // image
    else {
      const aiResponse = await axios.post(
        "http://localhost:8000/embed-image",
        { image_path: storedPath }
      );

      const rawEmbedding = aiResponse.data.embedding;
      const imageEmbedding = `[${rawEmbedding.join(",")}]`;

      const yoloResponse = await axios.post(
        "http://localhost:8000/detect-objects",
        { image_path: storedPath }
      );

      const detectedObjects = yoloResponse.data.objects || [];

      await pool.query(
        `INSERT INTO evidence
        (evidence_id, case_id, uploader_id, storage_path, status, embedding, detected_objects, file_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
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

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, evidence_id)
       VALUES ($1,$2,$3)`,
      [req.user.id, "UPLOAD", evidenceId]
    );

    res.json({ evidenceId, caseId, status: "NOT_REGISTERED" });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getEvidenceList = async (req, res) => {
  try {
    const { caseId } = req.query;

    let result;

    if (caseId) {
      result = await pool.query(
        "SELECT * FROM evidence WHERE case_id = $1",
        [caseId]
      );
    } else {
      result = await pool.query(
        "SELECT * FROM evidence"
      );
    }
    let records = result.rows;

    if (
      req.user.role !== "ADMIN" &&
      req.user.role !== "INVESTIGATING_OFFICER"
    ) {
      records = records.filter(
        r => r.status === "REGISTERED"
      );
    }

    res.json(records);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.viewEvidence = async (req, res) => {
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
      req.user.role !== "ADMIN" &&
      req.user.role !== "INVESTIGATING_OFFICER" &&
      record.status !== "REGISTERED"
    ) {
      return res.status(403).send("Access denied");
    }

    if (!fs.existsSync(record.storage_path)) {
      return res.status(404).send("File missing");
    }

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, evidence_id)
       VALUES ($1,$2,$3)`,
      [req.user.id, "VIEW", id]
    );

    const filePath = path.resolve(record.storage_path);
    const ext = path.extname(filePath).toLowerCase();

    // video stream
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

    // non video
    let contentType = "application/octet-stream";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    if (ext === ".png") contentType = "image/png";
    if (ext === ".txt") contentType = "text/plain";

    res.setHeader("Content-Type", contentType);
    res.sendFile(filePath);

  } catch (err) {
    res.status(500).send("Error viewing evidence");
  }
};