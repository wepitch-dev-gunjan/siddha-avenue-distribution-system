const axios = require('axios'); // To make API calls
const ExtractionRecord = require('../models/ExtractionRecord');
const { formatDate } = require('../helpers/extracttionHelpers');
const EmployeeCode = require('../models/EmployeeCode');
const Dealer = require('../models/Dealer');
const Product = require("../models/Product");
const SalesDataMTDW = require("../models/SalesDataMTDW");
const DealerListTseWise = require('../models/DealerListTseWise');

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

// exports.getExtractionRecordsForAMonth = async (req, res) => {
//     try {
//         // Extract the month and year from the request query parameters (assume format YYYY-MM)
//         const { month, year } = req.query;

//         // Validate the month and year
//         if (!month || !year) {
//             return res.status(400).json({ error: 'Please provide both month and year.' });
//         }

//         // Calculate the start and end date for the given month
//         const startDate = new Date(year, month - 1, 1); // First day of the month
//         const endDate = new Date(year, month, 0); // Last day of the month

//         // Find extraction records within the specified month
//         const extractionRecords = await ExtractionRecord.find({
//             date: {
//                 $gte: startDate,
//                 $lte: endDate
//             }
//         }).populate({
//             path: 'productId',
//             select: 'Brand Model Price Segment Category Status' // Only select these fields from the Product model
//         });

//         // Check if any records were found
//         if (extractionRecords.length === 0) {
//             return res.status(200).json({ message: 'No records found for the given month.' });
//         }

//         // Aggregate the data by dealer, product, and employee (TSE)
//         const aggregatedData = {};

//         for (const record of extractionRecords) {
//             const dealerCode = record.dealerCode;
//             const productId = record.productId._id;
//             const uploadedBy = record.uploadedBy;

//             // Create a unique key for each dealer, product, and employee combination
//             const key = `${dealerCode}-${productId}-${uploadedBy}`;

//             // If the key doesn't exist, initialize the aggregated data
//             if (!aggregatedData[key]) {
//                 const employee = await EmployeeCode.findOne({ Code: uploadedBy }).select('Name');
//                 const dealer = await Dealer.findOne({ dealerCode }).select('shopName');

//                 aggregatedData[key] = {
//                     ID: record._id,
//                     'Dealer Code': dealerCode,
//                     'Shop Name': dealer ? dealer.shopName : 'N/A',
//                     Brand: record.productId.Brand,
//                     Model: record.productId.Model,
//                     Category: record.productId.Category,
//                     'MTD Volume': 0, // Initialize the quantity
//                     'MTD Value': 0, // Initialize the total price
//                     Segment: record.productId.Segment,
//                     'TSE': employee ? employee.Name : 'N/A', // Employee name (TSE)
//                     'TSE Code': uploadedBy, // Uploaded by (TSE Code)
//                 };
//             }

//             // Aggregate the quantity (MTD Volume) and total price (MTD Value)
//             aggregatedData[key]['MTD Volume'] += record.quantity;
//             aggregatedData[key]['MTD Value'] += record.totalPrice;
//         }

//         // Convert the aggregated data object to an array
//         const recordsWithDetails = Object.values(aggregatedData);

//         // Add the column names as the first entry in the array
//         const columns = {
//             columns: ['ID', 'Dealer Code', 'Shop Name', 'Brand', 'Model', 'Category', 'MTD Volume', 'MTD Value', 'Segment', 'TSE', 'TSE Code']
//         };

//         // Insert the columns at the beginning of the response array
//         recordsWithDetails.unshift(columns);

