const express = require("express");
const { uploadSalesData, getSalesDataChannelWise, getSalesDataSegmentWise } = require("../controllers/salesDataController");
const { upload } = require("../services/fileUpload");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/sales", upload.single("file"), uploadSalesData);
router.get("/sales/channel-wise", getSalesDataChannelWise);
router.get("/sales/segment-wise", getSalesDataSegmentWise);

module.exports = router;