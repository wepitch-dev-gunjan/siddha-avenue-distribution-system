const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadChannelTargetData } = require("../controllers/channelTargetControllers");
const router = express.Router();


router.put("/channel-targets", upload.single("file"), uploadChannelTargetData);

module.exports = router;