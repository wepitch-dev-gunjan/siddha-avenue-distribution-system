const { Schema, model } = require("mongoose");

const dataSchema = new Schema(
  {},
  {
    strict: false,
  }
);

// const Data = mongoose.model("Data", dataSchema);

module.exports = model("Data", dataSchema);
