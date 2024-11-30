const { Schema, model } = require('mongoose');

const dealerSchema = new Schema({
  dealerCode: {
    type: String,
    required: true
  },
  shopName: {
    type: String,
    required: true
  },
  shopArea: {
    type: String,
    required: true
  },
  address: {
    state: { type: String, default: "Rajasthan" },
    district: { type: String, default: "Jaipur" },
    town: { type: String, default: "" },
  },
  shopAddress: {
    type: String,
    required: true
  },
  owner: {
    name: {
      type: String,
      required: true
    },
    position: {
      type: String,
      required: true
    },
    contactNumber: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    homeAddress: {
      type: String,
      required: true
    },
    birthday: {
      type: Date,
      required: true
    },
    wife: {
      name: {
        type: String,
      },
      birthday: {
        type: Date,
      }
    },
    children: [{
      name: {
        type: String,
      },
      age: {
        type: Number,
      },
      birthday: {
        type: Date,
      }
    }],
    otherFamilyMembers: [{
      name: {
        type: String,
      },
      relation: {
        type: String,
      }
    }]
  },
  anniversaryDate: {
    type: Date,
  },
  otherImportantFamilyDates: [{
    description: {
      type: String,
    },
    date: {
      type: Date,
    }
  }],
  businessDetails: {
    typeOfBusiness: {
      type: String,
      required: true
    },
    yearsInBusiness: {
      type: Number,
      required: true
    },
    preferredCommunicationMethod: {
      type: String,
    },
  },
  specialNotes: {
    type: String,
  },
  position: {
    type: String,
    default: 'Dealer',
  },
  verified: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
  },
  dealerCategory: {
    type: String,
    default: 'N/A' // Add a default value if needed
  },
}, {
  timestamps: true,
  strict: false
});

module.exports = model('Dealer', dealerSchema);
