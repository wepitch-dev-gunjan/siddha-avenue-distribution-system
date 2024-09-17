const express = require("express");
const router = express.Router();
const { upload } = require("../services/fileUpload");
const { uploadMarketTrackerData, getMarketTrackerDataForAdmins } = require("../controllers/marketTrackerController");
const { userAuth } = require("../middlewares/authMiddlewares");

router.post("/market-tracker", userAuth, upload.single("file"), uploadMarketTrackerData);
router.get("/market-tracker/admin", getMarketTrackerDataForAdmins);

module.exports = router;
