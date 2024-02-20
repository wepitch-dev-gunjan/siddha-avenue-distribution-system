const nodemailer = require("nodemailer");

exports.transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "connectsiddha@gmail.com",
    pass: "lubs wpnf yhwa yllf",
  },
});
