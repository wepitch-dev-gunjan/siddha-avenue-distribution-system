const express = require("express");
const { uploadSalesData, getSalesData } = require("../controllers/salesDataController");
const { upload } = require("../services/fileUpload");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/sales", upload.single("file"), uploadSalesData);
router.get("/sales", getSalesData);

module.exports = router;
