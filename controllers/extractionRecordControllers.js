const axios = require('axios'); // To make API calls
const ExtractionRecord = require('../models/ExtractionRecord');
const { formatDate } = require('../helpers/extracttionHelpers');
const EmployeeCode = require('../models/EmployeeCode');
const Dealer = require('../models/Dealer');

const { BACKEND_URL } = process.env;

exports.addExtractionRecord = async (req, res) => {
    try {
        const { productId, dealerCode, quantity,  remarks } = req.body;

        // Extract code (employee code) directly from req
        const { code } = req;

        // Validate required fields
        if (!productId || !dealerCode || !quantity || !code) {
            return res.status(400).json({
                error: 'Please provide all required fields: productId, dealerCode, quantity, modeOfPayment, and ensure the code is provided.'
            });
        }

        // Fetch the product details by calling the /product/by-id/:productId API
        const productResponse = await axios.get(`${BACKEND_URL}/product/by-id/${productId}`);
        
        // Check if the product exists
        if (!productResponse.data.product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = productResponse.data.product;

        // Calculate the total price
        const totalPrice = product.Price * quantity;

        // Create a new record
        const newRecord = new ExtractionRecord({
            productId,
            dealerCode,
            date: new Date(), // Set the date as the current date
            quantity,
            uploadedBy: code, // Set the employee code from req
            totalPrice,
            remarks
        });

        // Save the record to the database
        await newRecord.save();

        return res.status(200).json({
            message: 'Extraction Record added successfully.',
            data: newRecord
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};


exports.getAllExtractionRecords = async (req, res) => {
    try {
        const { query } = req.query; // Get search query from request query string

        // Log the query for debugging purposes
        console.log("Search query:", query);

        let extractionRecords;
        if (!query || query.trim() === "") {
            // If no query is provided, return all extraction records
            extractionRecords = await ExtractionRecord.find().populate({
                path: 'productId',
                select: 'Brand Model Price Segment Category Status' // Only select these fields from the Product model
            });
        } else {
            // Convert query to lowercase for case-insensitive search
            const lowerCaseQuery = query.toLowerCase();

            // Find extraction records that match the search query in dealerCode or uploadedBy fields
            extractionRecords = await ExtractionRecord.find({
                $or: [
                    { dealerCode: { $regex: lowerCaseQuery, $options: 'i' } },
                    { uploadedBy: { $regex: lowerCaseQuery, $options: 'i' } }
                ]
            }).populate({
                path: 'productId',
                select: 'Brand Model Price Segment Category Status' // Only select these fields from the Product model
            });
        }

        // Check if any records were found
        if (extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No Matching Records Found' });
        }

        // Fetch employee name and dealer shop name
        const recordsWithDetails = await Promise.all(extractionRecords.map(async (record) => {
            // Fetch the employee by code (uploadedBy)
            const employee = await EmployeeCode.findOne({ Code: record.uploadedBy }).select('Name');

            // Fetch the dealer by dealerCode
            const dealer = await Dealer.findOne({ dealerCode: record.dealerCode }).select('shopName');

            return {
                _id: record._id,
                dealerCode: record.dealerCode,
                shopName: dealer ? dealer.shopName : 'N/A', // Add shopName from dealer
                date: formatDate(record.date), // Format the date here
                quantity: record.quantity,
                uploadedBy: record.uploadedBy,
                employeeName: employee ? employee.Name : 'N/A', // Add employeeName from EmployeeCode
                totalPrice: record.totalPrice,
                remarks: record.remarks,
                Brand: record.productId?.Brand,
                Model: record.productId?.Model,
                Price: record.productId?.Price,
                Segment: record.productId?.Segment,
                Category: record.productId?.Category,
                Status: record.productId?.Status
            };
        }));

        return res.status(200).json({ records: recordsWithDetails });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getExtractionDataForEmployee = async (req, res) => {
    try {
        // Extract the employee code from the token (assuming it's stored in req.code)
        const { code } = req;

        // Validate if the code is present
        if (!code) {
            return res.status(400).json({ error: 'Employee code is required in the request.' });
        }

        // Find extraction records that match the uploadedBy field with the code from the token
        const extractionRecords = await ExtractionRecord.find({ uploadedBy: code }).populate({
            path: 'productId',
            select: 'Brand Model Price Segment Category Status' // Only select these fields from the Product model
        });

        // Check if any records were found
        if (extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the provided employee code.' });
        }

        // Fetch employee name and dealer shop name
        const recordsWithDetails = await Promise.all(extractionRecords.map(async (record) => {
            // Fetch the employee by code (uploadedBy)
            const employee = await EmployeeCode.findOne({ Code: record.uploadedBy }).select('Name');

            // Fetch the dealer by dealerCode
            const dealer = await Dealer.findOne({ dealerCode: record.dealerCode }).select('shopName');

            return {
                _id: record._id,
                dealerCode: record.dealerCode,
                shopName: dealer ? dealer.shopName : 'N/A', // Add shopName from dealer
                date: formatDate(record.date), // Format the date here
                quantity: record.quantity,
                uploadedBy: record.uploadedBy,
                employeeName: employee ? employee.Name : 'N/A', // Add employeeName from EmployeeCode
                totalPrice: record.totalPrice,
                remarks: record.remarks,
                Brand: record.productId?.Brand,
                Model: record.productId?.Model,
                Price: record.productId?.Price,
                Segment: record.productId?.Segment,
                Category: record.productId?.Category,
                Status: record.productId?.Status
            };
        }));

        // Add the column names as the first entry in the array
        const columns = [
            'ID', 'Dealer Code', 'Shop Name', 'Date', 'Quantity', 'Uploaded By', 
            'Employee Name', 'Total Price', 'Remarks', 'Brand', 'Model', 
            'Dealer Price', 'Segment', 'Category', 'Status'
        ];

        // Insert the columns at the beginning of the response array
        recordsWithDetails.unshift({ columns });

        return res.status(200).json({ records: recordsWithDetails });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
