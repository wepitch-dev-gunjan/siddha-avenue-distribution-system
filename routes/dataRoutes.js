const express = require("express");
const { uploadData, getData } = require("../controllers/dataController");
const { upload } = require("../services/fileUpload");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/upload", userAuth, upload.single("file"), uploadData);
router.get("/upload", userAuth, getData);

module.exports = router;
