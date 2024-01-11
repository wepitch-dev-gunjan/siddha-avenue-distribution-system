const { Schema, model } = require('mongoose');

const userSchema = new Schema({
  name: {
    type: String,
  },
  email: {
    type: String,
  },
  password: {
    type: String,
    // required: true,
  },
  role: {
    type: Schema.Types.ObjectId,
    ref: 'Role'
  }
}, {
  timestamps: true,
}, {
  strict: false
});

module.exports = model('User', userSchema);