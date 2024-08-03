const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadTargetData } = require("../controllers/targetControllers");
const router = express.Router();


router.put("/targets", upload.single("file"), uploadTargetData);

module.exports = router;