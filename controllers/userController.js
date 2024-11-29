const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Otp = require("../models/Otp");
const crypto = require("crypto");
require("dotenv").config();
const { JWT_SECRET } = process.env;
const { token } = require("../middlewares/authMiddlewares");
require("dotenv").config();

const {
  client,
  smsCallback,
  messageType,
  message,
} = require("../services/smsService");
const Role = require("../models/Role");
const { mongoose } = require("mongoose");
const { transporter } = require("../services/forgotPassword");
const { validationResult } = require("express-validator");
const { log } = require("console");
const EmployeeCode = require("../models/EmployeeCode");
const Dealer = require("../models/Dealer");

// Route to change password
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.query;
    const { user_id } = jwt.decode(token, JWT_SECRET);
    const { newPassword, confirmNewPassword } = req.body;
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await User.findOne({ _id: user_id });
    if (!user) return res.status(400).json({ error: "User does not exist" });
    user.password = hashedPassword;
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Internal Server Error" });
  }

  // Update the user's password
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    console.log(email);

    if (!email)
      return res.status(400).send({
        message: "Email is required",
      });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).send({
        message: "User not found",
      });
    // Validate the request parameters
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const token = jwt.sign({ user_id: user._id }, JWT_SECRET);

    const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      to: email,
      subject: "Reset Password",
      html: `
      <body>
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center" bgcolor="#ffffff">
              <table border="0" cellpadding="0" cellspacing="0" width="600">
                <!-- Header Section -->
                <tr>
                  <td align="center" valign="top">
                    <a>
                      <img
                        src="https://sortmycollege.com/wp-content/uploads/2023/05/SORTMYCOLLEGE-12.png"
                        alt=""
                        width="200"
                        height="50"
                      />
                    </a>
                  </td>
                </tr>
  
                <!-- Content Section -->
                <tr>
                  <td align="center">
                    <h1
                      style="
                        font-family: 'Arial', 'Helvetica', sans-serif;
                        font-size: 24px;
                        color: #1f0a68;
                      "
                    >
                      Welcome to
                      <a>
                        Siddha Connect
                      </a>
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p
                      style="
                        font-family: 'Arial', 'Helvetica', sans-serif;
                        font-size: 16px;
                        color: #333;
                      "
                    >
                      Dear ${user.name},<br /><br />
                      <!-- You can insert the OTP dynamically here -->
                      Your link to reset your password is: 
                      <a href=${link} >Click Here</a><br/><br/>
                                            
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "Error sending email" });
      } else {
        console.log("Email sent:", info.response);
        res.json({ message: "Email sent successfully" });
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// exports.register = async (req, res) => {
//   try {
//     const { name, email, password, position } = req.body;

//     let user = await User.findOne({ email });
//     if (user) return res.status(400).json({ message: "User Already Exist" });
//     const hashedPassword = await bcrypt.hash(password, 10);
//     user = new User({
//       name,
//       email,
//       password: hashedPassword,
//       position,
//     });
//     await user.save();
//     const token = jwt.sign(
//       {
//         user_id: user._id,
//         name: user.name,
//         email: user.email,
//         phone_number: user.phone_number,
//         position: user.position,
//       },
//       JWT_SECRET,
//       { expiresIn: "7d" }
//     );
//     return res.status(201).json({
//       message: "user registered successfully",
//       user: { name: user.name, email: user.email, verified: user.verified, position: user.position },
//       token,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// };

exports.register = async (req, res) => {
  try {
    const { email, password, code } = req.body;

    // Step 1: Find user by code
    let user = await User.findOne({ code });
    if (user) return res.status(400).json({ message: "User Already Exist" });

    // Step 2: Find employee by code
    const employee = await EmployeeCode.findOne({ Code: code });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found with the given code" });
    }

    // Step 3: Extract name and position from employee
    const { Name: name, Position: position } = employee;

    // Step 4: Hash password and create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    user = new User({
      name,
      email,
      password: hashedPassword,
      code,
      position,
    });

    await user.save();

    // Step 5: Generate token with role
    const token = jwt.sign(
      {
        user_id: user._id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        position: user.position,
        role: "employee", // Include role in the token payload
        code: user.code
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Step 6: Return success response with role
    return res.status(201).json({
      message: "User registered successfully",
      user: {
        name: user.name,
        email: user.email,
        verified: user.verified,
        position: user.position,
      },
      token,
      role: "employee", // Include the role in the response
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     if (!email || !password)
//       return res.status(404).send({
//         error: "Credentials are required",
//       });

//     // Find the user by email
//     const user = await User.findOne({ email });
//     console.log(user);
//     if (!user) {
//       return res
//         .status(401)
//         .json({ error: " User not  register with this email id" });
//     }

//     const passwordMatch = await bcrypt.compare(password, user.password);
//     if (!passwordMatch) {
//       return res.status(401).json({ error: "Invalid credentials" });
//     }
//     console.log(user);
//     // Successful login
//     const token = jwt.sign(
//       {
//         user_id: user._id,
//         name: user.name,
//         phone_number: user.phone_number,
//         email: user.email,
//         position: user.position,
//       },
//       JWT_SECRET,
//       { expiresIn: "7d" }
//     );
//     res.status(201).json({
//       message: "User logged in successfully",
//       token,
//       verified: user.verified,
//       position: user.position,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// };

exports.login = async (req, res) => {
  try {
    const { role, code, password } = req.body;

    // Validate required fields
    if (!role || !code || !password) {
      return res.status(400).json({ error: "All credentials are required" });
    }

    let user;
    let tokenPayload = {};
    let isSiddhaAdmin = false;

    // Check role and retrieve the appropriate user
    if (role === "employee") {
      // Find the user by code for employee
      user = await User.findOne({ code });
      if (!user) {
        return res.status(401).json({ error: "User not registered with this code" });
      }

      if (user.position === 'OWN' || user.position === 'BM' || user.position === 'MIS' || user.position === 'FIN'){
        isSiddhaAdmin = true;
      }

      // Set token payload for employee
      tokenPayload = {
        user_id: user._id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        position: user.position,
        role: "employee", // Include role in the token payload
        code: user.code,
        is_siddha_admin: isSiddhaAdmin,
      };
    } else if (role === "dealer") {
      // Find the dealer by dealerCode for dealer
      const dealer = await Dealer.findOne({ dealerCode: code });
      if (!dealer) {
        return res.status(401).json({ error: "Dealer not registered with this code" });
      }
      user = dealer; // Assign dealer object to user for consistent handling

      // Set token payload for dealer
      tokenPayload = {
        dealer_id: user._id,
        name: user.owner.name, // Adjust if dealer.owner structure is different
        shopName: user.shopName,
        dealerCode: user.dealerCode,
        role: "dealer", // Include role in the token payload
      };
    } else {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Verify the password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });

    // Send response with role included
    res.status(200).json({
      message: "User logged in successfully",
      token,
      role, // Include the role in the response to differentiate dashboards
      verified: user.verified || false, // Default to true if not present in dealer
      position: user.position || "Dealer", // Default to 'Dealer' for dealers
      is_siddha_admin: isSiddhaAdmin,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getUser = async (req, res) => {
  try {
    const { user_id } = req;

    // Fetch user details from the database
    const user = await User.findOne({ _id: user_id });
    const roleObj = await Role.findOne({ _id: user.role });
    const role = roleObj?.name ? roleObj.name : "No role assigned yet";

    const response = {
      name: user.name,
      phone_number: user.phone_number,
      role: user.position,
      email: user.email,
      verified: user.verified,
    };
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
//abc

exports.editProfile = async (req, res) => {
  try {
    const { user_id } = req;
    const { name, phone_number, role } = req.body;

    const filter = {};
    if (name) filter.name = name;
    if (phone_number) filter.phone_number = phone_number;
    if (role) {
      const getRole = await Role.findOne({ name: role });
      filter.role = getRole._id;
    }

    // Fetch user details from the database
    const user = await User.findOneAndUpdate({ _id: user_id }, filter);

    const response = {
      name,
      phone_number,
      role,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
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
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Fetch user details from the database
    const users = await User.find(query);
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getChildren = async (req, res) => {
  try {
    const { parents } = req.query;
    if (!parents) return res.status(200).send([]);
    console.log("parents : " + parents);
    // Validate and parse the parents parameter
    let parsedParents = [parents];

    if (
      !Array.isArray(parsedParents) ||
      !parsedParents.every((id) => mongoose.Types.ObjectId.isValid(id))
    ) {
    }

    // Find users with parents matching all provided IDs
    const children = await User.find({
      parents: { $in: parsedParents },
    }).lean();
    res.status(200).json(children);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
};

exports.getParents = async (req, res) => {
  try {
    const rolesParam = req.query.roles;

    // Check if rolesParam is not provided or not a string
    if (!rolesParam || typeof rolesParam !== "string") {
      return res.status(400).send({
        error: "roles must be provided as a comma-separated string",
      });
    }

    // Convert the string to an array of role IDs
    const roleIds = rolesParam
      .split(",")
      .map((roleId) => JSON.stringify(roleId));

    // Assuming User is a model representing your users
    const parents = await User.find({ role: { $in: roleIds } });

    res.status(200).send(parents);
  } catch (error) {
    console.log(error);
    res.status(500).send({
      error: "Internal server error",
    });
  }
};

exports.generateOtpByPhone = async (req, res) => {
  try {
    const { phone_number } = req.body;
    if (!phone_number)
      return res.status(400).send({ error: "Phone number is required" });

    // Generate a random 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Hash the OTP using SHA-256 for storage
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

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
    client.sms.message(smsCallback, phone_number, message, messageType);
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
    if (!otpObj)
      return res.status(404).send({ error: "Phone number not found" });
    if (otpObj.attempts >= 3 || new Date() > otpObj.expiresAt) {
      // Handle cases where too many attempts or OTP expiration
      return res.status(401).send({ error: "Invalid OTP token" });
    }

    // Hash the received OTP from the client
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

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
    const token = jwt.sign({ _id, phone_number }, JWT_SECRET);

    res.status(200).send({
      message: "User has verified OTP",
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Internal server error" });
  }
};

exports.getUserForUser = async (req, res) => {
  try {
    const { user_id } = req;

    // Fetch user details from the database
    const user = await User.findOne({ _id: user_id });
    const roleObj = await Role.findOne({ _id: user.role });
    const role = roleObj?.name ? roleObj.name : "No role assigned yet";

    const response = {
      name: user.name,
      phone_number: user.phone_number,
      role: user.position,
      email: user.email,
      verified: user.verified,
      code: user.code
    };
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Utilities
exports.autoUpdateEmployeeCodes = async (req, res) => {
  try {
    // Step 1: Get all users from the database
    const users = await User.find();

    // Step 2: Loop through each user to check and update the 'code' field
    for (let user of users) {
      // If the user already has a 'code', skip to the next user
      if (user.code) continue;

      // Check if user's name exists before converting to lowercase
      if (user.name) {
        // Convert user's name to lowercase for case-insensitive matching
        const userNameLowerCase = user.name.toLowerCase();

        // Step 3: Find the matching employee code by name
        const employee = await EmployeeCode.findOne({
          Name: { $regex: new RegExp(`^${userNameLowerCase}$`, "i") }
        });

        // If an employee with the matching name is found, update the user's 'code' field
        if (employee) {
          user.code = employee.Code;

          // Save the updated user
          await user.save();
        }
      } else {
        console.warn(`User with ID ${user._id} does not have a name defined.`);
      }
    }

    // Step 4: Return a success response
    return res.status(200).json({ message: "Employee codes updated successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.registerAllUsersFromEmployeeCodeDB = async (req, res) => {
  try {
      // Fetch all EmployeeCodes
      const employeeCodes = await EmployeeCode.find({});

      // Counter to track the number of users registered
      let registeredCount = 0;

      // Loop through each EmployeeCode entry
      for (const employee of employeeCodes) {
          const { Name, Position, Code } = employee;

          // Check if the user is already registered by their employee code
          const existingUser = await User.findOne({ code: Code });

          if (!existingUser) {
              // Create a dummy email using the employee code
              const email = `${Code.toLowerCase()}@gmail.com`;

              // Hash the default password '123456'
              const hashedPassword = await bcrypt.hash('123456', 10);

              // Create new user object
              const newUser = new User({
                  name: Name,
                  email: email,
                  password: hashedPassword,
                  code: Code,
                  verified: true,
                  position: Position,
              });

              // Save the new user to the database
              await newUser.save();

              // Increment the counter for registered users
              registeredCount++;
          }
      }

      // Return the response with the count of registered users
      res.status(200).json({ 
          message: 'Users registered successfully from EmployeeCode!',
          registeredCount: registeredCount 
      });
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An error occurred during registration', error });
  }
};
