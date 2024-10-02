const mongoose = require('mongoose');

const extractionRecordSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    dealerCode: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    quantity: {
        type: Number,
        required: true
    },
    uploadedBy: {
        type: String,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    remarks: {
        type: String,
        required: false
    }
}, { strict: false, timestamps: true });

const ExtractionRecord = mongoose.model('ExtractionRecord', extractionRecordSchema);

module.exports = ExtractionRecord;
