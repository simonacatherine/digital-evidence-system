const router = require("express").Router();
const { authenticate } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { registerEvidence } = require("../controllers/registerController");

const ROLES = require("../config/roles");

router.post(
  "/",
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INVESTIGATING_OFFICER]),
  registerEvidence
);

module.exports = router;