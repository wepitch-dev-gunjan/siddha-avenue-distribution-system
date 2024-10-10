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








// exports.getExtractionReportForAdmins = async (req, res) => {
//     try {
//         const { month, year } = req.query;

//         if (!month || !year) {
//             return res.status(400).json({ error: 'Please provide both month and year.' });
//         }

//         // Calculate the start and end date for the given month
//         const startDate = new Date(year, month - 1, 1); // First day of the month
//         const endDate = new Date(year, month, 0); // Last day of the month

//         // Fetch the extraction records directly using the logic from getExtractionRecordsForAMonth
//         const extractionRecords = await ExtractionRecord.find({
//             date: {
//                 $gte: startDate,
//                 $lte: endDate
//             }
//         }).populate({
//             path: 'productId',
//             select: 'Brand Model Price Segment Category Status' // Only select these fields from the Product model
//         });

//         if (!extractionRecords || extractionRecords.length === 0) {
//             return res.status(200).json({ message: 'No records found for the given month.' });
//         }

//         console.log("Extraction records: ", extractionRecords);

//         // Initialize the report structure with placeholders
//         const report = {
//             year,
//             overallValues: [],
//             brandSegments: [],
//             priceRanges: {
//                 "40K+": { total: 0 },
//                 "30-40K": { total: 0 },
//                 "20-30K": { total: 0 },
//                 "15-20K": { total: 0 },
//                 "10-15K": { total: 0 },
//                 "<10K": { total: 0 },
//             },
//         };

//         const brands = ['Samsung', 'Apple', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Sony', 'Motorola', 'Nothing', 'Google'];

//         brands.forEach((brand) => {
//             report.brandSegments.push({
//                 brand,
//                 overallValue: 0,
//                 sharePercentage: 0,
//                 segments: {
//                     "40K+": { value: 0, share: 0 },
//                     "30-40K": { value: 0, share: 0 },
//                     "20-30K": { value: 0, share: 0 },
//                     "15-20K": { value: 0, share: 0 },
//                     "10-15K": { value: 0, share: 0 },
//                     "<10K": { value: 0, share: 0 },
//                 }
//             });
//         });

//         // Fetch all dealers to include in the report
//         const allDealers = await Dealer.find().select('dealerCode shopName'); 
//         const aggregatedDealers = {};

//         // Initialize each dealer with zero values
//         allDealers.forEach(dealer => {
//             aggregatedDealers[dealer.dealerCode] = {
//                 'Dealer Code': dealer.dealerCode,
//                 'Shop Name': dealer.shopName,
//                 values: {},
//                 total: 0,
//             };

//             brands.forEach((brand) => {
//                 aggregatedDealers[dealer.dealerCode].values[brand] = {
//                     overallValue: 0,
//                     segments: {
//                         "40K+": 0,
//                         "30-40K": 0,
//                         "20-30K": 0,
//                         "15-20K": 0,
//                         "10-15K": 0,
//                         "<10K": 0,
//                     }
//                 };
//             });
//         });

//         for (const record of extractionRecords) {
//             const { Brand: brand, Segment: segment, dealerCode, quantity, totalPrice } = record;

//             // Only process if the brand is in our list and dealer exists
//             if (brands.includes(brand) && aggregatedDealers[dealerCode]) {
//                 const dealerData = aggregatedDealers[dealerCode];
//                 dealerData.values[brand].overallValue += totalPrice;

//                 // Aggregate by segment if it's valid
//                 if (report.priceRanges[segment]) {
//                     dealerData.values[brand].segments[segment] += totalPrice;
//                     report.priceRanges[segment].total += totalPrice;
//                 }

//                 dealerData.total += totalPrice;
//             }
//         }

//         report.brandSegments.forEach((brandData) => {
//             brandData.overallValue = Object.values(aggregatedDealers).reduce((acc, dealer) => acc + dealer.values[brandData.brand].overallValue, 0);

//             const overallValue = report.overallValues.reduce((acc, val) => acc + val, 0);
//             if (overallValue > 0) {
//                 brandData.sharePercentage = (brandData.overallValue / overallValue) * 100;
//             }

//             Object.keys(brandData.segments).forEach((segment) => {
//                 const totalSegmentValue = report.priceRanges[segment].total;
//                 if (totalSegmentValue > 0) {
//                     brandData.segments[segment].share = (brandData.segments[segment].value / totalSegmentValue) * 100;
//                 }
//             });
//         });

//         const formattedReport = {
//             year: report.year,
//             overallValues: report.overallValues,
//             brands: report.brandSegments.map((brand) => ({
//                 name: brand.brand,
//                 overallValue: brand.overallValue,
//                 sharePercentage: brand.sharePercentage,
//                 segments: brand.segments,
//             })),
//             priceRanges: report.priceRanges,
//             dealers: Object.values(aggregatedDealers),
//         };

