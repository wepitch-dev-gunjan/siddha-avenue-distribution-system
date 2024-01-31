const { Schema, model } = require('mongoose');

const attendenceSchema = new Schema({
  location: {
    lat
  },
  address: {
    type: String
  },
  date: {
    type: Date
  },
  duration: {
    type: Number
  },
  punched_in: Boolean,
  punched_out: Boolean
}, {
  timestamps: true,
  strict: false
})

module.exports = model('Attendence', attendenceSchema);