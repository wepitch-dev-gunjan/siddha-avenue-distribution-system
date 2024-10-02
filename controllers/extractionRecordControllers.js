const axios = require('axios'); // To make API calls
const ExtractionRecord = require('../models/ExtractionRecord');

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
