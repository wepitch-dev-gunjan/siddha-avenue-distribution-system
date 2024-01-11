const { Schema, model } = require('mongoose');

const roleSchema = new Schema({
  name: {
    type: String,
  },
});

module.exports = model('Role', roleSchema);