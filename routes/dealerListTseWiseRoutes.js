const express = require("express");
const router = express.Router();
const { upload } = require("../services/fileUpload");
const { uploadDealerListTseWise, updateDealerListWithSalesData } = require("../controllers/dealerListTseWiseController");

router.post("/dealer-list-tse-wise", upload.single("file"), uploadDealerListTseWise);
router.put("/mapping-update-dealers", updateDealerListWithSalesData);

module.exports = router;