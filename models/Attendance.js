const { Schema, model } = require('mongoose');

const attendanceSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  location: {
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    }
  },
  screenshot: {
    type: String,
    default: "https://www.popsci.com/uploads/2022/03/08/Screen-Shot-2022-03-07-at-3.59.11-PM.png"
  },
  address: {
    type: String
  },
  date: {
    type: Date,
    required: true,
    default: new Date()
  },
  duration: {
    type: Number,
    required: true,
  },
  punch_in: {
    is_punched_out: {
      type: Boolean,
      default: false,
    },
    time: {
      type: Date,
      default: null,
    }
  },
  punch_out: {
    is_punched_in: {
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
  return this.punch_out.time - this.punch_in.time;
};

module.exports = model('Attendance', attendanceSchema);