//         return res.status(200).json({ records: recordsWithDetails });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };

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
                    'TSE Code': uploadedBy // Uploaded by (TSE Code)
                };
            }

            // Aggregate the quantity (MTD Volume) and total price (MTD Value)
            aggregatedData[key]['MTD Volume'] += record.quantity;
            aggregatedData[key]['MTD Value'] += record.totalPrice;
        }

        // Convert the aggregated data object to an array
        const recordsWithDetails = Object.values(aggregatedData);

        // Define the columns for the CSV
        const columns = ['ID', 'Dealer Code', 'Shop Name', 'Brand', 'Model', 'Category', 'MTD Volume', 'MTD Value', 'Segment', 'TSE', 'TSE Code'];

        // Function to sanitize data (remove commas)
        const sanitizeValue = (value) => {
            if (typeof value === 'string') {
                return value.replace(/,/g, ''); // Remove all commas from string values
            }
            return value.toString().replace(/,/g, ''); // Convert numbers to string and remove commas
        };

        // Build the CSV content as a string
        let csvContent = columns.join(',') + '\n'; // Add the header row

        recordsWithDetails.forEach(record => {
            // Sanitize each value in the record
            const sanitizedRecord = columns.map(column => sanitizeValue(record[column]));
            csvContent += sanitizedRecord.join(',') + '\n'; // Add each sanitized row to the CSV content
        });

        // Set the response headers for file download
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', 'attachment; filename="extraction_records.csv"');

        // Send the CSV content as response
        return res.status(200).send(csvContent);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getExtractionReportForAdmins = async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ error: 'Please provide both month and year.' });
        }

        // Calculate the start and end date for the given month
        const startDate = new Date(year, month - 1, 1); // First day of the month
        const endDate = new Date(year, month, 0); // Last day of the month

        // Fetch the extraction records directly using the logic from getExtractionRecordsForAMonth
        const extractionRecords = await ExtractionRecord.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate({
            path: 'productId',
            select: 'Brand Model Price Category Status' // Only select these fields from the Product model
        });

        if (!extractionRecords || extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the given month.' });
        }

        
        // Initialize the report structure with placeholders
        const report = {
            year,
            overallValues: [],
            brandSegments: [],
            priceRanges: {
                "40K+": { total: 0 },
                "30-40K": { total: 0 },
                "20-30K": { total: 0 },
                "15-20K": { total: 0 },
                "10-15K": { total: 0 },
                "<10K": { total: 0 },
            },
        };

        const brands = ['Samsung', 'Apple', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Sony', 'Motorola', 'Nothing', 'Google'];

        brands.forEach((brand) => {
            report.brandSegments.push({
                brand,
                overallValue: 0,
                sharePercentage: 0,
                segments: {
                    "40K+": { value: 0, share: 0 },
                    "30-40K": { value: 0, share: 0 },
                    "20-30K": { value: 0, share: 0 },
                    "15-20K": { value: 0, share: 0 },
                    "10-15K": { value: 0, share: 0 },
                    "<10K": { value: 0, share: 0 },
                }
            });
        });

        // Fetch all dealers to include in the report
        const allDealers = await Dealer.find().select('dealerCode shopName'); 
        const aggregatedDealers = {};

        // Initialize each dealer with zero values
        allDealers.forEach(dealer => {
            aggregatedDealers[dealer.dealerCode] = {
                'Dealer Code': dealer.dealerCode,
                'Shop Name': dealer.shopName,
                values: {},
                total: 0, // Total worth of goods sold by the dealer
                overallValue: 0, // Placeholder for the overall value of goods sold by the dealer
            };

            brands.forEach((brand) => {
                aggregatedDealers[dealer.dealerCode].values[brand] = {
                    overallValue: 0,
                    sharePercentage: 0,
                    segments: {
                        "40K+": 0,
                        "30-40K": 0,
                        "20-30K": 0,
                        "15-20K": 0,
                        "10-15K": 0,
                        "<10K": 0,
                    }
                };
            });
        });

        // Function to determine the segment based on product price (totalPrice / quantity)
        const determineSegment = (pricePerUnit) => {
            if (pricePerUnit >= 40000) return "40K+";
            if (pricePerUnit >= 30000) return "30-40K";
            if (pricePerUnit >= 20000) return "20-30K";
            if (pricePerUnit >= 15000) return "15-20K";
            if (pricePerUnit >= 10000) return "10-15K";
            return "<10K";
        };

        // Aggregate the totalPrice from each record and update brand and segment values per dealer
        for (const record of extractionRecords) {
            const { productId, dealerCode, totalPrice, quantity } = record;
            const brand = productId.Brand;

            // Calculate the price per unit (totalPrice / quantity)
            const pricePerUnit = totalPrice / quantity;
            const segment = determineSegment(pricePerUnit);

            // Only process if the brand is in our list and the dealer exists
            if (brands.includes(brand) && aggregatedDealers[dealerCode]) {
                const dealerData = aggregatedDealers[dealerCode];
                const brandData = dealerData.values[brand];

                // Update the total sales value for this brand at this dealer
                brandData.overallValue += totalPrice;

                // Aggregate by the dynamically determined segment
                if (report.priceRanges[segment]) {
                    brandData.segments[segment] += totalPrice;
                    report.priceRanges[segment].total += totalPrice;
                }

                // Update the total sales value for the dealer
                dealerData.total += totalPrice;
            }
        }

        // Calculate the share percentage for each brand within each dealer and overallValue for the dealer
        Object.values(aggregatedDealers).forEach(dealer => {
            let dealerTotalValue = 0;

            // Iterate through each brand in the dealer's data
            Object.keys(dealer.values).forEach(brand => {
                const brandData = dealer.values[brand];

                // Add to dealer's overall value
                dealerTotalValue += brandData.overallValue;

                // Calculate the share percentage of the brand in the dealer's total sales
                if (dealer.total > 0) {
                    brandData.sharePercentage = (brandData.overallValue / dealer.total) * 100;
                }
            });

            // Set the dealer's overall value
            dealer.overallValue = dealerTotalValue;
        });

        // Format the dealers with the aggregated data
        const formattedDealers = Object.values(aggregatedDealers).map(dealer => {
            return {
                dealerCode: dealer['Dealer Code'],
                shopName: dealer['Shop Name'],
                overallValue: dealer.overallValue, // Total worth of goods sold by the dealer
                brands: Object.keys(dealer.values).map(brand => ({
                    name: brand,
                    overallValue: dealer.values[brand].overallValue,
                    sharePercentage: dealer.values[brand].sharePercentage,
                    segments: dealer.values[brand].segments
                }))
            };
        });

        const formattedReport = {
            year: report.year,
            overallValues: report.brandSegments.map(brand => brand.overallValue),
            brands: report.brandSegments.map((brand) => ({
                name: brand.brand,
                overallValue: brand.overallValue,
                sharePercentage: brand.sharePercentage,
                segments: brand.segments,
            })),
            priceRanges: report.priceRanges,
            dealers: formattedDealers,
        };

        return res.status(200).json(formattedReport);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getBrandComparisonReport = async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ error: 'Please provide both month and year.' });
        }

        // Define date range for the month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        // Fetch extraction records
        const extractionRecords = await ExtractionRecord.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate({
            path: 'productId',
            select: 'Brand Model Price Category Status'
        });

        if (!extractionRecords || extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the given month.' });
        }

        // Structure for the report
        const brands = ['Samsung', 'Apple', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Sony', 'Motorola', 'Nothing', 'Google'];
        const brandComparison = brands.map(brand => ({
            brand,
            totalVolume: 0,
            totalValue: 0,
        }));

        // Aggregate volume and value per brand
        for (const record of extractionRecords) {
            const { productId, totalPrice, quantity } = record;
            const brand = productId.Brand;

            if (brands.includes(brand)) {
                const brandData = brandComparison.find(b => b.brand === brand);
                brandData.totalVolume += quantity;
                brandData.totalValue += totalPrice;
            }
        }

        return res.status(200).json(brandComparison);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getSegmentAnalysisReport = async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ error: 'Please provide both month and year.' });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const extractionRecords = await ExtractionRecord.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate({
            path: 'productId',
            select: 'Brand Price'
        });

        if (!extractionRecords || extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the given month.' });
        }

        const segments = {
            "40K+": 0,
            "30-40K": 0,
            "20-30K": 0,
            "15-20K": 0,
            "10-15K": 0,
            "<10K": 0,
        };

        extractionRecords.forEach(record => {
            const { productId, totalPrice, quantity } = record;
            const pricePerUnit = totalPrice / quantity;
            const segment = determineSegment(pricePerUnit);
            segments[segment] += totalPrice;
        });

        return res.status(200).json(segments);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getDealerPerformanceReport = async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ error: 'Please provide both month and year.' });
        }

        // Define date range for the month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        // Fetch all dealers
        const allDealers = await Dealer.find().select('dealerCode shopName'); 
        const aggregatedDealers = {};

        allDealers.forEach(dealer => {
            aggregatedDealers[dealer.dealerCode] = {
                shopName: dealer.shopName,
                totalValue: 0,
                brandSales: {},
            };
        });

        // Fetch extraction records
        const extractionRecords = await ExtractionRecord.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate({
            path: 'productId',
            select: 'Brand'
        });

        if (!extractionRecords || extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the given month.' });
        }

        for (const record of extractionRecords) {
            const { productId, dealerCode, totalPrice } = record;
            const brand = productId.Brand;

            if (aggregatedDealers[dealerCode]) {
                const dealerData = aggregatedDealers[dealerCode];
                dealerData.totalValue += totalPrice;

                if (!dealerData.brandSales[brand]) {
                    dealerData.brandSales[brand] = totalPrice;
                } else {
                    dealerData.brandSales[brand] += totalPrice;
                }
            }
        }

        // Format the report
        const dealerReport = Object.keys(aggregatedDealers).map(dealerCode => ({
            dealerCode,
            shopName: aggregatedDealers[dealerCode].shopName,
            totalValue: aggregatedDealers[dealerCode].totalValue,
            brandSales: aggregatedDealers[dealerCode].brandSales,
        }));

        return res.status(200).json(dealerReport);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};


