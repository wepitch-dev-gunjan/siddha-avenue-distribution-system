const axios = require('axios'); // To make API calls
const ExtractionRecord = require('../models/ExtractionRecord');
const { formatDate } = require('../helpers/extracttionHelpers');
const EmployeeCode = require('../models/EmployeeCode');
const Dealer = require('../models/Dealer');
const Product = require("../models/Product");
const SalesDataMTDW = require("../models/SalesDataMTDW");
const DealerListTseWise = require('../models/DealerListTseWise');
const User = require('../models/User');

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
        const {startDate, endDate} = req.query;


        // Validate if the code is present
        if (!code) {
            return res.status(400).json({ error: 'Employee code is required in the request.' });
        }

        let startOfFilterRange;
        let endOfFilterRange;

        if (startDate && endDate) {
            startOfFilterRange = new Date(Date.UTC(
                new Date(startDate).getUTCFullYear(),
                new Date(startDate).getUTCMonth(),
                new Date(startDate).getUTCDate()
            ));

            endOfFilterRange = new Date(Date.UTC(
                new Date(endDate).getUTCFullYear(),
                new Date(endDate).getUTCMonth(),
                new Date(endDate).getUTCDate(),
                23, 59, 59
            ));

        } else {
            const now = new Date();
            startOfFilterRange = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            endOfFilterRange = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
        }

        console.log("Filter Start Date (UTC): ", startOfFilterRange);
        console.log("Filter End Date (UTC): ", endOfFilterRange);

        // Find extraction records that match the uploadedBy field with the code from the token
        const extractionRecords = await ExtractionRecord.find({ 
            uploadedBy: code, 
            createdAt: {$gte: startOfFilterRange, $lte: endOfFilterRange}
        }).populate({
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
                totalPrice: record.totalPrice,

                // remove later
                uploadedBy: record.uploadedBy,
                createdAt: record.createdAt
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
        console.log("Column: ", column);

        if (!column) {
            return res.status(400).json({ error: 'Please specify a column to fetch unique values.' });
        }

        let uniqueValues;

        if (column === 'state'){
            uniqueValues = ["Rajasthan"]
        } 
        else if (column === 'district') 
        {
            uniqueValues = ['Jaipur']
        } 
        else if (column === 'town') 
        {
            uniqueValues = ['Jaipur']
        } 
        else if (column === 'uploadedBy')
        {
            
            const uploadedByCodes = await ExtractionRecord.distinct('uploadedBy');

            if (!uploadedByCodes || uploadedByCodes.length === 0) {
                return res.status(200).json({message: "No uploadedBy codes found!!"});
            }

            const employees = await User.find({ code: {$in: uploadedByCodes} }, { name: 1, code: 1, _id: 0 });


            uniqueValues = uploadedByCodes.map(code => {
                const employee = employees.find(emp => emp.code === code);
                return employee ? employee.name : code;
            })

            console.log("TSEs: ", uniqueValues)
        } 
        else if (column.startsWith('productId.')) 
        {
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
        let { startDate, endDate, valueVolume = 'value', segment, dealerCode, tse, type, area, tlName, abm, ase, asm, rso, zsm, state, district, town, page = 1, limit = 100, showShare = 'false' } = req.body;

        console.log("Start date, end date: ", startDate, endDate, showShare);
        console.log("dealerCode: ", dealerCode);
        console.log("TSE: ", tse);
        console.log("Type: ", type);
        console.log("Area: ", area);
        console.log("tlName: ", tlName);
        console.log("ABM: ", abm);
        console.log("ASE", ase);
        console.log("ASM: ", asm);
        console.log("RSO: ", rso);
        console.log("ZSM: ", zsm);
        console.log("State: ", state);
        console.log("District: ", district);
        console.log("Town: ", town);

        const filter = {};
        const samsungFilter = {};

        const formatDate = (date) => {
            const d = new Date(date);
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const year = d.getFullYear();
            return `${month}/${day}/${year}`;
        };

        if (startDate && endDate) {
            const parsedStartDate = new Date(startDate);
            const parsedEndDate = new Date(endDate);

            if (parsedStartDate > parsedEndDate) {
                return res.status(400).json({ error: 'Start date must be before or equal to end date.' });
            }

            filter.date = { $gte: parsedStartDate, $lte: parsedEndDate };

            const previousMonthStart = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth() - 1, parsedStartDate.getDate());
            const previousMonthEnd = new Date(parsedEndDate.getFullYear(), parsedEndDate.getMonth() - 1, parsedEndDate.getDate());

            samsungFilter.DATE = {
                $gte: formatDate(previousMonthStart),
                $lt: formatDate(previousMonthEnd)
            };
            console.log("Samsung filter date (previous month same days): ", samsungFilter.DATE);

        } else {
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

        const dealerFilters = {};
        if (tse && tse.length) dealerFilters.TSE = { $in: tse };
        if (zsm && zsm.length) dealerFilters.ZSM = { $in: zsm };
        if (area && area.length) dealerFilters.Area = { $in: area };
        if (tlName && tlName.length) dealerFilters['TL NAME'] = { $in: tlName };
        if (abm && abm.length) dealerFilters.ABM = { $in: abm };
        if (ase && ase.length) dealerFilters.ASE = { $in: ase };
        if (asm && asm.length) dealerFilters.ASM = { $in: asm };
        if (rso && rso.length) dealerFilters.RSO = { $in: rso };
        if (type && type.length) dealerFilters.TYPE = { $in: type };

        // Geo filters
        if (state && state.length) dealerFilters['address.state'] = {$in: state};
        if (district && district.length) dealerFilters['address.district'] = {$in: district};
        if (town && town.length) dealerFilters['address.district.town'] = {$in: town};

        console.log("Dealer Filters: ", dealerFilters);

        let dealerCodes = [];
        if (Object.keys(dealerFilters).length > 0) {
            const dealers = await DealerListTseWise.find(dealerFilters).select({ 'Dealer Code': 1 });
            dealerCodes = dealers.map(dealer => dealer['Dealer Code']);
        }

        if (dealerCode && dealerCode.length) {
            dealerCodes = dealerCodes.length ? dealerCodes.filter(code => dealerCode.includes(code)) : dealerCode;
        }

        if (dealerCodes.length > 0) {
            filter.dealerCode = { $in: dealerCodes };
            samsungFilter['BUYER CODE'] = { $in: dealerCodes };
        }

        const extractionRecords = await ExtractionRecord.find(filter)
            .populate({ path: 'productId', select: 'Brand Model Price Category' });

        const priceClasses = {
            '<6k': {}, '6-10k': {}, '10-15k': {}, '15-20k': {}, '20-30k': {}, '30-40k': {},
            '40-70k': {}, '70-100k': {}, '100k': {}
        };
        const brands = ['Samsung', 'Vivo', 'Oppo', 'Xiaomi', 'Apple', 'OnePlus', 'Realme', 'Motorola', 'Others'];

        const brandData = {};
        Object.keys(priceClasses).forEach((priceClass) => {
            brandData[priceClass] = brands.reduce((acc, brand) => {
                acc[brand] = 0;
                return acc;
            }, {});
        });

        extractionRecords.forEach((record) => {
            const product = record.productId;
            const price = record.totalPrice / record.quantity;
            let priceClass = getPriceClass(price);

            if (!priceClass) return;

            const brand = brands.includes(product.Brand) ? product.Brand : 'Others';
            const valueToAdd = valueVolume === 'value' ? record.totalPrice : record.quantity;

            brandData[priceClass][brand] += valueToAdd;
        });

        samsungFilter['SALES TYPE'] = 'Sell Out';

        const samsungSalesData = await SalesDataMTDW.aggregate([
            {
                $addFields: {
                    parsedDate: {
                        $dateFromString: {
                            dateString: "$DATE",
                            format: "%m/%d/%Y",
                            timezone: "UTC"
                        }
                    }
                }
            },
            {
                $match: {
                    DATE: samsungFilter.DATE,
                    "SALES TYPE": "Sell Out",
                    ...(dealerCodes.length > 0 ? { "BUYER CODE": { $in: dealerCodes } } : {})
                }
            }
        ]);

        samsungSalesData.forEach((record) => {
            const mtdValue = Number(record['MTD VALUE']);
            const mtdVolume = Number(record['MTD VOLUME']);
            const price = mtdValue / mtdVolume;

            let priceClass = getPriceClass(price);
            if (!priceClass) return;

            const valueToAdd = valueVolume === 'value' ? mtdValue : mtdVolume;

            brandData[priceClass]['Samsung'] += valueToAdd;
        });

        const response = [];
        let rawTotalsRow = {
            'Price Class': 'Totals',
            Samsung: 0, Vivo: 0, Oppo: 0, Xiaomi: 0, Apple: 0, 'One Plus': 0, 'Real Me': 0, Motorola: 0, Others: 0,
            'Rank of Samsung': 0
        };

        // Step 1: Process all rows and calculate raw totals
        Object.keys(priceClasses).forEach((priceClass) => {
            const row = {
                'Price Class': priceClass,
                Samsung: brandData[priceClass]['Samsung'],
                Vivo: brandData[priceClass]['Vivo'],
                Oppo: brandData[priceClass]['Oppo'],
                Xiaomi: brandData[priceClass]['Xiaomi'],
                Apple: brandData[priceClass]['Apple'],
                'One Plus': brandData[priceClass]['OnePlus'],
                'Real Me': brandData[priceClass]['Realme'],
                Motorola: brandData[priceClass]['Motorola'],
                Others: brandData[priceClass]['Others']
            };

            response.push(row);

            Object.keys(rawTotalsRow).forEach((brand) => {
                if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
                    rawTotalsRow[brand] += parseFloat(row[brand]) || 0;
                }
            });
        });

        // Step 2: Calculate the overall total after processing all rows
        const overallTotal = Object.entries(rawTotalsRow)
            .filter(([brand]) => brand !== 'Price Class' && brand !== 'Rank of Samsung')
            .reduce((sum, [, value]) => sum + parseFloat(value || 0), 0);

        // Step 3: Adjust rows to reflect shares if showShare === 'true'
        if (showShare === 'true' && overallTotal > 0) {
            response.forEach((row) => {
                const rowTotal = Object.entries(row)
                    .filter(([brand]) => brand !== 'Price Class' && brand !== 'Rank of Samsung')
                    .reduce((sum, [, value]) => sum + parseFloat(value || 0), 0);
                console.log("Row Total: ", rowTotal);
                Object.keys(row).forEach((brand) => {
                    if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
                        row[brand] = ((row[brand] / rowTotal) * 100).toFixed(2);
                        row[brand] = row[brand].toString() + " %";
                        console.log("Row Brand: ", row[brand]);
                    }
                }
            );

            });


            Object.keys(rawTotalsRow).forEach((brand) => {
                if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
                    rawTotalsRow[brand] = (((rawTotalsRow[brand] / overallTotal) * 100).toFixed(2)).toString() + " %";

                    console.log("Row totals [brand]: ", rawTotalsRow[brand]);
                }
            });
        }

        response.push(rawTotalsRow);

        response.forEach((row) => {
            const rankData = Object.entries(row).filter(([brand]) => brand !== 'Price Class' && brand !== 'Rank of Samsung').sort(([, a], [, b]) => b - a);
            row['Rank of Samsung'] = rankData.findIndex(([brand]) => brand === 'Samsung') + 1;
        })

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