//         return res.status(200).json(formattedReport);

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };



// exports.getExtractionReportForAdmins = async (req, res) => {
//     try {
//         // Extract the month and year from the request query parameters (assume format YYYY-MM)
//         const { month, year } = req.query;

//         // Validate the month and year
//         if (!month || !year) {
//             return res.status(400).json({ error: 'Please provide both month and year.' });
//         }
//         console.log("Month n year: ", month, year);

//         // Fetch data from the /record/extraction/for-a-month API
//         const apiUrl = `${BACKEND_URL}/record/extraction/for-a-month?month=${month}&year=${year}`;
//         const response = await axios.get(apiUrl);

//         // Ensure we have a valid response and extract the records
//         const records = response.data.records;

//         if (!records || records.length === 0) {
//             return res.status(200).json({ message: 'No records found for the given month.' });
//         }

//         // Initialize the report structure
//         const report = {
//             year,
//             overallValues: [],
//             brandSegments: [],
//             priceRanges: {
//                 "40K+": {},
//                 "30-40K": {},
//                 "20-30K": {},
//                 "15-20K": {},
//                 "10-15K": {},
//                 "<10K": {},
//                 // Add more price ranges as needed
//             },
//         };

//         // List of brands to analyze
//         const brands = ['Samsung', 'Apple', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Sony', 'Motorola', 'Nothing', 'Google'];

//         // Initialize brand and segment data
//         brands.forEach((brand) => {
//             report.brandSegments.push({
//                 brand,
//                 overallValue: 0,
//                 sharePercentage: 0,
//                 segments: {
//                     "40K+": { value: 0, share: 0 },
//                     "30-40K": { value: 0, share: 0 },
//                     "20-30K": { value: 0, share: 0 },
//                     "15-20K": { value: 0, share: 0 },
//                     "10-15K": { value: 0, share: 0 },
//                     "<10K": { value: 0, share: 0 },
//                 }
//             });
//         });

//         // Aggregate and compute the report
//         records.forEach((record) => {
//             const { Brand: brand, 'MTD Value': value, Segment: segment } = record;

//             // Only process if the brand is in our list
//             if (brands.includes(brand)) {
//                 // Find the brand segment in the report structure
//                 const brandData = report.brandSegments.find(b => b.brand === brand);

//                 // Update overall value for the brand
//                 brandData.overallValue += value;

//                 // Aggregate by segment
//                 if (report.priceRanges[segment]) {
//                     brandData.segments[segment].value += value;
//                 }

//                 // Also, update the overall totals per segment
//                 if (!report.priceRanges[segment].total) {
//                     report.priceRanges[segment].total = 0;
//                 }
//                 report.priceRanges[segment].total += value;
//             }
//         });

//         // Calculate share percentages for each brand and segment
//         report.brandSegments.forEach((brandData) => {
//             const overallValue = report.overallValues.reduce((acc, val) => acc + val, 0);
//             if (overallValue > 0) {
//                 brandData.sharePercentage = (brandData.overallValue / overallValue) * 100;
//             }

//             Object.keys(brandData.segments).forEach((segment) => {
//                 if (report.priceRanges[segment] && report.priceRanges[segment].total > 0) {
//                     brandData.segments[segment].share = (brandData.segments[segment].value / report.priceRanges[segment].total) * 100;
//                 }
//             });
//         });

//         // Format the report response
//         const formattedReport = {
//             year: report.year,
//             overallValues: report.overallValues,
//             brands: report.brandSegments.map((brand) => ({
//                 name: brand.brand,
//                 overallValue: brand.overallValue,
//                 sharePercentage: brand.sharePercentage,
//                 segments: brand.segments,
//             })),
//             priceRanges: report.priceRanges,
//         };

//         // Return the formatted report
//         return res.status(200).json(formattedReport);

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };



// exports.getExtractionReportForAdmins = async (req, res) => {
//     try {
//         // Extract the month and year from the request query parameters (assume format YYYY-MM)
//         const { month, year } = req.query;

//         // Validate the month and year
//         if (!month || !year) {
//             return res.status(400).json({ error: 'Please provide both month and year.' });
//         }

//         // List of brands to analyze
//         const brands = ['Samsung', 'Apple', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Sony', 'Motorola', 'Nothing', 'Google'];

//         // Calculate the start and end date for the given month
//         const startDate = new Date(year, month - 1, 1); // First day of the month
//         const endDate = new Date(year, month, 0); // Last day of the month

//         // Fetch all dealers from the database
//         const allDealers = await Dealer.find().select('dealerCode shopName');

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

//         // Create a map for aggregation by dealer and TSE
//         const aggregatedData = {};

//         // Iterate through extraction records and aggregate data
//         for (const record of extractionRecords) {
//             const dealerCode = record.dealerCode;
//             const uploadedBy = record.uploadedBy;
//             const brand = record.productId.Brand;