// New frontend apis: 

exports.getUniqueColumnValues = async (req, res) => {
    try {
        const { column } = req.query;

        if (!column) {
            return res.status(400).json({ error: 'Please specify a column to fetch unique values.' });
        }

        let uniqueValues;

        if (column.startsWith('productId.')) {
            // Query unique values from the Product model for fields like Brand or Segment
            const aggregationResult = await ExtractionRecord.aggregate([
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },
                {
                    $unwind: '$productInfo'
                },
                {
                    $group: {
                        _id: `$productInfo.${column.split('.')[1]}`,
                    }
                },
                {
                    $project: {
                        _id: 0,
                        uniqueValue: '$_id'
                    }
                }
            ]);

            uniqueValues = aggregationResult.map((item) => item.uniqueValue);

            // Include "Samsung" explicitly in the brand list if column is brand
            if (column === 'productId.Brand' && !uniqueValues.includes("Samsung")) {
                uniqueValues.unshift("Samsung");
            }

        } else if (['type', 'area', 'tlname', 'abm', 'ase', 'asm', 'rso', 'zsm'].includes(column.toLowerCase())) {
            // Query specific columns from the DealerListTseWise model
            uniqueValues = await DealerListTseWise.distinct(column);
        } else {
            // Query distinct values from ExtractionRecord itself for other fields
            uniqueValues = await ExtractionRecord.distinct(column);
        }

        if (!uniqueValues || uniqueValues.length === 0) {
            return res.status(200).json({ message: `No unique values found for column: ${column}` });
        }

        return res.status(200).json({ uniqueValues });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};


// exports.getUniqueColumnValues = async (req, res) => {
//     try {
//         const { column } = req.query;
//         console.log("column: ", column);

//         if (!column) {
//             return res.status(400).json({ error: 'Please specify a column to fetch unique values.' });
//         }

//         let uniqueValues;

//         // Check if the requested column is part of the Product model
//         if (column.startsWith('productId.')) {
//             // This means we're querying a field from the Product model, so we need to populate productId

//             // Use MongoDB aggregation to get distinct values from the populated productId fields
//             const aggregationResult = await ExtractionRecord.aggregate([
//                 {
//                     $lookup: {
//                         from: 'products', // Name of the Product collection
//                         localField: 'productId',
//                         foreignField: '_id',
//                         as: 'productInfo'
//                     }
//                 },
//                 {
//                     $unwind: '$productInfo' // Flatten the populated productInfo array
//                 },
//                 {
//                     $group: {
//                         _id: `$productInfo.${column.split('.')[1]}`, // Group by the requested field (e.g., Brand)
//                     }
//                 },
//                 {
//                     $project: {
//                         _id: 0, // Exclude the _id field from the result
//                         uniqueValue: '$_id' // Store the distinct field value in a new field
//                     }
//                 }
//             ]);

//             uniqueValues = aggregationResult.map((item) => item.uniqueValue);

//         } else {
//             // Query distinct values from ExtractionRecord itself (for non-product fields)
//             uniqueValues = await ExtractionRecord.distinct(column);
//         }

//         if (!uniqueValues || uniqueValues.length === 0) {
//             return res.status(200).json({ message: `No unique values found for column: ${column}` });
//         }
//         console.log("Column and Unique Values: ", column, uniqueValues);
//         return res.status(200).json({ uniqueValues });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };

