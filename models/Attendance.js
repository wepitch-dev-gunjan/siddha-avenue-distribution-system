const { Schema, model } = require('mongoose');

const attendanceSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  screenshot: {
    type: String,
    default: "https://www.popsci.com/uploads/2022/03/08/Screen-Shot-2022-03-07-at-3.59.11-PM.png"
  },
  duration: {
    type: Number,
  },
  punch_in: {
    location: {
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      }
    },
    address: {
      type: String
    },
    is_punched_in: {
      type: Boolean,
      default: false,
    },
    time: {
      type: Date,
      default: null,
    }
  },
  punch_out: {
    location: {
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      }
    },
    address: {
      type: String
    },
    is_punched_out: {
      type: Boolean,
      default: false,
    },
    time: {
      type: Date,
      default: null,
    }
  },
}, {
  timestamps: true,
  strict: false
});

// Pre-save hook to calculate duration when punched_out is triggered
attendanceSchema.pre('save', function (next) {
  if (this.isModified('punch_out.is_punched_in')) {
    // Update duration when punch_out.is_punched_in is triggered
    this.duration = this.calculateDuration();
  }
  next();
});

// Custom method to calculate duration
attendanceSchema.methods.calculateDuration = function () {
  const punchInTime = this.punch_in.time;
  const punchOutTime = this.punch_out.time;

  if (punchInTime && punchOutTime) {
    // Calculate the duration in seconds
    const durationInSeconds = Math.floor((punchOutTime - punchInTime) / 1000);
    return durationInSeconds;
  }

  // Return 0 if either punch-in or punch-out time is not available
  return 0;
};

module.exports = model('Attendance', attendanceSchema);
