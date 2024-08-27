const express = require("express");
const { uploadEmployeeCodes } = require("../controllers/employeeCodeController");
const { upload } = require("../services/fileUpload");
const router = express.Router();

router.post("/employee-codes", upload.single("file"), uploadEmployeeCodes);

module.exports = router;