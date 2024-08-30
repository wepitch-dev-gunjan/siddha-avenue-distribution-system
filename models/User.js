const { Schema, model } = require("mongoose");

const userSchema = new Schema(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
    },
    password: {
      type: String,
    },
    phone_number: {
      type: String,
    },
    code: {
      type: String,
    },
    verified: {
      type: Boolean,
      default: true,
    },
    position: {
      type: String,
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: "Role",
    },
    parents: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  },
  {
    strict: false,
  }
);

module.exports = model("User", userSchema);
