const router = require("express").Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const { authenticate } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const {
  uploadEvidence,
  getEvidenceList,
  viewEvidence
} = require("../controllers/evidenceController");
const ROLES = require("../config/roles");

router.post(
  "/upload",
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INVESTIGATING_OFFICER]),
  upload.single("file"),
  uploadEvidence
);

router.get(
  "/",
  authenticate,
  authorize(Object.values(ROLES)),
  getEvidenceList
);

router.get(
  "/:id/view",
  authenticate,
  authorize(Object.values(ROLES)),
  viewEvidence
);

module.exports = router;