//         console.log("Start date, end date: ", startDate, endDate, showShare);

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

//             if (parsedStartDate > parsedEndDate) {
//                 return res.status(400).json({ error: 'Start date must be before or equal to end date.' });
//             }

//             filter.date = { $gte: parsedStartDate, $lte: parsedEndDate };

//             const previousMonthStart = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth() - 1, parsedStartDate.getDate());
//             const previousMonthEnd = new Date(parsedEndDate.getFullYear(), parsedEndDate.getMonth() - 1, parsedEndDate.getDate());

//             samsungFilter.DATE = {
//                 $gte: formatDate(previousMonthStart),
//                 $lt: formatDate(previousMonthEnd)
//             };
//             console.log("Samsung filter date (previous month same days): ", samsungFilter.DATE);

//         } else {
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

//         const dealerFilters = {};
//         if (tse && tse.length) dealerFilters.TSE = { $in: tse };
//         if (zsm && zsm.length) dealerFilters.ZSM = { $in: zsm };
//         if (area && area.length) dealerFilters.Area = { $in: area };
//         if (tlName && tlName.length) dealerFilters['TL NAME'] = { $in: tlName };
//         if (abm && abm.length) dealerFilters.ABM = { $in: abm };
//         if (ase && ase.length) dealerFilters.ASE = { $in: ase };
//         if (asm && asm.length) dealerFilters.ASM = { $in: asm };
//         if (rso && rso.length) dealerFilters.RSO = { $in: rso };
//         if (type && type.length) dealerFilters.TYPE = { $in: type };

