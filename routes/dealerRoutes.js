const express = require("express");
const { addDealer, getDealer, isDealerVerified, editDealer, verifyAllDealers } = require("../controllers/dealerControllers");
const router = express.Router();
const { userAuth, dealerAuth } = require("../middlewares/authMiddlewares");

router.post("/add-dealer", addDealer);
router.get("/get-dealer", dealerAuth, getDealer);
router.put("/edit-dealer", dealerAuth, editDealer);

router.get("/is-dealer-verified", dealerAuth, isDealerVerified);
router.put("/verify-all-dealers", verifyAllDealers);

module.exports = router;