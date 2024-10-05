const express = require("express");
const router = express.Router();
const { upload } = require("../services/fileUpload");
const { uploadDealerListTseWise } = require("../controllers/dealerListTseWiseController");

router.post("/dealer-list-tse-wise", upload.single("file"), uploadDealerListTseWise);

module.exports = router;