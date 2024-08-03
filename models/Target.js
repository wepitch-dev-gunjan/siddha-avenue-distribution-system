const { Schema, model } = require("mongoose");

const TargetSchema = new Schema(
  {},
  {
    strict: false,
  }
);

// const Data = mongoose.model("Data", dataSchema);

module.exports = model("Target", TargetSchema);
