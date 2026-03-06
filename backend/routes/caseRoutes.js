const express = require("express");
const router = express.Router();
const caseController = require("../controllers/caseController");
const { authenticate } = require("../middlewares/authMiddleware");

router.get("/", authenticate, caseController.getAllCases);
router.post("/", authenticate, caseController.createCase);

module.exports = router;