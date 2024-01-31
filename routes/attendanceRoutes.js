const express = require("express");
const { createAttendance, getAttendance, getAttendances, editAttendance, deleteAttendance } = require("../controllers/attendanceController");
const router = express.Router();

router.post("/", createAttendance);
router.get("/attendance/:id", getAttendance);
router.get("/attendance", getAttendances);
router.put("/attendance/:id", editAttendance);
router.delete("attendance/:id", deleteAttendance);

module.exports = router;
