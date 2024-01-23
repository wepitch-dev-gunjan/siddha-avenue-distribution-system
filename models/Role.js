const { Schema, model } = require('mongoose');

const roleSchema = new Schema({
  name: {
    type: String,
  },
  parents: [{
    type: Schema.Types.ObjectId,
    ref: 'Role'
  }],
  children: [{
    type: Schema.Types.ObjectId,
    ref: 'Role'
  }]
}, {
  timestamps: true
}, {
  strict: false
});

module.exports = model('Role', roleSchema);