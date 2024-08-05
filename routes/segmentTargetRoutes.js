const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadSegmentTargetData } = require("../controllers/segmentTargetControllers");
const router = express.Router();


router.put("/segment-targets", upload.single("file"), uploadSegmentTargetData);

module.exports = router;