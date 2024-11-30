const Dealer = require('../models/Dealer'); // Import the Dealer model
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
require("dotenv").config();
const { JWT_SECRET } = process.env;
const { token } = require("../middlewares/authMiddlewares");
const SalesDataMTDW = require('../models/SalesDataMTDW');
require("dotenv").config();
const csvParser = require("csv-parser");
const { Readable } = require("stream");


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

    // Validate that dealer_id is provided
    if (!dealer_id) {
      return res.status(400).json({ error: "Dealer Id not found in the token!" });
    }

    // Find the dealer by dealer_id
    const dealer = await Dealer.findOne({ _id: dealer_id });

    // If dealer is not found
    if (!dealer) {
      return res.status(404).json({ error: "Dealer not found." });
    }

    // Return the dealer data excluding the password
    return res.status(200).json({
      message: "Dealer retrieved successfully.",
      data: {
        dealerCode: dealer.dealerCode,
        shopName: dealer.shopName,
        shopArea: dealer.shopArea,
        shopAddress: dealer.shopAddress,
        owner: dealer.owner,
        anniversaryDate: dealer.anniversaryDate,
        otherImportantFamilyDates: dealer.otherImportantFamilyDates,
        businessDetails: dealer.businessDetails,
        specialNotes: dealer.specialNotes,
      },
      role: "dealer", // Include the role in the response
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
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
      verified: dealer.verified,
      role: 'dealer',
      code: dealer.dealerCode,
      name: dealer.owner.name

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
      if (owner.email) dealer.owner.email = owner.email;
      // if (owner.email) {
      //   return res.status(400).json({ error: 'Email cannot be edited.' });
      // }
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

exports.verifyAllDealers = async (req, res) => {
  try {
    // Fetch all dealers
    const dealers = await Dealer.find();

    // Check if dealers exist
    if (!dealers || dealers.length === 0) {
      return res.status(404).json({ error: 'No dealers found.' });
    }

    // Initialize a counter to track the number of newly verified dealers
    let newlyVerifiedCount = 0;

    // Iterate over each dealer to check their verification status
    for (let dealer of dealers) {
      if (dealer.verified === undefined) {
        // If the verified field does not exist, add it and set to verified
        dealer.verified = true;
        await dealer.save();  // Save the changes to the dealer
        newlyVerifiedCount++;
      } else if (!dealer.verified) {
        // If not verified, set to verified
        dealer.verified = true;
        await dealer.save();  // Save the changes to the dealer
        newlyVerifiedCount++;
      }
    }

    return res.status(200).json({
      message: 'All unverified dealers have been verified successfully.',
      totalVerified: newlyVerifiedCount,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Auto fetch and register dealers from sales data MTDW 
exports.registerDealersFromSalesData = async (req, res) => {
  try {
    // Fetch all unique BUYER CODE entries from the sales data (SalesDataMTDW)
    const uniqueDealerCodes = await SalesDataMTDW.distinct("BUYER CODE");

    // Capitalize all dealer codes
    const capitalizedDealerCodes = uniqueDealerCodes.map(code => code.toUpperCase());

    // Fetch existing dealers from the database (those that already have a dealerCode)
    const existingDealers = await Dealer.find({ dealerCode: { $in: capitalizedDealerCodes } });

    // Extract the dealer codes that already exist
    const existingDealerCodes = existingDealers.map(dealer => dealer.dealerCode);

    // Filter out the dealer codes that are not in the existing dealers list
    const newDealerCodes = capitalizedDealerCodes.filter(code => !existingDealerCodes.includes(code));

    // Register new dealers
    let newDealers = [];
    for (const dealerCode of newDealerCodes) {
      // Get the sales entry to fetch shopName (BUYER field) from the sales data
      const salesEntry = await SalesDataMTDW.findOne({ "BUYER CODE": dealerCode });

      if (salesEntry) {
        const shopName = salesEntry.BUYER || "Unknown Shop"; // Default to "Unknown Shop" if no buyer name is found
        const shopArea = "Unknown Area"; // Default value, adjust based on data availability
        const shopAddress = "Unknown Address"; // Default value, adjust based on data availability

        // Owner details from schema
        const owner = {
          name: "Unknown Owner", // Default owner name, adjust if data is available
          position: "Owner", // Default position
          contactNumber: "Unknown Contact", // Default contact number
          email: `${dealerCode.toLowerCase()}@gmail.com`, // Default email as [dealerCode@gmail.com]
          homeAddress: "Unknown Home Address", // Default home address
          birthday: new Date(1970, 0, 1), // Default birthday, adjust if necessary
          wife: {
            name: "", // Optional, default empty
            birthday: null // Optional, default null
          },
          children: [], // Default empty children array
          otherFamilyMembers: [] // Default empty family members array
        };

        // Business details from schema
        const businessDetails = {
          typeOfBusiness: "Unknown", // Default business type
          yearsInBusiness: 0, // Default to 0, as no data available
          preferredCommunicationMethod: "Unknown" // Default value
        };

        // Hash the default password "123456"
        const hashedPassword = await bcrypt.hash("123456", 10);

        // Create a new dealer object with all required fields
        const newDealer = new Dealer({
          dealerCode,
          shopName,
          shopArea, // Required field
          shopAddress, // Required field
          owner, // Owner details
          anniversaryDate: null, // Default null for now
          otherImportantFamilyDates: [], // Default empty array
          businessDetails, // Business details
          specialNotes: "", // No special notes available
          password: hashedPassword, // Password field
          verified: false // Set verified to false initially
        });

        // Save the new dealer in the database
        await newDealer.save();

        // Generate a token for the newly created dealer
        const token = jwt.sign(
          {
            dealer_id: newDealer._id,
            dealerCode: newDealer.dealerCode,
            shopName: newDealer.shopName,
            ownerName: newDealer.owner.name,
            role: "dealer", // Include the role in the token payload
          },
          JWT_SECRET,
          { expiresIn: "7d" } // Token expiry duration
        );

        // Add the new dealer to the response list
        newDealers.push({
          dealer: newDealer,
          token,
          message: "Dealer registered successfully."
        });
      }
    }

    if (newDealers.length > 0) {
      // Return the newly registered dealers and their tokens
      return res.status(200).json({
        message: "New dealers registered successfully.",
        newDealers
      });
    } else {
      return res.status(200).json({
        message: "No new dealers to register."
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.deleteDuplicateDealers = async (req, res) => {
  try {
    // Find all dealer codes that have more than one occurrence
    const duplicateDealers = await Dealer.aggregate([
      {
        $group: {
          _id: "$dealerCode",
          count: { $sum: 1 },
          ids: { $push: "$_id" } // Collecting all dealer IDs with the same dealerCode
        }
      },
      {
        $match: { count: { $gt: 1 } } // Find dealerCodes that occur more than once
      }
    ]);

    // Array to track all deleted dealers and their counts
    let deletedDealersInfo = [];

    // Loop through each duplicate dealerCode group
    for (const dealerGroup of duplicateDealers) {
      // Sort the dealer records by creation date and keep only the oldest one
      const dealers = await Dealer.find({ _id: { $in: dealerGroup.ids } }).sort({ createdAt: 1 });

      // Keep the first (oldest) dealer and delete the rest (most recent ones)
      const dealersToDelete = dealers.slice(1); // Skip the first one
      let deletedCount = 0;

      // Delete the duplicate dealers
      for (const dealer of dealersToDelete) {
        await Dealer.findByIdAndDelete(dealer._id); // Delete each duplicate dealer
        deletedCount += 1;
      }

      // Add the details of the deleted dealers, including the count
      deletedDealersInfo.push({
        dealerCode: dealerGroup._id,
        totalDuplicates: dealerGroup.count,
        deletedDuplicates: deletedCount
      });
    }

    if (deletedDealersInfo.length > 0) {
      return res.status(200).json({
        message: "Duplicate dealers deleted successfully.",
        deletedDealersInfo // Include the details of the deleted dealers with counts
      });
    } else {
      return res.status(200).json({
        message: "No duplicate dealers found."
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.capitalizeDealerCodes = async (req, res) => {
  try {
    // Find all dealers where the dealerCode is not already in uppercase
    const dealers = await Dealer.find({});

    let updatedDealers = [];
    let updatedCount = 0;

    for (const dealer of dealers) {
      const originalDealerCode = dealer.dealerCode;

      // Check if dealerCode is not capitalized
      if (originalDealerCode !== originalDealerCode.toUpperCase()) {
        // Capitalize the dealerCode
        dealer.dealerCode = originalDealerCode.toUpperCase();

        // Save the updated dealer entry
        await dealer.save();

        updatedDealers.push({
          _id: dealer._id,
          oldDealerCode: originalDealerCode,
          newDealerCode: dealer.dealerCode
        });

        // Increment count of updated dealer codes
        updatedCount += 1;
      }
    }

    if (updatedDealers.length > 0) {
      return res.status(200).json({
        message: "Dealer codes capitalized successfully.",
        updatedCount: updatedCount, // Include the count of updated dealer codes
        updatedDealers
      });
    } else {
      return res.status(200).json({
        message: "All dealer codes are already capitalized.",
        updatedCount: 0
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.updateDealerCategoryFromCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    let csvData = [];

    if (req.file.originalname.endsWith(".csv")) {
      // Create a readable stream from the uploaded CSV buffer
      const stream = new Readable();
      stream.push(req.file.buffer);
      stream.push(null);

      // Parse CSV and collect rows in memory
      stream
        .pipe(csvParser())
        .on("data", (data) => {
          csvData.push(data);
        })
        .on("end", async () => {
          try {
            // Fetch all dealers from the database
            const dealers = await Dealer.find({});

            // Initialize counters
            let matchedCount = 0;
            let totalDealers = dealers.length;

            // Process each dealer to update their category
            for (const dealer of dealers) {
              const csvRow = csvData.find(row => row['dealerCode'] === dealer.dealerCode);

              if (csvRow) {
                // Update the category from the CSV
                dealer.dealerCategory = csvRow['category'];
                matchedCount++; // Increase count for matched dealers
              } else {
                // If dealerCategory is missing, or if not found in CSV, set it to 'N/A'
                if (!dealer.dealerCategory || dealer.dealerCategory === '') {
                  dealer.dealerCategory = 'N/A';
                }
              }

              // Save updated dealer info
              await dealer.save();
            }

            // Return the result with counts
            return res.status(200).send({
              message: 'Dealer categories updated successfully.',
              totalDealers: totalDealers,
              matchedDealersInCSV: matchedCount,
              unmatchedDealers: totalDealers - matchedCount,
            });
          } catch (error) {
            console.error("Error processing CSV: ", error);
            return res.status(500).send("Error processing CSV and updating dealers.");
          }
        });
    } else {
      res.status(400).send("Unsupported file format. Please upload a CSV file.");
    }
  } catch (error) {
    console.error("Internal server error: ", error);
    return res.status(500).send("Internal server error");
  }
};

exports.addDefaultAddressToDealers = async (req, res) => {
  try {
    // Fetch all dealers where the address field is missing
    const dealersWithoutAddress = await Dealer.find({ address: { $exists: false } });

    if (!dealersWithoutAddress || dealersWithoutAddress.length === 0) {
      return res.status(200).json({ message: "All dealers already have the address field." });
    }

    // Update each dealer to add the address field with default values
    for (const dealer of dealersWithoutAddress) {
      dealer.address = {
        state: "Rajasthan",
        district: "Jaipur",
        town: "",
      };
      await dealer.save();
    }

    return res.status(200).json({
      message: `${dealersWithoutAddress.length} dealers updated with the address field.`,
    });
  } catch (error) {
    console.error("Error updating dealers with address:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