//         console.log("Dealer Filters: ", dealerFilters);

//         let dealerCodes = [];
//         if (Object.keys(dealerFilters).length > 0) {
//             const dealers = await DealerListTseWise.find(dealerFilters).select({ 'Dealer Code': 1 });
//             dealerCodes = dealers.map(dealer => dealer['Dealer Code']);
//         }

//         if (dealerCode && dealerCode.length) {
//             dealerCodes = dealerCodes.length ? dealerCodes.filter(code => dealerCode.includes(code)) : dealerCode;
//         }

//         if (dealerCodes.length > 0) {
//             filter.dealerCode = { $in: dealerCodes };
//             samsungFilter['BUYER CODE'] = { $in: dealerCodes };
//         }

//         const extractionRecords = await ExtractionRecord.find(filter)
//             .populate({ path: 'productId', select: 'Brand Model Price Category' });

//         const priceClasses = {
//             '<6k': {}, '6-10k': {}, '10-15k': {}, '15-20k': {}, '20-30k': {}, '30-40k': {},
//             '40-70k': {}, '70-100k': {}, '100k': {},
//         };
//         const brands = ['Samsung', 'Vivo', 'Oppo', 'Xiaomi', 'Apple', 'OnePlus', 'Realme', 'Motorola', 'Others'];

