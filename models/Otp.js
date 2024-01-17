const { Schema, model } = require('mongoose');

const otpSchema = new Schema({
  phone_number: {
    type: Number,
    unique: true,
    sparse: true, // Allow multiple documents that have the same null or undefined value
  },
  hashedOtp: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
}, {
  strict: false,
});

// Custom validation to check uniqueness for non-null values
otpSchema.path('phone_number').validate(async function (value) {
  if (value !== null) {
    const count = await this.model('Otp').countDocuments({ phone_number: value, _id: { $ne: this._id } });
    return !count;
  }
  return true;
}, 'Phone number must be unique except for null values.');

module.exports = model('Otp', otpSchema);
