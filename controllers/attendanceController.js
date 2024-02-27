const Attendance = require("../models/Attendance");
const User = require("../models/User");

exports.punchIn = async (req, res) => {
  try {
    const { user_id } = req;
    const { location, address } = req.body;

    // Validations
    console.log(address);
    if (!location || typeof location !== 'object' || !address) {
      return res.status(400).json({ error: 'Invalid location or address provided' });
      
    }

    // Check if the user already has an active attendance (punch_in without punch_out)
    const punchedIn = await Attendance.findOne({
      user: user_id,
      'punch_in.is_punched_in': true,
      'punch_out.is_punched_out': false,
    });

    if (punchedIn) {
      return res.status(400).json({ error: 'You have already punched in. Please punch out before punching in again.' });
    }

    // Create a new Attendance
    const attendance = new Attendance({
      user: user_id,
      punch_in: {
        location,
        address,
        is_punched_in: true,
        time: new Date(),
      },
    });

    await attendance.save();

    return res.status(200).json({
      message: 'Attendance marked successfully.',
      data: attendance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


exports.punchOut = async (req, res) => {
  try {
    const { user_id } = req;
    const { location, address } = req.body;

    // Validations
    if (!location || typeof location !== 'object' || !address) {
      return res.status(400).json({ error: 'Invalid location or address provided' });
    }

    // Find the active attendance record for the user (punch_in without punch_out)
    const activeAttendance = await Attendance.findOne({
      user: user_id,
      'punch_in.is_punched_in': true,
      'punch_out.is_punched_out': false,
    });

    // Check if the user has already punched out
    if (!activeAttendance) {
      return res.status(400).json({ error: 'You have not punched in yet. Please punch in before punching out.' });
    }

    // Update the existing attendance record to mark the punch-out time
    activeAttendance.punch_out = {
      location,
      address,
      is_punched_out: true,
      time: new Date(),
    };

    // Calculate and update the duration
    activeAttendance.duration = activeAttendance.calculateDuration();

    // Save the updated attendance record
    await activeAttendance.save();

    return res.status(200).json({
      message: 'Attendance punched out successfully.',
      data: activeAttendance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const { user_id } = req.params;

    // find user
    const user = await User.findOne({ _id: user_id });
    if (!user) return res.status(404).json({
      error: "User not found"
    })

    // find user in attendance
    const attendance = await Attendance.findOne({ user: user_id });
    if (!attendance) return res.status(404).json({
      error: "Attendance not marked by the user"
    })

    res.status(200).json(attendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getAttendances = async (req, res) => {
  try {
    const { user_id } = req;

    const attendances = await Attendance.find({ user: user_id });
    if (!attendances) return res.status(200).send({
      message: "No attendances marked yet."
    })

    res.status(200).json(attendances);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.editAttendance = async (req, res) => {
  try {
    const { attendance_id } = req.params;
    const { date, location, address, punch_out, punch_in } = req.body;

    let query = {};
    if (date) query.date = date;
    if (location) query.location = location;
    if (address) query.address = address;
    if (punch_out) query.punch_out = punch_out;
    if (punch_in) query.punch_in = punch_in;

    const updatedAttendance = await Attendance.findOneAndUpdate({ _id: attendance_id }, query);
    if (!updatedAttendance) return res.status(400).send({
      error: "Attendance not updated"
    })

    res.status(200).send({
      message: "Attendance updated successfully",
      data: updatedAttendance
    })
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    const { attendance_id } = req.params;

    const attendance = await Attendance.findOneAndDelete({ _id: attendance_id });
    if (!attendance) return res.status(400).send({
      error: "Attendance is not deleted"
    })

    res.status(200).send({
      message: "Attendance deleted successfully",
      data: attendance
    })
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// const getAttendancesInHierarchy = async (children) => {
//   try {
//     if (children.length <= 0) return
//     const users = await User.find({ _id: { $in: children } });

//     const hierarchyPromises = users.map(async (user) => {
//       const attendances = await Attendance.find({ user: user._id });
//       const userAttendances = await getAttendancesInHierarchy(user.children); // Assuming the user schema has a 'children' field containing an array of child IDs
//       return [
//         ...attendances,
//         ...userAttendances,
//       ];
//     });

//     const hierarchyResults = await Promise.all(hierarchyPromises);
//     return hierarchyResults.flat();
//   } catch (error) {
//     console.error(error);
//     throw new Error('Error in fetching attendances in hierarchy');
//   }
// };