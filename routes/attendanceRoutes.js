const express = require("express");
const { getAttendance, getAttendances, editAttendance, deleteAttendance, punchIn, punchOut } = require("../controllers/attendanceController");
const { userAuth, adminAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/attendance", userAuth, punchIn);
router.put("/attendance", userAuth, punchOut);
router.get("/attendance/:id", userAuth, getAttendance);
router.get("/attendance", userAuth, getAttendances);
router.put("/attendance/:id", userAuth, adminAuth, editAttendance);
router.delete("attendance/:id", userAuth, adminAuth, deleteAttendance);

module.exports = router;
