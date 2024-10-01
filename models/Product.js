const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    Brand: { type: String, required: true },
    Model: { type: String, required: true },
    ProductCode: { type: String, required: false },
    Price: { type: Number, required: true },
    Segment: { type: String, required: false },
    Category: {
        type: String,
        enum: ['smartphone', 'tab', 'wearable'],
        default: 'smartphone'
    },
    Status: { 
        type: String, 
        enum: ['live', 'draft'], 
        default: 'draft' 
    },
    Specs: { type: String, required: false } // Optional field for specifications like Storage, Processor, etc.
}, { strict: false, timestamps: true });

module.exports = mongoose.model('Product', productSchema);


