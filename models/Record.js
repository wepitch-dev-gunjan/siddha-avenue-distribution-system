const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
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
    modeOfPayment: {
        type: String,
        enum: ['Online', 'Offline'],
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

const Record = mongoose.model('Record', recordSchema);

module.exports = Record;
