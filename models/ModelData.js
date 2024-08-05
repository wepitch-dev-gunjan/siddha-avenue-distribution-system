const { Schema, model } = require("mongoose");

const ModelDataSchema = new Schema(
  {},
  {
    strict: false,
  }
);


module.exports = model("Model Data", ModelDataSchema);
