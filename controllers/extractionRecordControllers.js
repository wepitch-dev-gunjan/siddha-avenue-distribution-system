const axios = require('axios'); // To make API calls
const ExtractionRecord = require('../models/ExtractionRecord');
const { formatDate } = require('../helpers/extracttionHelpers');
const EmployeeCode = require('../models/EmployeeCode');
const Dealer = require('../models/Dealer');

const { BACKEND_URL } = process.env;

exports.addExtractionRecord = async (req, res) => {
    try {
        const { products, dealerCode, remarks } = req.body;

        // Extract code (employee code) directly from req
        const { code } = req;

        // Validate required fields
        if (!products || !dealerCode || !code) {
            return res.status(400).json({
                error: 'Please provide all required fields: products (array), dealerCode, and ensure the code is provided.'
            });
        }

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                error: 'The products field should be a non-empty array.'
            });
        }

        let extractionRecords = [];

        // Loop through each product and validate
        for (const productData of products) {
            const { productId, quantity } = productData;

            if (!productId || !quantity) {
                return res.status(400).json({
                    error: 'Each product must have productId and quantity.'
                });
            }

            // Fetch the product details by calling the /product/by-id/:productId API
            const productResponse = await axios.get(`${BACKEND_URL}/product/by-id/${productId}`);

            // Check if the product exists
            if (!productResponse.data.product) {
                return res.status(404).json({ error: `Product not found with id: ${productId}` });
            }

            const product = productResponse.data.product;

            // Calculate the total price
            const totalPrice = product.Price * quantity;

            // Create a new record for each product
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
            const savedRecord = await newRecord.save();
            extractionRecords.push({
                _id: savedRecord._id,
                product: product, // Include the product details in the response
                dealerCode: savedRecord.dealerCode,
                date: savedRecord.date,
                quantity: savedRecord.quantity,
                uploadedBy: savedRecord.uploadedBy,
                totalPrice: savedRecord.totalPrice,
                remarks: savedRecord.remarks
            });
        }

        return res.status(200).json({
            message: 'Extraction Records added successfully.',
            products: extractionRecords
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
                ID: record._id,
                'Dealer Code': record.dealerCode,
                'Shop Name': dealer ? dealer.shopName : 'N/A', // Add shopName from dealer
                Brand: record.productId?.Brand,
                Model: record.productId?.Model,
                Category: record.productId?.Category,
                Quantity: record.quantity,
                Price: record.productId?.Price,
                'Total Price': record.totalPrice,
                Segment: record.productId?.Segment,
                'Uploaded By': record.uploadedBy,
                'Employee Name': employee ? employee.Name : 'N/A', // Add employeeName from EmployeeCode
                Status: record.productId?.Status,
                Date: formatDate(record.date) // Format the date here
            };
        }));

        // Add the column names as the first entry in the array
        const columns = {
            columns: ['ID', 'Dealer Code', 'Shop Name', 'Brand', 'Model', 'Category', 'Quantity', 'Dealer Price', 'Total Price', 'Segment', 'Uploaded By', 'Employee Name', 'Status', 'Date']
        };

        // Insert the columns at the beginning of the response array
        recordsWithDetails.unshift(columns);

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
            select: 'Brand Model Category' // Only select these fields from the Product model
        });

        // Check if any records were found
        if (extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the provided employee code.' });
        }

        // Fetch employee name and dealer shop name
        const recordsWithDetails = await Promise.all(extractionRecords.map(async (record) => {
            // Fetch the dealer by dealerCode
            const dealer = await Dealer.findOne({ dealerCode: record.dealerCode }).select('shopName');

            return {
                Id: record._id,
                dealerCode: record.dealerCode,
                shopName: dealer ? dealer.shopName : 'N/A', // Add shopName from dealer
                Brand: record.productId?.Brand,
                Model: record.productId?.Model,
                Category: record.productId?.Category,
                quantity: record.quantity,
                totalPrice: record.totalPrice
            };
        }));

        // Add the column names as the first entry in the array
        const columns = {
            columns: ['Id', 'Dealer Code', 'Shop Name', 'Brand', 'Model', 'Category', 'Quantity', 'Total Price']
        };

        // Insert the column names at the beginning of the response array
        recordsWithDetails.unshift(columns);

        return res.status(200).json({ records: recordsWithDetails });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getExtractionRecordsForAMonth = async (req, res) => {
    try {
        // Extract the month and year from the request query parameters (assume format YYYY-MM)
        const { month, year } = req.query;

        // Validate the month and year
        if (!month || !year) {
            return res.status(400).json({ error: 'Please provide both month and year.' });
        }

        // Calculate the start and end date for the given month
        const startDate = new Date(year, month - 1, 1); // First day of the month
        const endDate = new Date(year, month, 0); // Last day of the month

        // Find extraction records within the specified month
        const extractionRecords = await ExtractionRecord.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate({
            path: 'productId',
            select: 'Brand Model Price Segment Category Status' // Only select these fields from the Product model
        });

        // Check if any records were found
        if (extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the given month.' });
        }

        // Aggregate the data by dealer, product, and employee (TSE)
        const aggregatedData = {};

        for (const record of extractionRecords) {
            const dealerCode = record.dealerCode;
            const productId = record.productId._id;
            const uploadedBy = record.uploadedBy;

            // Create a unique key for each dealer, product, and employee combination
            const key = `${dealerCode}-${productId}-${uploadedBy}`;

            // If the key doesn't exist, initialize the aggregated data
            if (!aggregatedData[key]) {
                const employee = await EmployeeCode.findOne({ Code: uploadedBy }).select('Name');
                const dealer = await Dealer.findOne({ dealerCode }).select('shopName');

                aggregatedData[key] = {
                    ID: record._id,
                    'Dealer Code': dealerCode,
                    'Shop Name': dealer ? dealer.shopName : 'N/A',
                    Brand: record.productId.Brand,
                    Model: record.productId.Model,
                    Category: record.productId.Category,
                    'MTD Volume': 0, // Initialize the quantity
                    'MTD Value': 0, // Initialize the total price
                    Segment: record.productId.Segment,
                    'TSE': employee ? employee.Name : 'N/A', // Employee name (TSE)
                    'TSE Code': uploadedBy, // Uploaded by (TSE Code)
                };
            }

            // Aggregate the quantity (MTD Volume) and total price (MTD Value)
            aggregatedData[key]['MTD Volume'] += record.quantity;
            aggregatedData[key]['MTD Value'] += record.totalPrice;
        }

        // Convert the aggregated data object to an array
        const recordsWithDetails = Object.values(aggregatedData);

        // Add the column names as the first entry in the array
        const columns = {
            columns: ['ID', 'Dealer Code', 'Shop Name', 'Brand', 'Model', 'Category', 'MTD Volume', 'MTD Value', 'Segment', 'TSE', 'TSE Code']
        };

        // Insert the columns at the beginning of the response array
        recordsWithDetails.unshift(columns);

        return res.status(200).json({ records: recordsWithDetails });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getExtractionReportForAdmins = async (req, res) => {
    try {
        // Extract the month and year from the request query parameters (assume format YYYY-MM)
        const { month, year } = req.query;

        // Validate the month and year
        if (!month || !year) {
            return res.status(400).json({ error: 'Please provide both month and year.' });
        }

        // Calculate the start and end date for the given month
        const startDate = new Date(year, month - 1, 1); // First day of the month
        const endDate = new Date(year, month, 0); // Last day of the month

        // Fetch all dealers from the database
        const allDealers = await Dealer.find().select('dealerCode shopName');

        // Fetch extraction records within the specified date range
        const extractionRecords = await ExtractionRecord.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate({
            path: 'productId',
            select: 'Brand Model Price Segment Category Status'
        });

        // Check if any extraction records were found
        if (extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No extraction records found for the given month.' });
        }

        // Prepare the report by aggregating data for each dealer
        const reportData = {};

        // Initialize the report for each dealer
        allDealers.forEach((dealer) => {
            reportData[dealer.dealerCode] = {
                'Dealer Code': dealer.dealerCode,
                'Dealer Name': dealer.shopName,
                'MTD Volume': 0,
                'MTD Value': 0,
                Brands: {} // Store brand-wise aggregation here
            };
        });

        // Process each extraction record and aggregate by dealer and brand
        for (const record of extractionRecords) {
            const dealerCode = record.dealerCode;

            // If the dealer exists in our reportData, aggregate the data
            if (reportData[dealerCode]) {
                // Update MTD Volume and MTD Value
                reportData[dealerCode]['MTD Volume'] += record.quantity;
                reportData[dealerCode]['MTD Value'] += record.totalPrice;

                const brand = record.productId.Brand;
                if (!reportData[dealerCode].Brands[brand]) {
                    // Initialize the brand if not already present
                    reportData[dealerCode].Brands[brand] = {
                        'MTD Volume': 0,
                        'MTD Value': 0
                    };
                }
                // Aggregate MTD Volume and MTD Value for the specific brand
                reportData[dealerCode].Brands[brand]['MTD Volume'] += record.quantity;
                reportData[dealerCode].Brands[brand]['MTD Value'] += record.totalPrice;
            }
        }

        // Convert the aggregated report data into an array
        const recordsWithDetails = Object.values(reportData).map(dealer => {
            const brandDetails = Object.entries(dealer.Brands).map(([brand, data]) => ({
                Brand: brand,
                'Brand MTD Volume': data['MTD Volume'],
                'Brand MTD Value': data['MTD Value']
            }));

            return {
                ...dealer,
                Brands: brandDetails
            };
        });

        // Add the column names as the first entry in the array
        const columns = {
            columns: ['Dealer Code', 'Dealer Name', 'MTD Volume', 'MTD Value', 'Brand', 'Brand MTD Volume', 'Brand MTD Value']
        };

        // Insert the columns at the beginning of the response array
        recordsWithDetails.unshift(columns);

        return res.status(200).json({ records: recordsWithDetails });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};






