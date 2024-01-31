const Attendance = require("../models/Attendance");

exports.createAttendance = async (req, res) => {
  try {
    const { location, address, date, duration, punched_in, punched_out } =
      req.body;

    const attendance = await Attendance.findOne({ _id });
    if (attendance) {
      return res.status(400).json({ message: "Attendance already marked" });
    }

    attendance.location = location;
    attendance.address = address;
    attendance.date = date;
    attendance.duration = duration;
    attendance.punched_in = punched_in;
    attendance.punched_out = punched_out;

    await attendance.save();

    return res.status(201).json({ message: "Attendance marked successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getAttendance = async (req, res) => {
  try {
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getAttendances = async (req, res) => {
  try {
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.editAttendance = async (req, res) => {
  try {
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
