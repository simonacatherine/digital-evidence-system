const router = require("express").Router();

const { authenticate } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { semanticSearch } = require("../controllers/searchController");

const ROLES = require("../config/roles");

router.post(
  "/semantic-search",
  authenticate,
  authorize(Object.values(ROLES)),
  semanticSearch
);

module.exports = router;