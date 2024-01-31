const express = require("express");
const { createAttendance, getAttendance, getAttendances, editAttendance, deleteAttendance } = require("../controllers/attendanceController");
const { userAuth, adminAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/", userAuth, createAttendance);
router.get("/attendance/:id", userAuth, getAttendance);
router.get("/attendance", userAuth, getAttendances);
router.put("/attendance/:id", userAuth, adminAuth, editAttendance);
router.delete("attendance/:id", userAuth, adminAuth, deleteAttendance);

module.exports = router;
