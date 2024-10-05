const { Schema, model } = require("mongoose");

const dealerListTseWise = new Schema(
  {},
  {
    strict: false,
  }
);


module.exports = model("DealerListTseWise", dealerListTseWise);
