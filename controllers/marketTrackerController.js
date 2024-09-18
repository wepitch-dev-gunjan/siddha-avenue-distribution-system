const { Readable } = require("stream");
const csvParser = require("csv-parser");
const MarketTracker = require("../models/MarketTracker");



exports.uploadMarketTrackerData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    let results = [];

    if (req.file.originalname.endsWith(".csv")) {
      // Parse CSV file
      const stream = new Readable();
      stream.push(req.file.buffer);
      stream.push(null);

      stream
        .pipe(csvParser())
        .on("data", (data) => {
          // Collect all data rows first
          results.push(data);
        })
        .on("end", async () => {
          try {
            let newEntries = [];

            // Get code from req (probably from token), and get latitude, longitude, and dealerCode from req.body
            const { code } = req; // Assuming code is being extracted from the token middleware
            const { latitude, longitude, dealerCode } = req.body;
            console.log("Code, Lat, Long, Dealer code: ", code, latitude, longitude, dealerCode);

            if (!code) {
              return res.status(400).send("Missing required employee code");
            }

            if (!latitude || !longitude) {
              return res.status(400).send("Missing required Latitudes and Longitudes");
            }

            if (!dealerCode) {
              return res.status(400).send("Missing required dealer code");
            }

            // Process each row asynchronously
            for (let data of results) {
              // Generate iuid by concatenating all the column values, including lat, long, and dealerCode
              const iuid = `${Object.values(data).join("|")}|${latitude}|${longitude}|${dealerCode}`; // Join all values and the new fields using a delimiter
              console.log("IUID: ", iuid);

              // Check if the iuid already exists in the database
              const existingRecord = await MarketTracker.findOne({ iuid });

              if (!existingRecord) {
                // If iuid does not exist, add the iuid to the data
                data.iuid = iuid;

                // Extract month from the DATE field
                const dateParts = data.DATE ? data.DATE.split("/") : [];
                const month = dateParts.length > 0 ? dateParts[0] : null; // Assuming the DATE format is "MM/DD/YYYY"
                data.month = month;

                // Add the code, latitude, longitude, and dealerCode to each row
                data.code = code;
                data.latitude = latitude;
                data.longitude = longitude;
                data.dealerCode = dealerCode;

                newEntries.push(data);
              }
            }

            if (newEntries.length > 0) {
              // Insert new entries into MongoDB
              await MarketTracker.insertMany(newEntries);
              res.status(200).send("Data inserted into database");
            } else {
              res.status(200).send("No new data to insert, all entries already exist.");
            }
          } catch (error) {
            console.log(error);
            res.status(500).send("Error inserting data into database");
          }
        });
    } else {
      res.status(400).send("Unsupported file format");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error");
  }
};

exports.getMarketTrackerDataForAdmins = async (req, res) => {
  try {
    // Fetch all data from the MarketTracker collection
    const data = await MarketTracker.find({});

    if (data.length === 0) {
      return res.status(404).send("No data found");
    }

    // Define the field names as the first entry
    const fieldNames = {
      _id: '_id',
      DATE: 'DATE',
      "DEALER CODE": 'DEALER CODE',
      "BRAND NAME": 'BRAND NAME',
      "MODEL NAME": 'MODEL NAME',
      "PRODUCT CATEGORY": 'PRODUCT CATEGORY',
      QUANTITY: 'QUANTITY',
      PRICE: 'PRICE',
      "CUSTOMER NAME": 'CUSTOMER NAME',
      "CUSTOMER AGE": 'CUSTOMER AGE',
      "CUSTOMER ADDRESS": 'CUSTOMER ADDRESS',
      iuid: 'iuid',
      month: 'month',
      code: 'code',
      latitude: 'latitude',
      longitude: 'longitude',
      dealerCode: 'dealerCode',
      __v: '__v'
    };

    // Insert the field names as the first entry
    const result = [fieldNames, ...data];

    // Send the result back to the client
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
};


