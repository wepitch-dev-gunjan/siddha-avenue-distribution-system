const DealerListTseWise = require("../models/DealerListTseWise");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");
const SalesDataMTDW = require("../models/SalesDataMTDW");

exports.uploadDealerListTseWise = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }
  
      let results = [];
  
      if (req.file.originalname.endsWith(".csv")) {
        const stream = new Readable();
        stream.push(req.file.buffer);
        stream.push(null);
        stream
          .pipe(csvParser())
          .on("data", (data) => {
            results.push(data);
          })
          .on("end", async () => {
            try {
              let newEntries = [];
  
              for (let data of results) {
                const iuid = Object.values(data).join('|');
                console.log("IUID: ", iuid);
  
                const existingRecord = await DealerListTseWise.findOne({ iuid });
  
                if (!existingRecord) {
                  // Deep clone the data object to avoid modification issues
                  const newData = JSON.parse(JSON.stringify(data)); 
  
                  newData.iuid = iuid;

  
                  newEntries.push(newData);  // Push the deeply cloned data
                }
              }
  
              if (newEntries.length > 0) {
                await DealerListTseWise.insertMany(newEntries);
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

exports.updateDealerListWithSalesData = async (req, res) => {
  try {
    // Fetch all dealer entries from DealerListTseWise
    const dealers = await DealerListTseWise.find();
    console.log("Dealers: ", dealers);

    // Initialize an array to keep track of updated dealers
    let updatedDealers = [];

    // Iterate through each dealer entry
    for (const dealer of dealers) {
      const dealerCode = dealer["Dealer Code"]; // Get the dealer code
      console.log("dealerCode: ", dealerCode);

      // Fetch the most recent sales data for the dealer code, sorted by date
      const salesData = await SalesDataMTDW.findOne({ "BUYER CODE": dealerCode })
        .sort({ DATE: -1 }) // Sorting in descending order by DATE to get the most recent entry
        .limit(1);

      // If sales data is found, update the dealer entry with ASM, ASE, ABM, ZSM, RSO
      if (salesData) {
        // Prepare the fields to be updated or added
        const updatedFields = {
          ASM: salesData.ASM || dealer.ASM || "",
          ASE: salesData.ASE || dealer.ASE || "",
          ABM: salesData.ABM || dealer.ABM || "",
          ZSM: salesData.ZSM || dealer.ZSM || "",
          RSO: salesData.RSO || dealer.RSO || ""
        };

        // Update the dealer in the database
        const updatedDealer = await DealerListTseWise.updateOne(
          { 'Dealer Code': dealerCode },
          { $set: updatedFields }
        );

        if (updatedDealer.nModified > 0) {
          updatedDealers.push(dealerCode);
        }
      }
    }

    if (updatedDealers.length > 0) {
      res.status(200).send({
        message: "Dealer list updated successfully",
        updatedDealers,
      });
    } else {
      res.status(200).send({
        message: "No dealers were updated, no matching sales data found",
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error while updating dealer list");
  }
};


exports.addDefaultAddressToDealerListTseWise = async (req, res) => {
  try {
    // Update all documents without the 'address' field
    const result = await DealerListTseWise.updateMany(
      { address: { $exists: false } },
      {
        $set: {
          address: {
            state: "Rajasthan",
            district: "Jaipur",
            town: "",
          },
        },
      }
    );

    return res.status(200).json({
      message: `${result.modifiedCount} entries updated with the address field.`,
    });
  } catch (error) {
    console.error("Error updating entries with address:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

  



