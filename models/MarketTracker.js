const { Schema, model } = require("mongoose");

const MarketTracker = new Schema(
  {},
  {
    strict: false,
  }
);


module.exports = model("MarketTracker", MarketTracker);