//             // If the brand is not in the target list, continue to the next record
//             if (!brands.includes(brand)) continue;

//             // Create a unique key for each dealer and employee (TSE)
//             const key = `${dealerCode}-${uploadedBy}`;

//             // Initialize the aggregated data if not existing
//             if (!aggregatedData[key]) {
//                 const employee = await EmployeeCode.findOne({ Code: uploadedBy }).select('Name');

//                 // Initialize the record for all brands with default values set to 0
//                 aggregatedData[key] = {
//                     'Dealer Code': dealerCode,
//                     'Shop Name': record.shopName,
//                     'TSE': employee ? employee.Name : 'N/A', // Employee name (TSE)
//                     'TSE Code': uploadedBy, // Uploaded by (TSE Code),
//                     Brands: {
//                         Samsung: 0,
//                         Apple: 0,
//                         Oppo: 0,
//                         Vivo: 0,
//                         OnePlus: 0,
//                         Realme: 0,
//                         Sony: 0,
//                         Motorola: 0,
//                         Nothing: 0,
//                         Google: 0
//                     },
//                     'Total Volume': 0, // Total quantity for the dealer and TSE
//                     'Total Value': 0 // Total price for the dealer and TSE
//                 };
//             }

//             // Add the quantity and total price to the specific brand
//             aggregatedData[key].Brands[brand] += record.quantity;
//             aggregatedData[key]['Total Volume'] += record.quantity;
//             aggregatedData[key]['Total Value'] += record.totalPrice;
//         }

//         // Map aggregated data to all dealers, setting default values for missing data
//         const recordsWithDetails = allDealers.map((dealer) => {
//             // Check if this dealer has any data, otherwise set default values
//             const dealerEntries = Object.values(aggregatedData).filter(entry => entry['Dealer Code'] === dealer.dealerCode);

//             if (dealerEntries.length > 0) {
//                 return dealerEntries;
//             } else {
//                 // If no entries exist for the dealer, create a default entry with 0 values
//                 return {
//                     'Dealer Code': dealer.dealerCode,
//                     'Shop Name': dealer.shopName,
//                     'TSE': 'N/A', // No TSE data available
//                     'TSE Code': 'N/A', // No TSE code available
//                     Brands: {
//                         Samsung: 0,
//                         Apple: 0,
//                         Oppo: 0,
//                         Vivo: 0,
//                         OnePlus: 0,
//                         Realme: 0,
//                         Sony: 0,
//                         Motorola: 0,
//                         Nothing: 0,
//                         Google: 0
//                     },
//                     'Total Volume': 0,
//                     'Total Value': 0
//                 };
//             }
//         });

//         // Add the column names as the first entry in the array
//         const columns = {
//             columns: [
//                 'Dealer Code', 'Shop Name', 'TSE', 'TSE Code', 'Samsung', 'Apple', 'Oppo', 'Vivo',
//                 'OnePlus', 'Realme', 'Sony', 'Motorola', 'Nothing', 'Google', 'Total Volume', 'Total Value'
//             ]
//         };

//         // Insert the columns at the beginning of the response array
//         recordsWithDetails.unshift(columns);

//         return res.status(200).json({ records: recordsWithDetails });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };

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
//                     'TSE Code': uploadedBy // Uploaded by (TSE Code)
//                 };
//             }

//             // Aggregate the quantity (MTD Volume) and total price (MTD Value)
//             aggregatedData[key]['MTD Volume'] += record.quantity;
//             aggregatedData[key]['MTD Value'] += record.totalPrice;
//         }

//         // Convert the aggregated data object to an array
//         const recordsWithDetails = Object.values(aggregatedData);

//         // Define the columns for the CSV
//         const columns = ['ID', 'Dealer Code', 'Shop Name', 'Brand', 'Model', 'Category', 'MTD Volume', 'MTD Value', 'Segment', 'TSE', 'TSE Code'];

//         // Build the CSV content as a string
//         let csvContent = columns.join(',') + '\n'; // Add the header row

//         recordsWithDetails.forEach(record => {
//             // Remove commas from numeric values
//             const formattedRecord = {
//                 ...record,
//                 'MTD Value': record['MTD Value'].toString().replace(/,/g, ''), // Remove commas from 'MTD Value'
//                 'MTD Volume': record['MTD Volume'].toString().replace(/,/g, '') // Remove commas from 'MTD Volume' if needed
//             };

//             const row = columns.map(column => formattedRecord[column]); // Extract values based on column names
//             csvContent += row.join(',') + '\n'; // Add each row to the CSV content
//         });

//         // Set the response headers for file download
//         res.header('Content-Type', 'text/csv');
//         res.header('Content-Disposition', 'attachment; filename="extraction_records.csv"');

//         // Send the CSV content as response
//         return res.status(200).send(csvContent);

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Internal Server Error' });
//     }
// };





