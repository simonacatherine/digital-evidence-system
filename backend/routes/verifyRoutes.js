const router = require("express").Router();

const { authenticate } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { verifyAll } = require("../controllers/verifyController");

const ROLES = require("../config/roles");

router.get(
  "/",
  authenticate,
  authorize(Object.values(ROLES)),
  verifyAll
);

module.exports = router;