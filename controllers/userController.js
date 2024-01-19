const bcrypt = require('bcrypt');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Otp = require('../models/Otp');
const crypto = require('crypto');
require('dotenv').config();
const { JWT_SECRET } = process.env;

const { client, smsCallback, messageType } = require('../services/smsService');
const Role = require('../models/Role');

exports.register = async (req, res) => {
  try {
    const { username, phone_number, role } = req.body;

    // Check if the phone number already exists
    const user = await User.findOne({ phone_number });
    if (!existingUser) {
      return res.status(400).json({ message: 'No user found' });
    }

    user.username = username;
    user.verified = true;
    user.role = role;

    // Save the user to the database
    await user.save();

    const existingRole = await Role.findOne({ _id: role });
    if (!existingRole) return res.status(400).json({
      error: 'Role not found'
    })

    // Generate JWT token
    const token = jwt.sign({ user_id: user._id, name: user.name, phone_number: user.phone_number }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        name: user.name,
        phone_number: user.phone_number,
        role: existingRole.name
      },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.query;

    // Check if the user exists
    const user = await User.findOne({ name: username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username' });
    }

    // Successful login
    const token = jwt.sign({ user_id: user._id, name: user.name, phone_number: user.phone_number }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: 'User logged in successfully',
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getUser = async (req, res) => {
  try {
    const { user_id } = req;

    // Fetch user details from the database
    const user = await User.findOne({ _id: user_id });
    const roleObj = await Role.findOne({ _id: user.role });
    const role = roleObj?.name ? roleObj.name : 'No role assigned yet';

    const response = {
      name: user.name,
      phone_number: user.phone_number,
      role
    }
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { role, search } = req.query;
    const query = {};

    if (role) query.role = role;

    // Use a regular expression for case-insensitive search on both name and email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Fetch user details from the database
    const users = await User.find(query);
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.generateOtpByPhone = async (req, res) => {
  try {
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).send({ error: "Phone number is required" });

    // Generate a random 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Hash the OTP using SHA-256 for storage
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    const expirationTime = new Date(); // Set the expiration time (e.g., 5 minutes from now)
    expirationTime.setMinutes(expirationTime.getMinutes() + 5);

    let otpObj = await Otp.findOne({ phone_number });
    if (otpObj) {
      otpObj.expiresAt = expirationTime;
      otpObj.hashedOtp = hashedOtp;
      otpObj.attempts = 0;
    } else {
      otpObj = new Otp({
        phone_number,
        hashedOtp,
        expiresAt: expirationTime,
      });
    }

    await otpObj.save();

    const message = `OTP for log in is : ${otp}`;
    client.sms.message(smsCallback, phone_number, message, messageType)
    // Send the OTP to the client (avoid logging it)
    res.status(200).send({
      message: "OTP sent to the client",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Internal server error" });
  }
};

exports.verifyOtpByPhone = async (req, res) => {
  try {
    const { phone_number, otp } = req.body;

    let otpObj = await Otp.findOne({ phone_number });
    if (!otpObj) return res.status(404).send({ error: "Phone number not found" });
    if (otpObj.attempts >= 3 || new Date() > otpObj.expiresAt) {
      // Handle cases where too many attempts or OTP expiration
      return res.status(401).send({ error: "Invalid OTP token" });
    }

    // Hash the received OTP from the client
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    // Verify if the hashed OTP from the client matches the hashed OTP stored in your data storage
    if (hashedOtp !== otpObj.hashedOtp) {
      // Increment the attempts on failed verification
      otpObj.attempts++;
      await otpObj.save();
      return res.status(401).send({ error: "Invalid OTP token" });
    }

    // If OTP is valid, you can proceed with user verification
    let user = await User.findOne({ phone_number });
    if (!user) {
      user = new User({
        phone_number,
        verified: true,
      });

      await user.save();
    }

    const { _id } = user;
    const token = jwt.sign({ _id, phone_number }, JWT_SECRET)

    res.status(200).send({
      message: "User has verified OTP",
      token
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Internal server error" });
  }
};