const { Schema, model } = require("mongoose");

const SegmentTargetSchema = new Schema(
  {},
  {
    strict: false,
  }
);

// const Data = mongoose.model("Data", dataSchema);

module.exports = model("Segment Target", SegmentTargetSchema);
