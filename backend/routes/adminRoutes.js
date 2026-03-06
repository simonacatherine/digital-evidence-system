const router = require("express").Router();

const { authenticate } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { createUser, getAuditLogs } = require("../controllers/adminController");

const ROLES = require("../config/roles");

router.post(
  "/create-user",
  authenticate,
  authorize([ROLES.ADMIN]),
  createUser
);

router.get(
  "/audit-logs",
  authenticate,
  authorize([ROLES.ADMIN]),
  getAuditLogs
);

module.exports = router;