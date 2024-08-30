const Dealer = require('../models/Dealer'); // Import the Dealer model
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
require("dotenv").config();
const { JWT_SECRET } = process.env;
const { token } = require("../middlewares/authMiddlewares");
require("dotenv").config();

// exports.addDealer = async (req, res) => {
//   try {
//     const {
//       dealerCode,
//       shopName,
//       shopArea,
//       shopAddress,
//       owner,                   // Nested object with required fields like name and contactNumber
//       anniversaryDate,
//       otherImportantFamilyDates, // Array of objects
//       businessDetails,          // Nested object with typeOfBusiness and yearsInBusiness
//       specialNotes,
//       password                 // Add password field
//     } = req.body;

//     // Basic Validations
//     if (!dealerCode || !shopName || !shopArea || !shopAddress || !owner?.name || !owner?.contactNumber || !password) {
//       return res.status(400).json({ error: 'Please provide all the required fields: dealerCode, shopName, shopArea, shopAddress, owner\'s name, owner\'s contact number, and password.' });
//     }

//     // Check if the dealer code already exists in the database
//     const existingDealer = await Dealer.findOne({ dealerCode });
//     if (existingDealer) {
//       return res.status(400).json({ error: 'Dealer code already exists. Please provide a unique dealer code.' });
//     }

//     // Hash the password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create a new Dealer with all fields
//     const newDealer = new Dealer({
//       dealerCode,
//       shopName,
//       shopArea,
//       shopAddress,
//       owner: {
//         name: owner.name,
//         position: owner.position,                // Optional
//         contactNumber: owner.contactNumber,
//         email: owner.email,                      // Optional
//         homeAddress: owner.homeAddress,          // Optional
//         birthday: owner.birthday,                // Optional
//         wife: {
//           name: owner?.wife?.name,               // Optional
//           birthday: owner?.wife?.birthday        // Optional
//         },
//         children: owner.children || [],          // Optional array
//         otherFamilyMembers: owner.otherFamilyMembers || []  // Optional array
//       },
//       anniversaryDate,                // Optional
//       otherImportantFamilyDates,       // Optional array
//       businessDetails: {
//         typeOfBusiness: businessDetails?.typeOfBusiness,   // Optional
//         yearsInBusiness: businessDetails?.yearsInBusiness, // Optional
//         preferredCommunicationMethod: businessDetails?.preferredCommunicationMethod // Optional
//       },
//       specialNotes,                     // Optional
//       password: hashedPassword           // Store the hashed password
//     });

//     await newDealer.save();

//     // Generate a token
//     const token = jwt.sign(
//       {
//         dealer_id: newDealer._id,
//         dealerCode: newDealer.dealerCode,
//         shopName: newDealer.shopName,
//         ownerName: newDealer.owner.name,
//       },
//       JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     return res.status(200).json({
//       message: 'Dealer added successfully.',
//       data: newDealer,
//       token
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

