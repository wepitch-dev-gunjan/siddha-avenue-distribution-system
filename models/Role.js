const { Schema, model } = require('mongoose');

const roleSchema = new Schema({
  name: {
    type: String,
  },
  parent: [{
    type: Schema.Types.ObjectId,
    ref: 'Role'
  }],
  children: [{
    type: Schema.Types.ObjectId,
    ref: 'Role'
  }]
});

module.exports = model('Role', roleSchema);