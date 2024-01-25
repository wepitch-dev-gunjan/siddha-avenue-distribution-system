const { Schema, model } = require('mongoose');

const userSchema = new Schema({
  name: {
    type: String,
  },
  phone_number: {
    type: String,
  },
  verified: {
    type: Boolean,
    default: false
  },
  role: {
    type: Schema.Types.ObjectId,
    ref: 'Role'
  },
  parents: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
}, {
  strict: false
});

module.exports = model('User', userSchema);