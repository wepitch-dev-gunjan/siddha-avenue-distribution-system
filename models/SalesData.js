const { Schema, model } = require("mongoose");

const salesDataSchema = new Schema(
  {},
  {
    strict: false,
  }
);

// const Data = mongoose.model("Data", dataSchema);

module.exports = model("SalesData", salesDataSchema);
