const bcrypt = require('bcrypt');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { JWT_SECRET } = process.env;

exports.register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Check if the user already exists
    const existingUser = await User.findOne({ name: username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create a new user
    const user = new User({
      name: username,
      email,
      password: hashedPassword,
      role
    });

    // Save the user to the database
    await user.save();

    // Generate JWT token
    const token = jwt.sign({ user_id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        name: user.name,
        email: user.email
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
    const { username, password } = req.body;

    // Check if the user exists
    const user = await User.findOne({ name: username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Successful login
    const token = jwt.sign({ user_id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: 'User logged in successfully',
      user: {
        name: user.name,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getUser = async (req, res) => {
  try {
    const { user_id } = req

    // Fetch user details from the database
    const user = await User.findOne({ _id: user_id });
    res.status(200).json(user);
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