//         const brandData = {};
//         Object.keys(priceClasses).forEach((priceClass) => {
//             brandData[priceClass] = brands.reduce((acc, brand) => {
//                 acc[brand] = 0;
//                 return acc;
//             }, {});
//         });

//         extractionRecords.forEach((record) => {
//             const product = record.productId;
//             const price = record.totalPrice / record.quantity;
//             let priceClass = getPriceClass(price);

//             if (!priceClass) return;

//             const brand = brands.includes(product.Brand) ? product.Brand : 'Others';
//             const valueToAdd = valueVolume === 'value' ? record.totalPrice : record.quantity;

//             brandData[priceClass][brand] += valueToAdd;
//         });

//         samsungFilter['SALES TYPE'] = 'Sell Out';

//         const samsungSalesData = await SalesDataMTDW.aggregate([
//             {
//                 $addFields: {
//                     parsedDate: {
//                         $dateFromString: {
//                             dateString: "$DATE",
//                             format: "%m/%d/%Y",
//                             timezone: "UTC"
//                         }
//                     }
//                 }
//             },
//             {
//                 $match: {
//                     DATE: samsungFilter.DATE,
//                     "SALES TYPE": "Sell Out",
//                     ...(dealerCodes.length > 0 ? { "BUYER CODE": { $in: dealerCodes } } : {})
//                 }
//             }
//         ]);

//         samsungSalesData.forEach((record) => {
//             const mtdValue = Number(record['MTD VALUE']);
//             const mtdVolume = Number(record['MTD VOLUME']);
//             const price = mtdValue / mtdVolume;

//             let priceClass = getPriceClass(price);
//             if (!priceClass) return;

//             const valueToAdd = valueVolume === 'value' ? mtdValue : mtdVolume;

//             brandData[priceClass]['Samsung'] += valueToAdd;
//         });

//         const response = [];
//         let totalsRow = {
//             'Price Class': 'Totals',
//             Samsung: 0, Vivo: 0, Oppo: 0, Xiaomi: 0, Apple: 0, 'One Plus': 0, 'Real Me': 0, Motorola: 0, Others: 0,
//             'Rank of Samsung': 0
//         };

//         Object.keys(priceClasses).forEach((priceClass) => {
//             const row = {
//                 'Price Class': priceClass,
//                 Samsung: brandData[priceClass]['Samsung'],
//                 Vivo: brandData[priceClass]['Vivo'],
//                 Oppo: brandData[priceClass]['Oppo'],
//                 Xiaomi: brandData[priceClass]['Xiaomi'],
//                 Apple: brandData[priceClass]['Apple'],
//                 'One Plus': brandData[priceClass]['OnePlus'],
//                 'Real Me': brandData[priceClass]['Realme'],
//                 Motorola: brandData[priceClass]['Motorola'],
//                 Others: brandData[priceClass]['Others']
//             };