exports.addDealer = async (req, res) => {
  try {
    const {
      dealerCode,
      shopName,
      shopArea,
      shopAddress,
      owner, // Nested object with required fields like name and contactNumber
      anniversaryDate,
      otherImportantFamilyDates, // Array of objects
      businessDetails, // Nested object with typeOfBusiness and yearsInBusiness
      specialNotes,
      password // Add password field
    } = req.body;

    // Basic Validations
    if (
      !dealerCode ||
      !shopName ||
      !shopArea ||
      !shopAddress ||
      !owner?.name ||
      !owner?.contactNumber ||
      !password
    ) {
      return res.status(400).json({
        error:
          "Please provide all the required fields: dealerCode, shopName, shopArea, shopAddress, owner's name, owner's contact number, and password.",
      });
    }

    // Check if the dealer code already exists in the database
    const existingDealer = await Dealer.findOne({ dealerCode });
    if (existingDealer) {
      return res
        .status(400)
        .json({ error: "Dealer code already exists. Please provide a unique dealer code." });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new Dealer with all fields
    const newDealer = new Dealer({
      dealerCode,
      shopName,
      shopArea,
      shopAddress,
      owner: {
        name: owner.name,
        position: owner.position, // Optional
        contactNumber: owner.contactNumber,
        email: owner.email, // Optional
        homeAddress: owner.homeAddress, // Optional
        birthday: owner.birthday, // Optional
        wife: {
          name: owner?.wife?.name, // Optional
          birthday: owner?.wife?.birthday, // Optional
        },
        children: owner.children || [], // Optional array
        otherFamilyMembers: owner.otherFamilyMembers || [], // Optional array
      },
      anniversaryDate, // Optional
      otherImportantFamilyDates, // Optional array
      businessDetails: {
        typeOfBusiness: businessDetails?.typeOfBusiness, // Optional
        yearsInBusiness: businessDetails?.yearsInBusiness, // Optional
        preferredCommunicationMethod: businessDetails?.preferredCommunicationMethod, // Optional
      },
      specialNotes, // Optional
      password: hashedPassword, // Store the hashed password
    });

    await newDealer.save();

    // Generate a token
    const token = jwt.sign(
      {
        dealer_id: newDealer._id,
        dealerCode: newDealer.dealerCode,
        shopName: newDealer.shopName,
        ownerName: newDealer.owner.name,
        role: "dealer", // Include the role in the token payload
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Dealer added successfully.",
      data: newDealer,
      token,
      role: "dealer", // Include the role in the response
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getDealer = async (req, res) => {
  try {
    const { dealer_id } = req;

    // Validate that dealerCode is provided
    if (!dealer_id) {
      return res.status(400).json({ error: 'Dealer Id not found in the token!' });
    }

    // Find the dealer by dealerCode
    const dealer = await Dealer.findOne({ _id : dealer_id });

    // If dealer is not found
    if (!dealer) {
      return res.status(404).json({ error: 'Dealer not found.' });
    }

    // Return the dealer data excluding the password
    return res.status(200).json({
      message: 'Dealer retrieved successfully.',
      data: {
        dealerCode: dealer.dealerCode,
        shopName: dealer.shopName,
        shopArea: dealer.shopArea,
        shopAddress: dealer.shopAddress,
        owner: dealer.owner,
        anniversaryDate: dealer.anniversaryDate,
        otherImportantFamilyDates: dealer.otherImportantFamilyDates,
        businessDetails: dealer.businessDetails,
        specialNotes: dealer.specialNotes
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.isDealerVerified = async (req, res) => {
  try {
    const { dealer_id } = req;

    // Validate that dealer_id is provided
    if (!dealer_id) {
      return res.status(400).json({ error: 'Dealer Id not found in the token!' });
    }

    // Find the dealer by dealer_id
    const dealer = await Dealer.findOne({ _id: dealer_id });

    // If dealer is not found
    if (!dealer) {
      return res.status(404).json({ error: 'Dealer not found.' });
    }

    // Return the verified status of the dealer
    return res.status(200).json({
      message: 'Dealer verification status retrieved successfully.',
      verified: dealer.verified
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.editDealer = async (req, res) => {
  try {
    const { dealer_id } = req;  // Assuming dealer_id is obtained from the request, e.g., via authentication middleware
    const {
      shopName,
      shopArea,
      shopAddress,
      owner,
      anniversaryDate,
      otherImportantFamilyDates,
      businessDetails,
      specialNotes
    } = req.body;

    // Validate dealer ID
    if (!dealer_id) {
      return res.status(400).json({ error: 'Dealer ID is required.' });
    }

    // Find the dealer by ID
    const dealer = await Dealer.findOne({ _id: dealer_id });

    // If dealer is not found
    if (!dealer) {
      return res.status(404).json({ error: 'Dealer not found.' });
    }

    // Update only the fields that are allowed to be edited
    if (shopName) dealer.shopName = shopName;
    if (shopArea) dealer.shopArea = shopArea;
    if (shopAddress) dealer.shopAddress = shopAddress;
    if (owner) {
      if (owner.name) dealer.owner.name = owner.name;
      if (owner.position) dealer.owner.position = owner.position;
      if (owner.contactNumber) dealer.owner.contactNumber = owner.contactNumber;
      if (owner.email) {
        return res.status(400).json({ error: 'Email cannot be edited.' });
      }
      if (owner.homeAddress) dealer.owner.homeAddress = owner.homeAddress;
      if (owner.birthday) dealer.owner.birthday = owner.birthday;
      if (owner.wife) {
        if (owner.wife.name) dealer.owner.wife.name = owner.wife.name;
        if (owner.wife.birthday) dealer.owner.wife.birthday = owner.wife.birthday;
      }
      if (owner.children) dealer.owner.children = owner.children;
      if (owner.otherFamilyMembers) dealer.owner.otherFamilyMembers = owner.otherFamilyMembers;
    }
    if (anniversaryDate) dealer.anniversaryDate = anniversaryDate;
    if (otherImportantFamilyDates) dealer.otherImportantFamilyDates = otherImportantFamilyDates;
    if (businessDetails) {
      if (businessDetails.typeOfBusiness) dealer.businessDetails.typeOfBusiness = businessDetails.typeOfBusiness;
      if (businessDetails.yearsInBusiness) dealer.businessDetails.yearsInBusiness = businessDetails.yearsInBusiness;
      if (businessDetails.preferredCommunicationMethod) dealer.businessDetails.preferredCommunicationMethod = businessDetails.preferredCommunicationMethod;
    }
    if (specialNotes) dealer.specialNotes = specialNotes;

    // Save the updated dealer information
    await dealer.save();

    return res.status(200).json({
      message: 'Dealer profile updated successfully.',
      data: {
        dealerCode: dealer.dealerCode,
        shopName: dealer.shopName,
        shopArea: dealer.shopArea,
        shopAddress: dealer.shopAddress,
        owner: dealer.owner,
        anniversaryDate: dealer.anniversaryDate,
        otherImportantFamilyDates: dealer.otherImportantFamilyDates,
        businessDetails: dealer.businessDetails,
        specialNotes: dealer.specialNotes
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

