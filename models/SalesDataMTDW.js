const { Schema, model } = require("mongoose");

const salesDataSchemaMTDW = new Schema(
  {},
  {
    strict: false,
  }
);

// const Data = mongoose.model("Data", dataSchema);

module.exports = model("SalesDataMTDW", salesDataSchemaMTDW);
