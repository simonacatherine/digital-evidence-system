const axios = require("axios");
const pool = require("../config/db");

exports.semanticSearch = async (req, res) => {
  try {
    const { query, caseId } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query text is required" });
    }

    const queryLower = query.toLowerCase().trim();

    // word normalization
    const normalizeWord = (word) => {
      if (!word) return "";
      word = word.toLowerCase().trim();

      // basic plural normalization
      if (word.endsWith("s") && word.length > 3) {
        return word.slice(0, -1);
      }

      return word;
    };

    const normalizedQuery = normalizeWord(queryLower);

    // get embeddings
    const [docResponse, clipResponse] = await Promise.all([
      axios.post("http://localhost:8000/embed-document", { text: query }),
      axios.post("http://localhost:8000/embed-text-clip", { text: query })
    ]);

    const docEmbeddingRaw = docResponse.data.embedding;
    const clipEmbeddingRaw = clipResponse.data.embedding;

    if (!docEmbeddingRaw || docEmbeddingRaw.length !== 384) {
      return res.status(500).json({ error: "Invalid document embedding" });
    }

    if (!clipEmbeddingRaw || clipEmbeddingRaw.length !== 512) {
      return res.status(500).json({ error: "Invalid CLIP embedding" });
    }

    const docEmbedding = `[${docEmbeddingRaw.join(",")}]`;
    const clipEmbedding = `[${clipEmbeddingRaw.join(",")}]`;

    // build vector queries
    const buildQuery = (type, embeddingField, limit, extraFields = "") => {
      let sql = `
        SELECT 
          evidence_id,
          case_id,
          ${extraFields}
          1 - (${embeddingField} <=> $1) AS similarity,
          '${type}' as type
        FROM evidence
        WHERE status = 'REGISTERED'
        AND ${embeddingField} IS NOT NULL
        AND file_type = '${type === "DOCUMENT" ? "TEXT" : type}'
      `;

      const values = [type === "DOCUMENT" ? docEmbedding : clipEmbedding];

      if (caseId) {
        sql += ` AND case_id = $2`;
        values.push(caseId);
      }

      sql += `
        ORDER BY ${embeddingField} <=> $1
        LIMIT ${limit}
      `;

      return { sql, values };
    };

    const docQuery = buildQuery("DOCUMENT", "text_embedding", 40, "chunk_text,");
    const imgQuery = buildQuery("IMAGE", "embedding", 20, "detected_objects,");
    const videoQuery = buildQuery("VIDEO", "embedding", 20, "video_metadata,");

    const [docResults, imgResults, videoResults] = await Promise.all([
      pool.query(docQuery.sql, docQuery.values),
      pool.query(imgQuery.sql, imgQuery.values),
      pool.query(videoQuery.sql, videoQuery.values)
    ]);

    // combine results
    const combined = [
      ...docResults.rows,
      ...imgResults.rows,
      ...videoResults.rows
    ];

    combined.forEach(r => {
      r.similarity = Number(r.similarity) || 0;
    });

    // hybrid scoring
    const SEMANTIC_WEIGHT = 0.65;
    const OBJECT_WEIGHT = 0.35;

    combined.forEach(r => {

      let objectScore = 0;

      // image object match
      if (r.type === "IMAGE" && r.detected_objects) {

        const match = r.detected_objects.some(obj =>
          normalizeWord(obj) === normalizedQuery
        );

        if (match) objectScore = 1;
      }

      // video metadata match
      if (r.type === "VIDEO" && r.video_metadata) {
        try {
          const metadata = typeof r.video_metadata === "string"
            ? JSON.parse(r.video_metadata)
            : r.video_metadata;

          const events = Array.isArray(metadata) ? metadata : [metadata];

          const match = events.some(event =>
            event.label &&
            normalizeWord(event.label) === normalizedQuery
          );

          if (match) objectScore = 1;

        } catch {}
      }

      // final score
      r.final_score =
        (SEMANTIC_WEIGHT * r.similarity) +
        (OBJECT_WEIGHT * objectScore);

    });

    combined.sort((a, b) => b.final_score - a.final_score);

    // audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action)
       VALUES ($1, $2)`,
      [req.user.id, "SEMANTIC_SEARCH"]
    );

    return res.json({
      query,
      caseId: caseId || null,
      results: combined.slice(0, 5)
    });

  } catch (err) {
    console.error("SEMANTIC SEARCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};