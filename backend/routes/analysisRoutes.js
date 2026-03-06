const express = require("express");
const router = express.Router();

const analysisController = require("../controllers/analysisController");
const { authenticate } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");

router.use(authenticate);

// Create report
router.post(
  "/:evidenceId/report",
  authorize(["FORENSIC_ANALYST"]),
  analysisController.createReport
);

// Get reports
router.get(
  "/:evidenceId/reports",
  authorize([
    "FORENSIC_ANALYST",
    "INVESTIGATING_OFFICER",
    "PUBLIC_PROSECUTOR",
    "DEFENCE_ADVOCATE",
    "JUDGE",
    "ADMIN"
  ]),
  analysisController.getReportsByEvidence
);

// Update report
router.put(
  "/report/:reportId",
  authorize(["FORENSIC_ANALYST"]),
  analysisController.updateReport
);

module.exports = router;