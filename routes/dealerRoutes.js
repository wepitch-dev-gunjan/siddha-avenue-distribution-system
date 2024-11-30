const express = require("express");
const { addDealer, getDealer, isDealerVerified, editDealer, verifyAllDealers, registerDealersFromSalesData, deleteDuplicateDealers, capitalizeDealerCodes, updateDealerCategoryFromCSV, addDefaultAddressToDealers } = require("../controllers/dealerControllers");
const router = express.Router();
const { userAuth, dealerAuth } = require("../middlewares/authMiddlewares");
const { upload } = require("../services/fileUpload");

router.post("/add-dealer", addDealer);
router.get("/get-dealer", dealerAuth, getDealer);
router.put("/edit-dealer", dealerAuth, editDealer);

router.get("/is-dealer-verified", dealerAuth, isDealerVerified);
router.put("/verify-all-dealers", verifyAllDealers);
router.post("/register-dealers-from-sales-data", registerDealersFromSalesData);

// delete duplicate dealers w dealer code 
router.delete("/delete-dupe-dealers-w-dealer-code", deleteDuplicateDealers);

// capitalize all dealer codes 
router.put("/capitalize-all-dealer-codes", capitalizeDealerCodes);

// Update dealer category from csv 
router.put("/update-dealer-categories", upload.single("file"), updateDealerCategoryFromCSV);

// Update dealer addresses
router.put("/add-default-address-to-dealers", addDefaultAddressToDealers);

module.exports = router;