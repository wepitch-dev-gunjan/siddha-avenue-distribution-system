const express = require("express");
const { addDealer } = require("../controllers/dealerControllers");
const router = express.Router();

router.post("/add-dealer", addDealer)

module.exports = router;