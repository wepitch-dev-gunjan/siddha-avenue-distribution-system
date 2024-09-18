const express = require("express");
const { addDealer, getDealer, isDealerVerified, editDealer, verifyAllDealers, registerDealersFromSalesData, deleteDuplicateDealers } = require("../controllers/dealerControllers");
const router = express.Router();
const { userAuth, dealerAuth } = require("../middlewares/authMiddlewares");

router.post("/add-dealer", addDealer);
router.get("/get-dealer", dealerAuth, getDealer);
router.put("/edit-dealer", dealerAuth, editDealer);

router.get("/is-dealer-verified", dealerAuth, isDealerVerified);
router.put("/verify-all-dealers", verifyAllDealers);
router.post("/register-dealers-from-sales-data", registerDealersFromSalesData);

// delete duplicate dealers w dealer code 
router.delete("/delete-dupe-dealers-w-dealer-code", deleteDuplicateDealers);

module.exports = router;