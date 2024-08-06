const { Schema, model } = require("mongoose");

const ChannelTargetSchema = new Schema(
  {},
  {
    strict: false,
  }
);

module.exports = model("Channel Target", ChannelTargetSchema);
