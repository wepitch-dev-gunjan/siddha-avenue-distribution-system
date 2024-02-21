const express = require("express");
const { uploadData } = require("../controllers/dataController");
const { upload } = require("../services/fileUpload");
const router = express.Router();

router.post("/upload", upload.single("file"), uploadData);

module.exports = router;
