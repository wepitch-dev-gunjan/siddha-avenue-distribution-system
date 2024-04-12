const csvParser = require("csv-parser");
const { Readable } = require("stream");
const xlsx = require("xlsx");
const Data = require("../models/SalesData");
const SalesData = require("../models/SalesData");

exports.uploadSalesData = async (req, res) => {
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
        .on("data", (data) => results.push(data))
        .on("end", async () => {
          try {
            // Insert data into MongoDB
            await Data.insertMany(results);
            res.status(200).send("Data inserted into database");
          } catch (error) {
            console.log(error);
            res.status(500).send("Error inserting data into database");
          }
        });
    } else if (req.file.originalname.endsWith(".xlsx")) {
      // Parse XLSX file
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      results = xlsx.utils.sheet_to_json(sheet);

      try {
        // Insert data into MongoDB
        await SalesData.insertMany(results);
        res.status(200).send("Data inserted into database");
      } catch (error) {
        console.log(error);
        res.status(500).send("Error inserting data into database");
      }
    } else {
      res.status(400).send("Unsupported file format");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error");
  }
};

exports.getSalesData = async (req, res) => {
  try {
    let { td_format } = req.query;

    if (!td_format) td_format = 'MTD'

    if (td_format === 'MTD') {
      const salesStats = await SalesData.aggregate([
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$Channel",
            "MTD Sell out": { $sum: { $toInt: "$MTD Qty" } },
            "LMTD Sell out": { $sum: { $toInt: "$LMTD Qty (Unit)" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD Sell out" },
            channelsData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        // Stage 3: Unwind the array to access grouped data
        {
          $unwind: "$channelsData"
        },
        // Stage 4: Calculate %Gwth (percentage growth) and Contribution
        {
          $project: {
            "Channel": "$channelsData._id",
            "MTD Sell out": "$channelsData.MTD Sell out",
            "LMTD Sell out": "$channelsData.LMTD Sell out",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LMTD Sell out", 0] }, // Handle division by zero
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.MTD Sell out", "$channelsData.LMTD Sell out"] }, "$channelsData.LMTD Sell out"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $multiply: [
                { $divide: ["$channelsData.MTD Sell out", "$totalMTDSellOut"] },
                100
              ]
            },
          },
        },
        {
          $sort: { "Contribution": -1 }
        }
      ]
      );

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'YTD') {
      const salesStats = await SalesData.aggregate([
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$Channel",
            "YTD Sell out": { $sum: { $toInt: "$YTD Qty" } },
            "LYTD Sell out": { $sum: { $toInt: "$LYTD Qty (Unit)" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalYTDSellOut: { $sum: "$YTD Sell out" },
            channelsData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        // Stage 3: Unwind the array to access grouped data
        {
          $unwind: "$channelsData"
        },
        // Stage 4: Calculate %Gwth (percentage growth) and Contribution
        {
          $project: {
            "Channel": "$channelsData._id",
            "YTD Sell out": "$channelsData.YTD Sell out",
            "LYTD Sell out": "$channelsData.LYTD Sell out",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LYTD Sell out", 0] }, // Handle division by zero
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.YTD Sell out", "$channelsData.LYTD Sell out"] }, "$channelsData.LYTD Sell out"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $multiply: [
                { $divide: ["$channelsData.YTD Sell out", "$totalYTDSellOut"] },
                100
              ]
            }
          }
        }
      ]
      );

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }


  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};




