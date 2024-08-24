const express = require("express");
const { addDealer, getDealer } = require("../controllers/dealerControllers");
const router = express.Router();
const { userAuth, dealerAuth } = require("../middlewares/authMiddlewares");

router.post("/add-dealer", addDealer)
router.get("/get-dealer", dealerAuth, getDealer)

module.exports = router;