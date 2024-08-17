const Dealer = require('../models/Dealer'); // Import the Dealer model

exports.addDealer = async (req, res) => {
  try {
    const {
      dealerCode,
      shopName,
      shopArea,
      shopAddress,
      owner,                   // Nested object with required fields like name and contactNumber
      anniversaryDate,
      otherImportantFamilyDates, // Array of objects
      businessDetails,          // Nested object with typeOfBusiness and yearsInBusiness
      specialNotes
    } = req.body;

    // Basic Validations
    if (!dealerCode || !shopName || !shopArea || !shopAddress || !owner?.name || !owner?.contactNumber) {
      return res.status(400).json({ error: 'Please provide all the required fields: dealerCode, shopName, shopArea, shopAddress, owner\'s name, and owner\'s contact number.' });
    }

    // Check if the dealer code already exists in the database
    const existingDealer = await Dealer.findOne({ dealerCode });
    if (existingDealer) {
      return res.status(400).json({ error: 'Dealer code already exists. Please provide a unique dealer code.' });
    }

    // Create a new Dealer with all fields
    const newDealer = new Dealer({
      dealerCode,
      shopName,
      shopArea,
      shopAddress,
      owner: {
        name: owner.name,
        position: owner.position,                // Optional
        contactNumber: owner.contactNumber,
        email: owner.email,                      // Optional
        homeAddress: owner.homeAddress,          // Optional
        birthday: owner.birthday,                // Optional
        wife: {
          name: owner?.wife?.name,               // Optional
          birthday: owner?.wife?.birthday        // Optional
        },
        children: owner.children || [],          // Optional array
        otherFamilyMembers: owner.otherFamilyMembers || []  // Optional array
      },
      anniversaryDate,                // Optional
      otherImportantFamilyDates,       // Optional array
      businessDetails: {
        typeOfBusiness: businessDetails?.typeOfBusiness,   // Optional
        yearsInBusiness: businessDetails?.yearsInBusiness, // Optional
        preferredCommunicationMethod: businessDetails?.preferredCommunicationMethod // Optional
      },
      specialNotes                     // Optional
    });

    await newDealer.save();

    return res.status(200).json({
      message: 'Dealer added successfully.',
      data: newDealer,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