exports.getExtractionDataForAdminWithFilters = async (req, res) => {
    try {
        const { startDate, endDate, brand, model, category, segment, dealerCode, page = 1, limit = 100 } = req.query;

        const filter = {};
        const productFilter = {}; // Filter for Product-specific fields

        // Apply date range filter
        if (startDate && endDate) {
            const parsedStartDate = new Date(startDate);
            const parsedEndDate = new Date(endDate);

            if (parsedStartDate > parsedEndDate) {
                return res.status(400).json({ error: 'Start date must be before or equal to end date.' });
            }

            filter.date = { $gte: parsedStartDate, $lte: parsedEndDate };
        }

        // Apply dealerCode filter as an array using $in operator
        if (dealerCode && dealerCode.length) {
            filter.dealerCode = { $in: dealerCode };
        }

        // Apply brand, model, category, segment filters as arrays using $in operator
        if (brand && brand.length) {
            productFilter.Brand = { $in: brand };
        }
        if (segment && segment.length) {
            productFilter.Segment = { $in: segment };
        }

        // Fetch matching products based on filters
        let productIds = [];
        if (Object.keys(productFilter).length > 0) {
            const matchingProducts = await Product.find(productFilter).select('_id');
            if (!matchingProducts.length) {
                return res.status(200).json({ message: 'No records found for the given product filters.' });
            }
            productIds = matchingProducts.map((product) => product._id);
            filter.productId = { $in: productIds }; // Filter the extraction records by productId
        }

        // Fetch the total number of records
        const totalRecords = await ExtractionRecord.countDocuments(filter);

        // Fetch the extraction records with pagination
        const extractionRecords = await ExtractionRecord.find(filter)
            .populate({
                path: 'productId',
                select: 'Brand Model Segment Category'
            })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        if (!extractionRecords || extractionRecords.length === 0) {
            return res.status(200).json({ message: 'No records found for the given filters.' });
        }

        // Pre-fetch employee and dealer data
        const employees = await EmployeeCode.find().select('Name Code');
        const dealers = await Dealer.find().select('dealerCode shopName');

        const employeeMap = employees.reduce((acc, emp) => {
            acc[emp.Code] = emp.Name;
            return acc;
        }, {});

        const dealerMap = dealers.reduce((acc, dealer) => {
            acc[dealer.dealerCode] = dealer.shopName;
            return acc;
        }, {});

        // Aggregate the data
        const aggregatedData = {};

        for (const record of extractionRecords) {
            const dealerCode = record.dealerCode;
            const productId = record.productId._id;
            const uploadedBy = record.uploadedBy;

            const key = `${dealerCode}-${productId}-${uploadedBy}`;

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    ID: record._id,
                    'Dealer Code': dealerCode,
                    'Shop Name': dealerMap[dealerCode] || 'N/A',
                    Brand: record.productId.Brand,
                    Model: record.productId.Model,
                    Category: record.productId.Category,
                    'MTD Volume': 0,
                    'MTD Value': 0,
                    Segment: record.productId.Segment,
                    TSE: employeeMap[uploadedBy] || 'N/A',
                    'TSE Code': uploadedBy
                };
            }

            aggregatedData[key]['MTD Volume'] += record.quantity;
            aggregatedData[key]['MTD Value'] += record.totalPrice;
        }

        const recordsWithDetails = Object.values(aggregatedData);

        const columns = ['ID', 'Dealer Code', 'Shop Name', 'Brand', 'Model', 'Category', 'MTD Volume', 'MTD Value', 'Segment', 'TSE', 'TSE Code'];

        return res.status(200).json({
            totalRecords,
            data: [columns, ...recordsWithDetails]
        });

    } catch (error) {
        console.error('Error in getExtractionDataForAdminWithFilters:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};


exports.getExtractionOverviewForAdmins = async (req, res) => {
    try {
        let { startDate, endDate, valueVolume = 'value', segment, dealerCode, tse, type, area, tlName, abm, ase, asm, rso, zsm, page = 1, limit = 100, showShare = 'false' } = req.query;

        console.log("Start date, end date: ", startDate, endDate);

        const filter = {};
        const samsungFilter = {};

        const formatDate = (date) => {
            const d = new Date(date);
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const year = d.getFullYear();
            return `${month}/${day}/${year}`;
        };

        // Apply date range filter for general data
        if (startDate && endDate) {
            const parsedStartDate = new Date(startDate);
            const parsedEndDate = new Date(endDate);
            
            // Validate date range
            if (parsedStartDate > parsedEndDate) {
                return res.status(400).json({ error: 'Start date must be before or equal to end date.' });
            }
            
            // General filter applies the provided date range
            filter.date = { $gte: parsedStartDate, $lte: parsedEndDate };


            // For Samsung, match the same day range in the previous month
            const previousMonthStart = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth() - 1, parsedStartDate.getDate());
            const previousMonthEnd = new Date(parsedEndDate.getFullYear(), parsedEndDate.getMonth() - 1, parsedEndDate.getDate());
            
            samsungFilter.DATE = { 
                $gte: formatDate(previousMonthStart), 
                $lte: formatDate(previousMonthEnd) 
            };
            console.log("Samsung filter date (previous month same days): ", samsungFilter.DATE);
        } else {
            // Default behavior when no dates are provided
            let today = new Date();
            let firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            let firstDayOfPreviousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            let lastDayOfPreviousMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            
            filter.date = { $gte: firstDayOfCurrentMonth };
            samsungFilter.DATE = { 
                $gte: formatDate(firstDayOfPreviousMonth), 
                $lte: formatDate(lastDayOfPreviousMonth) 
            };
        }


        // Construct dealer-specific filters dynamically based on the provided filters
        const dealerFilters = {};
        if (tse && tse.length) {
            dealerFilters.TSE = { $in: tse };
        }
        if (zsm && zsm.length) {
            dealerFilters.ZSM = { $in: zsm };
        }
        if (area && area.length) {
            dealerFilters.Area = { $in: area };
        }
        if (tlName && tlName.length) {
            dealerFilters['TL NAME'] = { $in: tlName };
        }
        if (abm && abm.length) {
            dealerFilters.ABM = { $in: abm };
        }
        if (ase && ase.length) {
            dealerFilters.ASE = { $in: ase };
        }
        if (asm && asm.length) {
            dealerFilters.ASM = { $in: asm };
        }
        if (rso && rso.length) {
            dealerFilters.RSO = { $in: rso };
        }
        if (type && type.length) {
            dealerFilters.TYPE = { $in: type };
        }

        console.log("Dealer Filters: ", dealerFilters);

        // Fetch dealer codes based on the combined filters from DealerListTseWise
        // Fetch dealer codes based on the combined filters from DealerListTseWise
        let dealerCodes = [];
        if (Object.keys(dealerFilters).length > 0) {
            // Use bracket notation to select 'Dealer Code'
            const dealers = await DealerListTseWise.find(dealerFilters).select({ 'Dealer Code': 1 });
            console.log("Dealers fetched:", dealers); // Log the full dealer objects to check the structure

            // Inspect the structure of a single dealer object
            if (dealers.length > 0) {
                console.log("Example dealer object:", dealers[0]);
            }

            // Map the dealer codes using bracket notation
            dealerCodes = dealers.map(dealer => dealer['Dealer Code']);
        }

        console.log("Dealer codes filtered: ", dealerCodes);



        // console.log("Dealers: ", dealers);

        // If dealerCode is provided in the request, combine it with the dealerCodes fetched above
        if (dealerCode && dealerCode.length) {
            dealerCodes = dealerCodes.length ? dealerCodes.filter(code => dealerCode.includes(code)) : dealerCode;
        }

        // Apply the filtered dealer codes to the main query
        if (dealerCodes.length > 0) {
            filter.dealerCode = { $in: dealerCodes };
            samsungFilter['BUYER CODE'] = { $in: dealerCodes };
        }

        // Fetch extraction data for other brands
        const extractionRecords = await ExtractionRecord.find(filter)
            .populate({ path: 'productId', select: 'Brand Model Price Category' });

        // Initialize price classes and brands
        const priceClasses = {
            '<6k': {}, '6-10k': {}, '10-15k': {}, '15-20k': {}, '20-30k': {}, '30-40k': {},
            '40-70k': {}, '70-100k': {}, '100k': {}, 
        };
        const brands = ['Samsung', 'Vivo', 'Oppo', 'Xiaomi', 'Apple', 'OnePlus', 'Realme', 'Motorola', 'Others'];

        // Initialize brand data structure
        const brandData = {};
        Object.keys(priceClasses).forEach((priceClass) => {
            brandData[priceClass] = brands.reduce((acc, brand) => {
                acc[brand] = 0;
                return acc;
            }, {});
        });

        // Process extraction records for non-Samsung brands
        extractionRecords.forEach((record) => {
            const product = record.productId;
            const price = record.totalPrice / record.quantity;
            let priceClass = getPriceClass(price);

            if (!priceClass) return;

            const brand = brands.includes(product.Brand) ? product.Brand : 'Others';
            const valueToAdd = valueVolume === 'value' ? record.totalPrice : record.quantity;

            brandData[priceClass][brand] += valueToAdd;
        });

        // Fetch Samsung's sales data from SalesDataMTDW
        samsungFilter['SALES TYPE'] = 'Sell Out';
        // samsungFilter['SELLER NAME'] = 'SIDDHA CORPORATION';
        console.log("Samsung filter jb: ", samsungFilter);
        const samsungSalesData = await SalesDataMTDW.find(samsungFilter);

        // Process Samsung's sales data
        samsungSalesData.forEach((record) => {
            const mtdValue = Number(record['MTD VALUE']);
            const mtdVolume = Number(record['MTD VOLUME']);
            const price = mtdValue / mtdVolume;

            let priceClass = getPriceClass(price);
            if (!priceClass) return;

            const valueToAdd = valueVolume === 'value' ? mtdValue : mtdVolume;

            brandData[priceClass]['Samsung'] += valueToAdd;
        });

        // Calculate Samsung's rank for each price class
        const rankData = {};
        Object.keys(brandData).forEach((priceClass) => {
            const sortedBrands = Object.entries(brandData[priceClass]).sort((a, b) => b[1] - a[1]);
            const samsungRank = sortedBrands.findIndex(([brand]) => brand === 'Samsung') + 1;
            rankData[priceClass] = samsungRank || 0;
        });

        // Generate the response
        let response = Object.keys(priceClasses).map((priceClass) => {
            const rowData = {
                'Price Class': priceClass,
                Samsung: brandData[priceClass]['Samsung'],
                Vivo: brandData[priceClass]['Vivo'],
                Oppo: brandData[priceClass]['Oppo'],
                Xiaomi: brandData[priceClass]['Xiaomi'],
                Apple: brandData[priceClass]['Apple'],
                'One Plus': brandData[priceClass]['OnePlus'],
                'Real Me': brandData[priceClass]['Realme'],
                Motorola: brandData[priceClass]['Motorola'],
                Others: brandData[priceClass]['Others'],
                'Rank of Samsung': rankData[priceClass] || 0
            };

            const totalForPriceClass = rowData.Samsung + rowData.Vivo + rowData.Oppo + rowData.Xiaomi +
                                       rowData.Apple + rowData['One Plus'] + rowData['Real Me'] +
                                       rowData.Motorola + rowData.Others;

            if (showShare === 'true' && totalForPriceClass > 0) {
                Object.keys(rowData).forEach(brand => {
                    if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
                        rowData[brand] = ((rowData[brand] / totalForPriceClass) * 100).toFixed(2);
                    }
                });
            }

            return rowData;
        });

        // Apply segment filter after generating the response
        if (segment && segment.length) {
            const normalizedSegments = segment.map((seg) => seg.toLowerCase());
            response = response.filter((row) => normalizedSegments.includes(row['Price Class'].toLowerCase()));
        }

        // Add totals row
        const totalsRow = {
            'Price Class': 'Totals',
            Samsung: 0, Vivo: 0, Oppo: 0, Xiaomi: 0, Apple: 0, 'One Plus': 0, 'Real Me': 0, Motorola: 0, Others: 0,
            'Rank of Samsung': 0
        };

        let overallTotal = { Samsung: 0, Vivo: 0, Oppo: 0, Xiaomi: 0, Apple: 0, 'One Plus': 0, 'Real Me': 0, Motorola: 0, Others: 0 };
        let totalSalesVolume = 0;

        // Sum the total sales/volume for each brand across all price classes
        response.forEach((row) => {
            if (row['Price Class'] !== 'Totals') {
                overallTotal.Samsung += parseFloat(row.Samsung) || 0;
                overallTotal.Vivo += parseFloat(row.Vivo) || 0;
                overallTotal.Oppo += parseFloat(row.Oppo) || 0;
                overallTotal.Xiaomi += parseFloat(row.Xiaomi) || 0;
                overallTotal.Apple += parseFloat(row.Apple) || 0;
                overallTotal['One Plus'] += parseFloat(row['One Plus']) || 0;
                overallTotal['Real Me'] += parseFloat(row['Real Me']) || 0;
                overallTotal.Motorola += parseFloat(row.Motorola) || 0;
                overallTotal.Others += parseFloat(row.Others) || 0;
            }
        });

        totalSalesVolume = Object.values(overallTotal).reduce((sum, value) => sum + value, 0);

        if (showShare === 'true' && totalSalesVolume > 0) {
            Object.keys(overallTotal).forEach((brand) => {
                totalsRow[brand] = ((overallTotal[brand] / totalSalesVolume) * 100).toFixed(2);
            });
        } else {
            Object.assign(totalsRow, overallTotal);
        }

        // Determine rank for totals
        const totalsRankData = [
            ['Samsung', totalsRow.Samsung],
            ['Vivo', totalsRow.Vivo],
            ['Oppo', totalsRow.Oppo],
            ['Xiaomi', totalsRow.Xiaomi],
            ['Apple', totalsRow.Apple],
            ['One Plus', totalsRow['One Plus']],
            ['Real Me', totalsRow['Real Me']],
            ['Motorola', totalsRow.Motorola],
            ['Others', totalsRow.Others]
        ];

        totalsRankData.sort((a, b) => b[1] - a[1]);
        totalsRow['Rank of Samsung'] = totalsRankData.findIndex(([brand]) => brand === 'Samsung') + 1;

        // Add the totals row to the response
        response.push(totalsRow);

        return res.status(200).json({
            totalRecords: response.length,
            data: response
        });

    } catch (error) {
        console.error('Error in getExtractionOverviewForAdmins:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getExtractionDataModelWiseForAdmins = async (req, res) => {
    try {
        const { startDate, endDate, valueVolume = 'value', brand, segment, area, zsm, rso, asm, ase, abm, tse, dealerCode, type, page = 1, limit = 100, showShare = 'false' } = req.query;

        const productFilter = {};
        const dealerFilters = {};

        // Date ranges for current and previous months
        const currentStartDate = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const currentEndDate = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        const samsungStartDate = new Date(currentStartDate);
        samsungStartDate.setMonth(samsungStartDate.getMonth() - 1);
        const samsungEndDate = new Date(currentEndDate);
        samsungEndDate.setMonth(samsungEndDate.getMonth() - 1);

        // Initial filters for Samsung and non-Samsung data
        const nonSamsungFilter = { date: { $gte: currentStartDate, $lte: currentEndDate } };
        const samsungFilter = {
            'SALES TYPE': 'Sell Out',
            'MDD NAME': 'SIDDHA CORPORATION',
            DATE: {
                $gte: `${samsungStartDate.getMonth() + 1}/1/${samsungStartDate.getFullYear()}`,
                $lte: `${samsungEndDate.getMonth() + 1}/${samsungEndDate.getDate()}/${samsungEndDate.getFullYear()}`
            }
        };

        // Apply `tse` and `dealerCode` filters
        if (tse && tse.length) {
            nonSamsungFilter.uploadedBy = { $in: tse };
            samsungFilter.TSE = { $in: tse };
        }
        if (dealerCode && dealerCode.length) {
            nonSamsungFilter.dealerCode = { $in: dealerCode };
            samsungFilter['BUYER CODE'] = { $in: dealerCode };
        }

        // Fetch Samsung data only from `SalesDataMTDW`
        const samsungRecords = await SalesDataMTDW.find(samsungFilter).select({
            'MARKET': 1,
            'MODEL CODE': 1,
            'Segment Final': 1,
            'Segment New': 1,
            'MTD VALUE': 1,
            'MTD VOLUME': 1,
            'PRICE BAND': 1
        });

        // Process Samsung records to include only relevant data
        const samsungData = samsungRecords.map((record) => ({
            Brand: 'Samsung',
            Model: record['MARKET'] || record['MODEL CODE'] || 'N/A',
            Segment: record['Segment Final'] || record['Segment New'] || 'N/A',
            Value: parseFloat(record['MTD VALUE']) || 0,
            Volume: parseFloat(record['MTD VOLUME']) || 0
        }));

        // Fetch and process non-Samsung products from `ExtractionRecord`
        const nonSamsungProducts = await Product.find(productFilter).select('Brand Model Segment Price');
        const nonSamsungData = await Promise.all(nonSamsungProducts.map(async (product) => {
            const extractionRecords = await ExtractionRecord.find({ productId: product._id, ...nonSamsungFilter });
            const value = extractionRecords.reduce((sum, record) => sum + (valueVolume === 'value' ? record.totalPrice : record.quantity), 0);
            const volume = extractionRecords.reduce((sum, record) => sum + record.quantity, 0);

            return {
                Brand: product.Brand,
                Model: product.Model,
                Segment: product.Segment || 'N/A',
                Value: value,
                Volume: volume
            };
        }));

        // Combine Samsung and non-Samsung data
        let productData = [
            ...samsungData,
            ...nonSamsungData
        ];

        // Apply additional filters on combined data
        productData = productData.filter((item) => {
            if (brand && brand.length && !brand.includes(item.Brand)) return false;
            if (segment && segment.length && !segment.includes(item.Segment)) return false;
            return true;
        });

        // Calculate totalValue and totalVolume for shares if enabled
        let totalValue = 0;
        let totalVolume = 0;
        if (showShare === 'true') {
            totalValue = productData.reduce((sum, item) => sum + item.Value, 0);
            totalVolume = productData.reduce((sum, item) => sum + item.Volume, 0);
        }

        // Convert values to percentages if showShare is enabled
        const paginatedData = productData.slice((page - 1) * limit, page * limit).map((item, index) => ({
            serialNumber: (page - 1) * limit + index + 1,
            Brand: item.Brand,
            Model: item.Model,
            Value: showShare === 'true' && totalValue > 0 ? ((item.Value / totalValue) * 100).toFixed(2) + '%' : item.Value,
            Volume: showShare === 'true' && totalVolume > 0 ? ((item.Volume / totalVolume) * 100).toFixed(2) + '%' : item.Volume,
            Segment: item.Segment
        }));

        return res.status(200).json({
            totalRecords: productData.length,
            data: paginatedData
        });
    } catch (error) {
        console.error('Error in getExtractionDataModelWiseForAdmins:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
















// Helper function to determine price class based on price
function getPriceClass(price) {
    if (price < 6000) return '<6k';
    if (price >= 6000 && price <= 10000) return '6-10k';
    if (price > 10000 && price <= 15000) return '10-15k';
    if (price > 15000 && price <= 20000) return '15-20k';
    if (price > 20000 && price <= 30000) return '20-30k';
    if (price > 30000 && price <= 40000) return '30-40k';
    if (price > 40000 && price <= 70000) return '40-70k';
    if (price > 70000 && price <= 100000) return '70-100k';
    if (price > 100000) return '100k';
    // if (price > 40000) return 'Above 40k';
    // if (price <= 40000) return 'Below 40k';
    return null;
}


// exports.getExtractionOverviewForAdmins = async (req, res) => {
//     try {
//         let { startDate, endDate, valueVolume = 'value', segment, dealerCode, tse, type, area, tlName, abm, ase, asm, rso, zsm, page = 1, limit = 100, showShare = 'false' } = req.query;

//         console.log("Start date, end date: ", startDate, endDate);

//         const filter = {};
//         const samsungFilter = {};

//         const formatDate = (date) => {
//             const d = new Date(date);
//             const month = d.getMonth() + 1;
//             const day = d.getDate();
//             const year = d.getFullYear();
//             return `${month}/${day}/${year}`;
//         };

//         // Apply date range filter for general data
//         if (startDate && endDate) {
//             const parsedStartDate = new Date(startDate);
//             const parsedEndDate = new Date(endDate);
            
//             // Validate date range
//             if (parsedStartDate > parsedEndDate) {
//                 return res.status(400).json({ error: 'Start date must be before or equal to end date.' });
//             }
            
//             // General filter applies the provided date range
//             filter.date = { $gte: parsedStartDate, $lte: parsedEndDate };

//             // For Samsung, match the same day range in the previous month
//             const previousMonthStart = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth() - 1, parsedStartDate.getDate());
//             const previousMonthEnd = new Date(parsedEndDate.getFullYear(), parsedEndDate.getMonth() - 1, parsedEndDate.getDate());
            
//             samsungFilter.DATE = { 
//                 $gte: formatDate(previousMonthStart), 
//                 $lte: formatDate(previousMonthEnd) 
//             };
//             console.log("Samsung filter date (previous month same days): ", samsungFilter.DATE);
//         } else {
//             // Default behavior when no dates are provided
//             let today = new Date();
//             let firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
//             let firstDayOfPreviousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
//             let lastDayOfPreviousMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            
//             filter.date = { $gte: firstDayOfCurrentMonth };
//             samsungFilter.DATE = { 
//                 $gte: formatDate(firstDayOfPreviousMonth), 
//                 $lte: formatDate(lastDayOfPreviousMonth) 
//             };
//         }


//         // Construct dealer-specific filters dynamically based on the provided filters
//         const dealerFilters = {};
//         if (tse && tse.length) {
//             dealerFilters.TSE = { $in: tse };
//         }
//         if (zsm && zsm.length) {
//             dealerFilters.ZSM = { $in: zsm };
//         }
//         if (area && area.length) {
//             dealerFilters.Area = { $in: area };
//         }
//         if (tlName && tlName.length) {
//             dealerFilters['TL NAME'] = { $in: tlName };
//         }
//         if (abm && abm.length) {
//             dealerFilters.ABM = { $in: abm };
//         }
//         if (ase && ase.length) {
//             dealerFilters.ASE = { $in: ase };
//         }
//         if (asm && asm.length) {
//             dealerFilters.ASM = { $in: asm };
//         }
//         if (rso && rso.length) {
//             dealerFilters.RSO = { $in: rso };
//         }
//         if (type && type.length) {
//             dealerFilters.TYPE = { $in: type };
//         }

//         console.log("Dealer Filters: ", dealerFilters);

//         // Fetch dealer codes based on the combined filters from DealerListTseWise
//         // Fetch dealer codes based on the combined filters from DealerListTseWise
//         let dealerCodes = [];
//         if (Object.keys(dealerFilters).length > 0) {
//             // Use bracket notation to select 'Dealer Code'
//             const dealers = await DealerListTseWise.find(dealerFilters).select({ 'Dealer Code': 1 });
//             console.log("Dealers fetched:", dealers); // Log the full dealer objects to check the structure

//             // Inspect the structure of a single dealer object
//             if (dealers.length > 0) {
//                 console.log("Example dealer object:", dealers[0]);
//             }

//             // Map the dealer codes using bracket notation
//             dealerCodes = dealers.map(dealer => dealer['Dealer Code']);
//         }

//         console.log("Dealer codes filtered: ", dealerCodes);



//         // console.log("Dealers: ", dealers);

//         // If dealerCode is provided in the request, combine it with the dealerCodes fetched above
//         if (dealerCode && dealerCode.length) {
//             dealerCodes = dealerCodes.length ? dealerCodes.filter(code => dealerCode.includes(code)) : dealerCode;
//         }

//         // Apply the filtered dealer codes to the main query
//         if (dealerCodes.length > 0) {
//             filter.dealerCode = { $in: dealerCodes };
//             samsungFilter['BUYER CODE'] = { $in: dealerCodes };
//         }

//         // Fetch extraction data for other brands
//         const extractionRecords = await ExtractionRecord.find(filter)
//             .populate({ path: 'productId', select: 'Brand Model Price Category' });

//         // Initialize price classes and brands
//         const priceClasses = {
//             '<6k': {}, '6-10k': {}, '10-15k': {}, '15-20k': {}, '20-30k': {}, '30-40k': {},
//             '40-70k': {}, '70-100k': {}, '100k': {}, 
//         };
//         const brands = ['Samsung', 'Vivo', 'Oppo', 'Xiaomi', 'Apple', 'OnePlus', 'Realme', 'Motorola', 'Others'];

//         // Initialize brand data structure
//         const brandData = {};
//         Object.keys(priceClasses).forEach((priceClass) => {
//             brandData[priceClass] = brands.reduce((acc, brand) => {
//                 acc[brand] = 0;
//                 return acc;
//             }, {});
//         });

//         // Process extraction records for non-Samsung brands
//         extractionRecords.forEach((record) => {
//             const product = record.productId;
//             const price = record.totalPrice / record.quantity;
//             let priceClass = getPriceClass(price);

//             if (!priceClass) return;

//             const brand = brands.includes(product.Brand) ? product.Brand : 'Others';
//             const valueToAdd = valueVolume === 'value' ? record.totalPrice : record.quantity;

//             brandData[priceClass][brand] += valueToAdd;
//         });

//         // Fetch Samsung's sales data from SalesDataMTDW
//         samsungFilter['SALES TYPE'] = 'Sell Out';
//         samsungFilter['SELLER NAME'] = 'SIDDHA CORPORATION';
//         console.log("Samsung filter jb: ", samsungFilter);
//         const samsungSalesData = await SalesDataMTDW.find(samsungFilter);

//         // Process Samsung's sales data
//         samsungSalesData.forEach((record) => {
//             const mtdValue = Number(record['MTD VALUE']);
//             const mtdVolume = Number(record['MTD VOLUME']);
//             const price = mtdValue / mtdVolume;

//             let priceClass = getPriceClass(price);
//             if (!priceClass) return;

//             const valueToAdd = valueVolume === 'value' ? mtdValue : mtdVolume;

//             brandData[priceClass]['Samsung'] += valueToAdd;
//         });

//         // Calculate Samsung's rank for each price class
//         const rankData = {};
//         Object.keys(brandData).forEach((priceClass) => {
//             const sortedBrands = Object.entries(brandData[priceClass]).sort((a, b) => b[1] - a[1]);
//             const samsungRank = sortedBrands.findIndex(([brand]) => brand === 'Samsung') + 1;
//             rankData[priceClass] = samsungRank || 0;
//         });

//         // Generate the response
//         let response = Object.keys(priceClasses).map((priceClass) => {
//             const rowData = {
//                 'Price Class': priceClass,
//                 Samsung: brandData[priceClass]['Samsung'],
//                 Vivo: brandData[priceClass]['Vivo'],
//                 Oppo: brandData[priceClass]['Oppo'],
//                 Xiaomi: brandData[priceClass]['Xiaomi'],
//                 Apple: brandData[priceClass]['Apple'],
//                 'One Plus': brandData[priceClass]['OnePlus'],
//                 'Real Me': brandData[priceClass]['Realme'],
//                 Motorola: brandData[priceClass]['Motorola'],
//                 Others: brandData[priceClass]['Others'],
//                 'Rank of Samsung': rankData[priceClass] || 0
//             };

//             const totalForPriceClass = rowData.Samsung + rowData.Vivo + rowData.Oppo + rowData.Xiaomi +
//                                        rowData.Apple + rowData['One Plus'] + rowData['Real Me'] +
//                                        rowData.Motorola + rowData.Others;

//             if (showShare === 'true' && totalForPriceClass > 0) {
//                 Object.keys(rowData).forEach(brand => {
//                     if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
//                         rowData[brand] = ((rowData[brand] / totalForPriceClass) * 100).toFixed(2);
//                     }
//                 });
//             }

//             return rowData;
//         });

//         // Apply segment filter after generating the response
//         if (segment && segment.length) {
//             const normalizedSegments = segment.map((seg) => seg.toLowerCase());
//             response = response.filter((row) => normalizedSegments.includes(row['Price Class'].toLowerCase()));
//         }

//         // Add totals row
//         const totalsRow = {
//             'Price Class': 'Totals',
//             Samsung: 0, Vivo: 0, Oppo: 0, Xiaomi: 0, Apple: 0, 'One Plus': 0, 'Real Me': 0, Motorola: 0, Others: 0,
//             'Rank of Samsung': 0
//         };

//         let overallTotal = { Samsung: 0, Vivo: 0, Oppo: 0, Xiaomi: 0, Apple: 0, 'One Plus': 0, 'Real Me': 0, Motorola: 0, Others: 0 };
//         let totalSalesVolume = 0;

//         // Sum the total sales/volume for each brand across all price classes
//         response.forEach((row) => {
//             if (row['Price Class'] !== 'Totals') {
//                 overallTotal.Samsung += parseFloat(row.Samsung) || 0;
//                 overallTotal.Vivo += parseFloat(row.Vivo) || 0;
//                 overallTotal.Oppo += parseFloat(row.Oppo) || 0;
//                 overallTotal.Xiaomi += parseFloat(row.Xiaomi) || 0;
//                 overallTotal.Apple += parseFloat(row.Apple) || 0;
//                 overallTotal['One Plus'] += parseFloat(row['One Plus']) || 0;
//                 overallTotal['Real Me'] += parseFloat(row['Real Me']) || 0;
//                 overallTotal.Motorola += parseFloat(row.Motorola) || 0;
//                 overallTotal.Others += parseFloat(row.Others) || 0;
//             }
//         });

//         totalSalesVolume = Object.values(overallTotal).reduce((sum, value) => sum + value, 0);

//         if (showShare === 'true' && totalSalesVolume > 0) {
//             Object.keys(overallTotal).forEach((brand) => {
//                 totalsRow[brand] = ((overallTotal[brand] / totalSalesVolume) * 100).toFixed(2);
//             });
//         } else {
//             Object.assign(totalsRow, overallTotal);
//         }

//         // Determine rank for totals
//         const totalsRankData = [
//             ['Samsung', totalsRow.Samsung],
//             ['Vivo', totalsRow.Vivo],
//             ['Oppo', totalsRow.Oppo],
//             ['Xiaomi', totalsRow.Xiaomi],
//             ['Apple', totalsRow.Apple],
//             ['One Plus', totalsRow['One Plus']],
//             ['Real Me', totalsRow['Real Me']],
//             ['Motorola', totalsRow.Motorola],
//             ['Others', totalsRow.Others]
//         ];

//         totalsRankData.sort((a, b) => b[1] - a[1]);
//         totalsRow['Rank of Samsung'] = totalsRankData.findIndex(([brand]) => brand === 'Samsung') + 1;

//         // Add the totals row to the response
//         response.push(totalsRow);

//         return res.status(200).json({
//             totalRecords: response.length,
//             data: response
//         });

//     } catch (error) {
//         console.error('Error in getExtractionOverviewForAdmins:', error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };

