//             // Calculate row-level total for shares
//             const rowTotal = Object.values(row)
//                 .filter((value) => typeof value === 'number')
//                 .reduce((sum, value) => sum + value, 0);

//             // Calculate shares for the row
//             if (showShare === 'true' && rowTotal > 0) {
//                 Object.keys(row).forEach((brand) => {
//                     if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
//                         row[brand] = ((row[brand] / rowTotal) * 100).toFixed(2);
//                     }
//                 });
//             }

//             // Calculate rank for the row
//             const rankData = Object.entries(row)
//                 .filter(([brand]) => brand !== 'Price Class' && brand !== 'Rank of Samsung')
//                 .sort(([, a], [, b]) => b - a);

//             row['Rank of Samsung'] = rankData.findIndex(([brand]) => brand === 'Samsung') + 1;

//             response.push(row);

//             // Update totals row
//             Object.keys(totalsRow).forEach((brand) => {
//                 if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
//                     totalsRow[brand] += parseFloat(row[brand]) || 0;
//                 }
//             });
//         });

//         const rawTotalsRow = JSON.parse(JSON.stringify(totalsRow));
//         const overallTotal = Object.entries(rawTotalsRow)
//             .filter(([brand]) => brand !== 'Price Class' && brand !== 'Rank of Samsung')
//             .map(([, value]) => value)
//             .reduce((sum, value) => sum + value, 0);

//         // Finalize totals row for shares if needed
//         if (showShare === 'true' && overallTotal > 0) {
//             Object.keys(totalsRow).forEach((brand) => {
//                 if (brand !== 'Price Class' && brand !== 'Rank of Samsung') {
//                     totalsRow[brand] = ((rawTotalsRow[brand] / overallTotal) * 100).toFixed(2);
//                 }
//             });
//         }

//         totalsRow['Rank of Samsung'] = Object.entries(rawTotalsRow)
//             .filter(([brand]) => brand !== 'Price Class' && brand !== 'Rank of Samsung')
//             .sort(([, a], [, b]) => b - a)
//             .findIndex(([brand]) => brand === 'Samsung') + 1;

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



// exports.getUniqueColumnValues = async (req, res) => {
//     try {
//         const { column } = req.query;
//         console.log("Column: ", column);

//         if (!column) {
//             return res.status(400).json({ error: 'Please specify a column to fetch unique values.' });
//         }

//         let uniqueValues;

//         if (column.startsWith('productId.')) {
//             // Query unique values from the Product model for fields like Brand or Segment
//             const aggregationResult = await ExtractionRecord.aggregate([
//                 {
//                     $lookup: {
//                         from: 'products',
//                         localField: 'productId',
//                         foreignField: '_id',
//                         as: 'productInfo'
//                     }
//                 },
//                 {
//                     $unwind: '$productInfo'
//                 },
//                 {
//                     $group: {
//                         _id: `$productInfo.${column.split('.')[1]}`,
//                     }
//                 },
//                 {
//                     $project: {
//                         _id: 0,
//                         uniqueValue: '$_id'
//                     }
//                 }
//             ]);

//             uniqueValues = aggregationResult.map((item) => item.uniqueValue);

//             // Include "Samsung" explicitly in the brand list if column is brand
//             if (column === 'productId.Brand' && !uniqueValues.includes("Samsung")) {
//                 uniqueValues.unshift("Samsung");
//             }

//         } else if (['type', 'area', 'tlname', 'abm', 'ase', 'asm', 'rso', 'zsm'].includes(column.toLowerCase())) {
//             // Query specific columns from the DealerListTseWise model
//             uniqueValues = await DealerListTseWise.distinct(column);
//         } else {
//             // Query distinct values from ExtractionRecord itself for other fields
//             uniqueValues = await ExtractionRecord.distinct(column);
//         }

//         if (!uniqueValues || uniqueValues.length === 0) {
//             return res.status(200).json({ message: `No unique values found for column: ${column}` });
//         }

//         return res.status(200).json({ uniqueValues });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };










