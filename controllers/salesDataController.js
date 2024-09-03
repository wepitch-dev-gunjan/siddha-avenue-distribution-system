const csvParser = require("csv-parser");
const { Readable } = require("stream");
const xlsx = require("xlsx");
const Data = require("../models/SalesData");
const SalesData = require("../models/SalesData");
const { getLastDaysOfPreviousMonths, channelOrder, getDaysElapsedInMonth, getDaysRemainingInMonth, getDaysElapsedInRange, getDaysRemainingInMonthFromDate, calculateTarget, getStartOfMonth, getLastMonthPeriod, formatNumberIndian, parseDate  } = require("../helpers/salesHelpers");
const {
  filterSalesData,
  generateSegmentWiseReport,
  calculateContribution,
  calculatePendingValue,
  calculateExtrapolated,
  calculateGrowth,
  calculateRequiredAds,
  categorizePriceBand,
  fetchTargetValuesAndVolumes,
  fetchTargetValuesAndVolumesByChannel,
} = require('../helpers/reportHelpers');

const { staticSegments,
        staticZSMNames,
        staticABMNames, 
        staticRSONames, 
        staticASENames, 
        staticASMNames, 
        staticTSENames 
      } = require('../helpers/constants');
const SegmentTarget = require("../models/SegmentTarget");


// Upload sales data APIs 
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
        res.status(200).send({
          message: "Data inserted successfully"
        });
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


// Duplicate data removed wo postman testing setup
// exports.uploadSalesData = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).send("No file uploaded");
//     }

//     let results = [];

//     if (req.file.originalname.endsWith(".csv")) {
//       // Parse CSV file
//       const stream = new Readable();
//       stream.push(req.file.buffer);
//       stream.push(null);
//       stream
//         .pipe(csvParser())
//         .on("data", (data) => results.push(data))
//         .on("end", async () => {
//           try {
//             // Remove duplicate entries in the new data
//             const uniqueResults = results.filter((item, index, self) =>
//               index === self.findIndex((t) => (
//                 Object.keys(t).every(key => t[key] === item[key])
//               ))
//             );

//             // Check for duplicates against the database
//             const existingData = await Data.find().lean(); // Fetch existing data from DB

//             const nonDuplicateResults = uniqueResults.filter(newEntry => 
//               !existingData.some(existingEntry =>
//                 Object.keys(newEntry).every(key => newEntry[key] === existingEntry[key])
//               )
//             );

//             // Insert non-duplicate data into MongoDB
//             if (nonDuplicateResults.length > 0) {
//               await Data.insertMany(nonDuplicateResults);
//               // res.status(200).send("Data inserted into database");
//               res.status(200).send(`${nonDuplicateResults.length} entries inserted into the database`);

//             } else {
//               res.status(200).send("No new data to insert");
//             }
//           } catch (error) {
//             console.log(error);
//             res.status(500).send("Error inserting data into database");
//           }
//         });
//     } else {
//       res.status(400).send("Unsupported file format");
//     }
//   } catch (error) {
//     console.log(error);
//     res.status(500).send("Internal server error");
//   }
// };
// Duplicate data removed in this api - but it takes time - >45 mins to upload 75k rows
// exports.uploadSalesData = async (req, res) => {
//   // Duplicate data removed in this api - but it takes time - >45 mins to upload 75k rows
//   try {
//     if (!req.file) {
//       return res.status(400).send("No file uploaded");
//     }

//     let results = [];

//     if (req.file.originalname.endsWith(".csv")) {
//       // Start writing the response to the client
//       res.writeHead(200, { 'Content-Type': 'text/plain' });

//       // Parse CSV file
//       const stream = new Readable();
//       stream.push(req.file.buffer);
//       stream.push(null);
//       stream
//         .pipe(csvParser())
//         .on("data", (data) => {
//           results.push(data);
//           if (results.length % 100 === 0) {  // Adjust this value as needed for more or less frequent updates
//             res.write(`Processed ${results.length} rows from the file...\n`);
//           }
//         })
//         .on("end", async () => {
//           try {
//             res.write('Finished reading file. Removing duplicates in uploaded data...\n');

//             // Remove duplicate entries in the new data
//             const uniqueResults = results.filter((item, index, self) =>
//               index === self.findIndex((t) => (
//                 Object.keys(t).every(key => t[key] === item[key])
//               ))
//             );

//             res.write(`Removed duplicates. ${uniqueResults.length} unique entries remaining.\n`);

//             // Check for duplicates against the database
//             res.write('Checking against existing database entries...\n');
//             const existingData = await Data.find().lean(); // Fetch existing data from DB

//             const nonDuplicateResults = uniqueResults.filter((newEntry, index) => {
//               const isDuplicate = existingData.some(existingEntry =>
//                 Object.keys(newEntry).every(key => newEntry[key] === existingEntry[key])
//               );

//               // Optional: Show progress during database check
//               if (index % 100 === 0) {
//                 res.write(`Checked ${index} unique entries against the database...\n`);
//               }

//               return !isDuplicate;
//             });

//             res.write(`Database check completed. ${nonDuplicateResults.length} new entries to insert.\n`);

//             // Insert non-duplicate data into MongoDB
//             if (nonDuplicateResults.length > 0) {
//               await Data.insertMany(nonDuplicateResults);
//               res.write(`${nonDuplicateResults.length} entries inserted into the database.\n`);
//             } else {
//               res.write("No new data to insert.\n");
//             }

//             res.end("Processing completed successfully.\n");
//           } catch (error) {
//             console.log(error);
//             res.write("Error inserting data into the database.\n");
//             res.end();
//           }
//         });
//     } else {
//       res.status(400).send("Unsupported file format");
//     }
//   } catch (error) {
//     console.log(error);
//     res.status(500).send("Internal server error");
//   }
// };


// Channel wise APIs
exports.getSalesDataChannelWise = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format } = req.query;
    let  startYear, startMonth,  endMonth, endYear;

    if (!td_format) td_format = 'MTD'
    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();
    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    startYear = startDate.getFullYear();
    startMonth = startDate.getMonth() + 1; // Month is zero-based
    endYear = endDate.getFullYear();
    endMonth = endDate.getMonth() + 1; // Month is zero-based

    const presentDayOfMonth = new Date().getDate();

    // Calculate the start and end dates for LYTD
    const lytdStartDate = `${startYear - 1}-01-01`; // January 1st of the previous year
    const lytdEndDate = `${startYear - 1}-${startMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`; // End of the current month for the previous year

    if (data_format === 'value') {
      const salesStats = await SalesData.aggregate([
        {
          $addFields: {
            parsedDate: {
              $dateFromString: {
                dateString: "$DATE",
                format: "%m/%d/%Y", // Define the format of the date strings in your dataset
                timezone: "UTC" // Specify timezone if necessary
              }
            }
          }
        },
        {
          $match: {
            parsedDate: { $gte: startDate, $lte: endDate },
            "SALES TYPE": "Sell Out"
        },
      },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$CHANNEL",
            "TARGET VALUE": { $sum: { $toInt: "$TARGET VALUE" } },
            "MTD VALUE": { $sum: { $toInt: "$MTD VALUE" } },
            "LMTD VALUE": { $sum: { $toInt: "$LMTD VALUE" } },
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VALUE" },
            channelsData: { $push: "$$ROOT" }
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
            "Last Month ACH": "$channelsData.LMTD VALUE",
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalMTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$channelsData.MTD VALUE", "$totalMTDSellOut"] },
                    100
                  ]
                }
              }
            },
            "TGT": "$channelsData.TARGET VALUE"
          }
        },
        {
          $sort: { "Contribution": -1 }
        }
      ]);

      salesStats.sort((a, b) => {
        // Get the index of each channel in the channelOrder array
        const indexA = channelOrder.indexOf(a.Channel);
        const indexB = channelOrder.indexOf(b.Channel);

        // Compare the indices to determine the sorting order
        if (indexA === -1 && indexB === -1) {
          // If both channels are not found in channelOrder, maintain their original order
          return 0;
        } else if (indexA === -1) {
          // If only channel A is not found in channelOrder, place it after channel B
          return 1;
        } else if (indexB === -1) {
          // If only channel B is not found in channelOrder, place it before channel A
          return -1;
        } else {
          // If both channels are found in channelOrder, sort based on their indices
          return indexA - indexB;
        }
      });

      const formatValue = (value) => {
        if (value >= 1000000) {
          return `${(value / 1000000).toFixed(2)}M`;
        } else if (value >= 1000) {
          return `${(value / 1000).toFixed(2)}K`;
        } else {
          return value.toString();
        }
      };

      const formattedSalesStats = salesStats.map(item => ({
        ...item,
        "TGT": formatValue(item["TGT"]),
        "Last Month ACH": formatValue(item["Last Month ACH"]),
        "Contribution": `${item["Contribution"].toFixed(2)}%`
      }));

      if (!formattedSalesStats || formattedSalesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(formattedSalesStats);
    }

    if (data_format === 'volume') {
      const salesStats = await SalesData.aggregate([
        {
          $addFields: {
            parsedDate: {
              $dateFromString: {
                dateString: "$DATE",
                format: "%m/%d/%Y", // Define the format of the date strings in your dataset
                timezone: "UTC" // Specify timezone if necessary
              }
            }
          }
        },
        {
          $match: {
            "SALES TYPE": "Sell Out",
            parsedDate: { $gte: startDate, $lte: endDate }
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$CHANNEL",
            "TARGET VOLUME": { $sum: { $toInt: "$TARGET VOLUME" } },
            "MTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } },
            "LMTD VOLUME": { $sum: { $toInt: "$LMTD VOLUME" } },
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VOLUME" },
            channelsData: { $push: "$$ROOT" }
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
            "Last Month ACH": "$channelsData.LMTD VOLUME",
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalMTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$channelsData.MTD VOLUME", "$totalMTDSellOut"] },
                    100
                  ]
                }
              }
            },
            "TGT": "$channelsData.TARGET VOLUME"
          }
        },
        {
          $sort: { "Contribution": -1 }
        }
      ]);

      salesStats.sort((a, b) => {
        // Get the index of each channel in the channelOrder array
        const indexA = channelOrder.indexOf(a.Channel);
        const indexB = channelOrder.indexOf(b.Channel);

        // Compare the indices to determine the sorting order
        if (indexA === -1 && indexB === -1) {
          // If both channels are not found in channelOrder, maintain their original order
          return 0;
        } else if (indexA === -1) {
          // If only channel A is not found in channelOrder, place it after channel B
          return 1;
        } else if (indexB === -1) {
          // If only channel B is not found in channelOrder, place it before channel A
          return -1;
        } else {
          // If both channels are found in channelOrder, sort based on their indices
          return indexA - indexB;
        }
      });

      const formatValue = (value) => {
        if (value >= 1000000) {
          return `${(value / 1000000).toFixed(2)}M`;
        } else if (value >= 1000) {
          return `${(value / 1000).toFixed(2)}K`;
        } else {
          return value.toString();
        }
      };

      const formattedSalesStats = salesStats.map(item => ({
        ...item,
        "TGT": formatValue(item["TGT"]),
        "Last Month ACH": formatValue(item["Last Month ACH"]),
        "Contribution": `${item["Contribution"].toFixed(2)}%`
      }));

      if (!formattedSalesStats || formattedSalesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(formattedSalesStats);
    }

  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataChannelWiseForEmployee = async (req, res) => {
  try {
    // Destructure the necessary parameters from the query
    let { td_format, start_date, end_date, data_format, name, position } = req.query;
    let startYear, startMonth, endMonth, endYear; // Declare year and month variables for further calculations

    // Check if 'name' and 'position' are provided
    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    // Set default values for optional parameters
    if (!td_format) td_format = 'MTD';

    // Set startDate to either provided start_date or the first day of the current month
    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date(); // Set endDate to provided end_date or today

    // Helper function to parse dates in MM/DD/YYYY format
    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    // Parse startDate and endDate to ensure they are in the correct format
    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    // Extract year and month from the startDate and endDate for filtering and calculations
    startYear = startDate.getFullYear();
    startMonth = startDate.getMonth() + 1; // Month is zero-based in JavaScript
    endYear = endDate.getFullYear();
    endMonth = endDate.getMonth() + 1;

    const presentDayOfMonth = new Date().getDate();

    // Fetch targets based on the given name and position
    const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);
    
    // Handling 'value' data format
    if (data_format === 'value') {
      const salesStats = await SalesData.aggregate([
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
            parsedDate: { $gte: startDate, $lte: endDate }, // Filter based on date range
            "SALES TYPE": "Sell Out", // Filter to include only 'Sell Out' sales type
            [position]: name // Dynamically match based on provided position and name
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "TARGET VALUE": { $sum: { $toInt: "$TARGET VALUE" } }, // Sum of target values for aggregation
            "MTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }, // Sum of MTD values
            "LMTD VALUE": { $sum: { $toInt: "$LMTD VALUE" } } // Sum of LMTD values
          }
        },
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VALUE" }, // Calculate total MTD Sell Out across channels
            channelsData: { $push: "$$ROOT" } // Push each channel data to an array
          }
        },
        {
          $unwind: "$channelsData" // Unwind channelsData to process each channel individually
        },
        {
          $project: {
            "Channel": "$channelsData._id",
            "Last Month ACH": { $ifNull: ["$channelsData.LMTD VALUE", 0] }, // Handle cases where LMTD VALUE might be null
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalMTDSellOut", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $ifNull: ["$channelsData.MTD VALUE", 0] }, "$totalMTDSellOut"] },
                    100
                  ]
                }
              }
            },
            "TGT": {
              $ifNull: [
                targetValuesByChannel["$channelsData._id"] || 0, // Use the target value fetched by channel
                "$channelsData.TARGET VALUE"
              ]
            }
          }
        },
        {
          $sort: { "Contribution": -1 } // Sort channels by contribution descending
        }
      ]);

      // Sorting based on custom channel order
      salesStats.sort((a, b) => {
        const indexA = channelOrder.indexOf(a.Channel);
        const indexB = channelOrder.indexOf(b.Channel);
        return (indexA === -1 && indexB === -1) ? 0 : (indexA === -1 ? 1 : (indexB === -1 ? -1 : indexA - indexB));
      });

      const formatValue = (value) => {
        if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
        else if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
        else return value.toString();
      };

      const formattedSalesStats = salesStats.map(item => ({
        ...item,
        "TGT": formatValue(item["TGT"]),
        "Last Month ACH": formatValue(item["Last Month ACH"]),
        "Contribution": `${item["Contribution"].toFixed(2)}%`
      }));

      if (!formattedSalesStats || formattedSalesStats.length === 0) {
        return res.status(404).send({ error: "Data not found" });
      }

      return res.status(200).send(formattedSalesStats);
    }

    // Handling 'volume' data format
    if (data_format === 'volume') {
      const salesStats = await SalesData.aggregate([
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
            "SALES TYPE": "Sell Out",
            parsedDate: { $gte: startDate, $lte: endDate },
            [position]: name // Dynamically match based on provided position and name
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "TARGET VOLUME": { $sum: { $toInt: "$TARGET VOLUME" } }, // Sum of target volumes for aggregation
            "MTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }, // Sum of MTD volumes
            "LMTD VOLUME": { $sum: { $toInt: "$LMTD VOLUME" } } // Sum of LMTD volumes
          }
        },
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VOLUME" }, // Calculate total MTD Sell Out volumes across channels
            channelsData: { $push: "$$ROOT" }
          }
        },
        {
          $unwind: "$channelsData"
        },
        {
          $project: {
            "Channel": "$channelsData._id",
            "Last Month ACH": { $ifNull: ["$channelsData.LMTD VOLUME", 0] },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalMTDSellOut", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $ifNull: ["$channelsData.MTD VOLUME", 0] }, "$totalMTDSellOut"] },
                    100
                  ]
                }
              }
            },
            "TGT": {
              $ifNull: [
                targetVolumesByChannel["$channelsData._id"] || 0, // Use the target volume fetched by channel
                "$channelsData.TARGET VOLUME"
              ]
            }
          }
        },
        {
          $sort: { "Contribution": -1 }
        }
      ]);

      // Sorting based on custom channel order
      salesStats.sort((a, b) => {
        const indexA = channelOrder.indexOf(a.Channel);
        const indexB = channelOrder.indexOf(b.Channel);
        return (indexA === -1 && indexB === -1) ? 0 : (indexA === -1 ? 1 : (indexB === -1 ? -1 : indexA - indexB));
      });

      const formatValue = (value) => {
        if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
        else if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
        else return value.toString();
      };

      const formattedSalesStats = salesStats.map(item => ({
        ...item,
        "TGT": formatValue(item["TGT"]),
        "Last Month ACH": formatValue(item["Last Month ACH"]),
        "Contribution": `${item["Contribution"].toFixed(2)}%`
      }));

      if (!formattedSalesStats || formattedSalesStats.length === 0) {
        return res.status(404).send({ error: "Data not found" });
      }

      return res.status(200).send(formattedSalesStats);
    }

  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};


// Dashboard APIs
// exports.getSalesDashboardData = async (req, res) => {
//   try {
//     let { td_format, start_date, end_date, data_format } = req.query;
//     let startDate, startYear, startMonth, endDate, endMonth, endYear;

//     if (!td_format) td_format = 'MTD';
//     if (start_date) {
//       startDate = new Date(start_date);
//     } else {
//       startDate = new Date(-1);
//     }
//     if (end_date) {
//       endDate = new Date(end_date);
//     } else {
//       endDate = new Date();
//     }
//     if (!data_format) data_format = "value";

//     startYear = startDate.getFullYear();
//     startMonth = startDate.getMonth() + 1; // Month is zero-based
//     endYear = endDate.getFullYear();
//     endMonth = endDate.getMonth() + 1; // Month is zero-based

//     const presentDayOfMonth = endDate.getDate();

//     let matchStage = {};

//     if (start_date && end_date) {
//       matchStage = {
//         DATE: {
//           $gte: new Date(`${startYear}-${startMonth.toString().padStart(2, '0')}-01`),
//           $lte: new Date(`${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`)
//         }
//       };
//     }

//     const lytdStartDate = `${startYear - 1}-01-01`;
//     const lytdEndDate = `${startYear - 1}-${startMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`;

//     let result = {};

//     const formatNumber = (num) => {
//       if (num >= 1e6) {
//         return (num / 1e6).toFixed(2) + 'M';
//       }
//       if (num >= 1e3) {
//         return (num / 1e3).toFixed(2) + 'K';
//       }
//       return num.toString();
//     };

//     if (td_format === 'MTD' && data_format === 'value') {
//       const salesStats = await SalesData.aggregate([
//         { $match: matchStage },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             MTD_Value: { $sum: { $toInt: "$MTD VALUE" } },
//             LMTD_Value: { $sum: { $toInt: "$LMTD VALUE" } }
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             salesType: "$_id",
//             MTD_Value: 1,
//             LMTD_Value: 1,
//             Growth_Percent: {
//               $cond: {
//                 if: { $eq: ["$LMTD_Value", 0] },
//                 then: "N/A",
//                 else: {
//                   $multiply: [
//                     { $divide: [{ $subtract: ["$MTD_Value", "$LMTD_Value"] }, "$LMTD_Value"] },
//                     100
//                   ]
//                 }
//               }
//             }
//           }
//         }
//       ]);

//       salesStats.forEach(item => {
//         if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
//           result.td_sell_in = formatNumber(item.MTD_Value);
//           result.ltd_sell_in = formatNumber(item.LMTD_Value);
//           result.sell_in_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
//         } else if (item.salesType === "Sell Out") {
//           result.td_sell_out = formatNumber(item.MTD_Value);
//           result.ltd_sell_out = formatNumber(item.LMTD_Value);
//           result.sell_out_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
//         }
//       });

//     }

//     if (td_format === 'MTD' && data_format === 'volume') {
//       const salesStats = await SalesData.aggregate([
//         { $match: matchStage },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             MTD_Volume: { $sum: { $toInt: "$MTD VOLUME" } },
//             LMTD_Volume: { $sum: { $toInt: "$LMTD VOLUME" } }
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             salesType: "$_id",
//             MTD_Volume: 1,
//             LMTD_Volume: 1,
//             Growth_Percent: {
//               $cond: {
//                 if: { $eq: ["$LMTD_Volume", 0] },
//                 then: "N/A",
//                 else: {
//                   $multiply: [
//                     { $divide: [{ $subtract: ["$MTD_Volume", "$LMTD_Volume"] }, "$LMTD_Volume"] },
//                     100
//                   ]
//                 }
//               }
//             }
//           }
//         }
//       ]);

//       salesStats.forEach(item => {
//         if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
//           result.td_sell_in = formatNumber(item.MTD_Volume);
//           result.ltd_sell_in = formatNumber(item.LMTD_Volume);
//           result.sell_in_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
//         } else if (item.salesType === "Sell Out") {
//           result.td_sell_out = formatNumber(item.MTD_Volume);
//           result.ltd_sell_out = formatNumber(item.LMTD_Volume);
//           result.sell_out_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
//         }
//       });

//     }

//     if (td_format === 'YTD' && data_format === 'value') {
//       let lastYearSalesStats = await SalesData.aggregate([
//         {
//           $match: {
//             DATE: {
//               $gte: lytdStartDate, // Start of the previous year
//               $lte: lytdEndDate // End of the previous year's current month
//             },
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
//           }
//         }
//       ]);


//       const lastDays = getLastDaysOfPreviousMonths()
//       const salesStats = await SalesData.aggregate([
//         {
//           $match: {
//             DATE: {
//               $gte: `${startYear}-01-01`, // Start of the current month
//               $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
//             }
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
//           }
//         },
//       ]);

//       if (lastYearSalesStats.length <= 0) {
//         lastYearSalesStats = [
//           { _id: 'Sell Thru2', 'YTD VALUE': 0 },
//           { _id: 'Sell Out', 'YTD VALUE': 0 }
//         ]
//       }

//       // console.log("lastYearSalesStats : ", lastYearSalesStats);
//       // console.log("salesStats : ", salesStats);
//       salesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           result.td_sell_out = item['YTD VALUE'];
//         } else {
//           result.td_sell_in = item['YTD VALUE'];
//         }
//       })
//       lastYearSalesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           result.ltd_sell_out = item['YTD VALUE'];
//         } else {
//           result.ltd_sell_in = item['YTD VALUE'];
//         }
//       })


//       result.sell_in_growth =
//         result.ltd_sell_in !== 0 ?
//           (result.td_sell_in - result.ltd_sell_in) / result.ltd_sell_in * 100
//           : 0;

//       result.sell_out_growth =
//         result.ltd_sell_out !== 0 ?
//           (result.td_sell_out - result.ltd_sell_out) / result.ltd_sell_out * 100
//           : 0;

//       result.td_sell_in = formatNumber(result.td_sell_in);
//       result.ltd_sell_in = formatNumber(result.ltd_sell_in);
//       result.td_sell_out = formatNumber(result.td_sell_out);
//       result.ltd_sell_out = formatNumber(result.ltd_sell_out);
//       result.sell_in_growth = result.sell_in_growth + '%';
//       result.sell_out_growth = result.sell_out_growth + '%';
//     }

//     if (td_format === 'YTD' && data_format === 'volume') {
//       let lastYearSalesStats = await SalesData.aggregate([
//         {
//           $match: {
//             DATE: {
//               $gte: lytdStartDate, // Start of the previous year
//               $lte: lytdEndDate // End of the previous year's current month
//             },
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
//           }
//         }
//       ]);


//       const lastDays = getLastDaysOfPreviousMonths()
//       const salesStats = await SalesData.aggregate([
//         {
//           $match: {
//             DATE: {
//               $gte: `${startYear}-01-01`, // Start of the current month
//               $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
//             }
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
//           }
//         },
//       ]);

//       if (lastYearSalesStats.length <= 0) {
//         lastYearSalesStats = [
//           { _id: 'Sell Thru2', 'YTD VOLUME': 0 },
//           { _id: 'Sell Out', 'YTD VOLUME': 0 }
//         ]
//       }

//       // console.log("lastYearSalesStats : ", lastYearSalesStats);
//       // console.log("salesStats : ", salesStats);
//       salesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           result.td_sell_out = item['YTD VOLUME'];
//         } else {
//           result.td_sell_in = item['YTD VOLUME'];
//         }
//       })
//       lastYearSalesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           result.ltd_sell_out = item['YTD VOLUME'];
//         } else {
//           result.ltd_sell_in = item['YTD VOLUME'];
//         }
//       })


//       result.sell_in_growth =
//         result.ltd_sell_in !== 0 ?
//           (result.td_sell_in - result.ltd_sell_in) / result.ltd_sell_in * 100
//           : 0;

//       result.sell_out_growth =
//         result.ltd_sell_out !== 0 ?
//           (result.td_sell_out - result.ltd_sell_out) / result.ltd_sell_out * 100
//           : 0;

//       result.td_sell_in = formatNumber(result.td_sell_in);
//       result.ltd_sell_in = formatNumber(result.ltd_sell_in);
//       result.td_sell_out = formatNumber(result.td_sell_out);
//       result.ltd_sell_out = formatNumber(result.ltd_sell_out);
//       result.sell_in_growth = result.sell_in_growth + '%';
//       result.sell_out_growth = result.sell_out_growth + '%';
//     }

//     res.status(200).send(result);
//   } catch (error) {
//     console.log(error);
//     res.status(500).send({ error: 'Internal Server Error' });
//   }
// };

// exports.getSalesDashboardData = async (req, res) => {
//   try {
//     let { td_format, start_date, end_date, data_format, position, name } = req.query;

//     if (!position || !name) {
//       return res.status(400).send({ error: "Position and name are required." });
//     }

//     if (!td_format) td_format = 'MTD';
//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const startYear = startDate.getFullYear();
//     const startMonth = startDate.getMonth() + 1; // Month is zero-based
//     const endYear = endDate.getFullYear();
//     const endMonth = endDate.getMonth() + 1; // Month is zero-based
//     const presentDayOfMonth = endDate.getDate();

//     let matchStage = {
//       parsedDate: {
//         $gte: startDate,
//         $lte: endDate
//       },
//       [position]: name
//     };

//     const lytdStartDate = new Date(`${endYear - 1}-01-01`);
//     const lytdEndDate = new Date(`${endYear - 1}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`);

//     let result = {};

//     if (td_format === 'MTD') {
//       const salesStats = await SalesData.aggregate([
//         {
//           $addFields: {
//             parsedDate: {
//               $dateFromString: {
//                 dateString: "$DATE",
//                 format: "%m/%d/%Y",
//                 timezone: "UTC"
//               }
//             }
//           }
//         },
//         { $match: matchStage },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             MTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
//             LMTD_Value: { $sum: { $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME" } }
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             salesType: "$_id",
//             MTD_Value: 1,
//             LMTD_Value: 1,
//             Growth_Percent: {
//               $cond: {
//                 if: { $eq: ["$LMTD_Value", 0] },
//                 then: "N/A",
//                 else: { $multiply: [{ $divide: [{ $subtract: ["$MTD_Value", "$LMTD_Value"] }, "$LMTD_Value"] }, 100] }
//               }
//             }
//           }
//         }
//       ]);

//       salesStats.forEach(item => {
//         if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
//           result.td_sell_in = formatNumberIndian(item.MTD_Value);
//           result.ltd_sell_in = formatNumberIndian(item.LMTD_Value);
//           result.sell_in_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
//         } else if (item.salesType === "Sell Out") {
//           result.td_sell_out = formatNumberIndian(item.MTD_Value);
//           result.ltd_sell_out = formatNumberIndian(item.LMTD_Value);
//           result.sell_out_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
//         }
//       });

//     }

//     if (td_format === 'YTD') {
//       let lastYearSalesStats = await SalesData.aggregate([
//         {
//           $addFields: {
//             parsedDate: {
//               $dateFromString: {
//                 dateString: "$DATE",
//                 format: "%m/%d/%Y",
//                 timezone: "UTC"
//               }
//             }
//           }
//         },
//         {
//           $match: {
//             parsedDate: {
//               $gte: lytdStartDate,
//               $lte: lytdEndDate
//             },
//             [position]: name
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } },
//             "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
//           }
//         }
//       ]);

//       const salesStats = await SalesData.aggregate([
//         {
//           $addFields: {
//             parsedDate: {
//               $dateFromString: {
//                 dateString: "$DATE",
//                 format: "%m/%d/%Y",
//                 timezone: "UTC"
//               }
//             }
//           },
//         },
//         {
//           $match: {
//             parsedDate: {
//               $gte: new Date(`${endYear}-01-01`),
//               $lte: endDate
//             },
//             [position]: name
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } },
//             "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
//           }
//         }
//       ]);

//       if (lastYearSalesStats.length <= 0) {
//         lastYearSalesStats = [
//           { _id: 'Sell Thru2', 'YTD VALUE': 0, 'YTD VOLUME': 0 },
//           { _id: 'Sell Out', 'YTD VALUE': 0, 'YTD VOLUME': 0 }
//         ]
//       }

//       salesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           result.td_sell_out = item['YTD VALUE'];
//           result.td_sell_out_volume = item['YTD VOLUME'];
//         } else {
//           result.td_sell_in = item['YTD VALUE'];
//           result.td_sell_in_volume = item['YTD VOLUME'];
//         }
//       });
//       lastYearSalesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           if (td_format == 'value'){
//             result.td_sell_out = item['YTD VALUE']
//           } else{
//             result.td_sell_out = item['YTD VOLUME']
//           }
//           // result.ltd_sell_out = item['YTD VALUE'];
//           // result.ltd_sell_out_volume = item['YTD VOLUME'];
//         } else {
//           if (td_format == 'value'){
//             result.td_sell_in = item['YTD VALUE']
//           } else{
//             result.td_sell_in = item['YTD VOLUME']
//           }
//           // result.ltd_sell_in = item['YTD VALUE'];
//           // result.ltd_sell_in_volume = item['YTD VOLUME'];
//         }
//       });

//       result.sell_in_growth =
//         result.ltd_sell_in !== 0 ?
//           (result.td_sell_in - result.ltd_sell_in) / result.ltd_sell_in * 100
//           : 0;

//       result.sell_out_growth =
//         result.ltd_sell_out !== 0 ?
//           (result.td_sell_out - result.ltd_sell_out) / result.ltd_sell_out * 100
//           : 0;

//       result.td_sell_in = formatNumberIndian(result.td_sell_in);
//       result.ltd_sell_in = formatNumberIndian(result.ltd_sell_in);
//       result.td_sell_out = formatNumberIndian(result.td_sell_out);
//       result.ltd_sell_out = formatNumberIndian(result.ltd_sell_out);
//       result.sell_in_growth = result.sell_in_growth + '%';
//       result.sell_out_growth = result.sell_out_growth + '%';
//     }

//     res.status(200).send(result);
//   } catch (error) {
//     console.log(error);
//     res.status(500).send({ error: 'Internal Server Error' });
//   }
// };

exports.getSalesDashboardData = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format, position, name } = req.query;

    if (!position || !name) {
      return res.status(400).send({ error: "Position and name are required." });
    }

    if (!td_format) td_format = 'MTD';
    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1; // Month is zero-based
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1; // Month is zero-based
    const presentDayOfMonth = endDate.getDate();

    let matchStage = {
      parsedDate: {
        $gte: startDate,
        $lte: endDate
      },
      [position]: name
    };

    const lytdStartDate = new Date(`${endYear - 1}-01-01`);
    const lytdEndDate = new Date(`${endYear - 1}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`);

    let result = {};

    if (td_format === 'MTD') {
      const salesStats = await SalesData.aggregate([
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
        { $match: matchStage },
        {
          $group: {
            _id: "$SALES TYPE",
            MTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
            LMTD_Value: { $sum: { $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME" } }
          }
        },
        {
          $project: {
            _id: 0,
            salesType: "$_id",
            MTD_Value: 1,
            LMTD_Value: 1,
            Growth_Percent: {
              $cond: {
                if: { $eq: ["$LMTD_Value", 0] },
                then: "N/A",
                else: { $multiply: [{ $divide: [{ $subtract: ["$MTD_Value", "$LMTD_Value"] }, "$LMTD_Value"] }, 100] }
              }
            }
          }
        }
      ]);

      salesStats.forEach(item => {
        if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
          result.td_sell_in = formatNumberIndian(item.MTD_Value);
          result.ltd_sell_in = formatNumberIndian(item.LMTD_Value);
          result.sell_in_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        } else if (item.salesType === "Sell Out") {
          result.td_sell_out = formatNumberIndian(item.MTD_Value);
          result.ltd_sell_out = formatNumberIndian(item.LMTD_Value);
          result.sell_out_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        }
      });

    }

    if (td_format === 'YTD') {
      let lastYearSalesStats = await SalesData.aggregate([
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
            parsedDate: {
              $gte: lytdStartDate,
              $lte: lytdEndDate
            },
            [position]: name
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } },
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        }
      ]);

      const salesStats = await SalesData.aggregate([
        {
          $addFields: {
            parsedDate: {
              $dateFromString: {
                dateString: "$DATE",
                format: "%m/%d/%Y",
                timezone: "UTC"
              }
            }
          },
        },
        {
          $match: {
            parsedDate: {
              $gte: new Date(`${endYear}-01-01`),
              $lte: endDate
            },
            [position]: name
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } },
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        }
      ]);

      if (lastYearSalesStats.length <= 0) {
        lastYearSalesStats = [
          { _id: 'Sell Thru2', 'YTD VALUE': 0, 'YTD VOLUME': 0 },
          { _id: 'Sell Out', 'YTD VALUE': 0, 'YTD VOLUME': 0 }
        ]
      }

      salesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.td_sell_out = item['YTD VALUE'];
        } else {
          result.td_sell_in = item['YTD VALUE'];
        }
      });
      lastYearSalesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.ltd_sell_out = item['YTD VALUE'];
        } else {
          result.ltd_sell_in = item['YTD VALUE'];
        }
      });

      result.sell_in_growth =
        result.ltd_sell_in !== 0 ?
          (result.td_sell_in - result.ltd_sell_in) / result.ltd_sell_in * 100
          : 0;

      result.sell_out_growth =
        result.ltd_sell_out !== 0 ?
          (result.td_sell_out - result.ltd_sell_out) / result.ltd_sell_out * 100
          : 0;

      result.td_sell_in = formatNumberIndian(result.td_sell_in);
      result.ltd_sell_in = formatNumberIndian(result.ltd_sell_in);
      result.td_sell_out = formatNumberIndian(result.td_sell_out);
      result.ltd_sell_out = formatNumberIndian(result.ltd_sell_out);
      result.sell_in_growth = result.sell_in_growth + '%';
      result.sell_out_growth = result.sell_out_growth + '%';

      // Remove any additional fields if present
      result = {
        td_sell_out: result.td_sell_out,
        ltd_sell_out: result.ltd_sell_out,
        sell_out_growth: result.sell_out_growth,
        td_sell_in: result.td_sell_in,
        ltd_sell_in: result.ltd_sell_in,
        sell_in_growth: result.sell_in_growth
      };
    }

    res.status(200).send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};

exports.getChannelSalesDataAreaWise = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format } = req.query;

    // Default values
    td_format = td_format || 'MTD';
    data_format = data_format || 'value';

    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate = end_date ? new Date(end_date) : new Date();

    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1; // Month is zero-based
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1; // Month is zero-based

    const presentDayOfMonth = new Date().getDate();

    const formatValue = (value) => {
      if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
      return value.toString();
    };

    const processSalesData = (targetField, mtdField, lmtdField) => [
      {
        $match: {
          DATE: {
            $gte: `${startYear}-${startMonth.toString().padStart(2, '0')}-01`, // Start of the current month
            $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
          },
          "SALES TYPE": "Sell Out"
        }
      },
      {
        $group: {
          _id: { channel: "$CHANNEL", area: "$AREA" },
          [targetField]: { $sum: { $toInt: `$${targetField}` } },
          [mtdField]: { $sum: { $toInt: `$${mtdField}` } },
          [lmtdField]: { $sum: { $toInt: `$${lmtdField}` } },
        }
      },
      {
        $group: {
          _id: null,
          totalMTDSellOut: { $sum: `$${mtdField}` },
          channelsData: { $push: "$$ROOT" }
        }
      },
      { $unwind: "$channelsData" },
      {
        $project: {
          "Channel": "$channelsData._id.channel",
          "Area": "$channelsData._id.area",
          "Last Month ACH": `$channelsData.${lmtdField}`,
          "Contribution": {
            $cond: {
              if: { $eq: ["$totalMTDSellOut", 0] },
              then: 0,
              else: {
                $multiply: [
                  { $divide: [`$channelsData.${mtdField}`, "$totalMTDSellOut"] },
                  100
                ]
              }
            }
          },
          "TGT": `$channelsData.${targetField}`
        }
      },
      { $sort: { "Contribution": -1 } }
    ];

    const targetField = data_format === 'value' ? "TARGET VALUE" : "TARGET VOLUME";
    const mtdField = data_format === 'value' ? "MTD VALUE" : "MTD VOLUME";
    const lmtdField = data_format === 'value' ? "LMTD VALUE" : "LMTD VOLUME";

    const salesStats = await SalesData.aggregate(processSalesData(targetField, mtdField, lmtdField));

    salesStats.sort((a, b) => {
      const indexA = channelOrder.indexOf(a.Channel);
      const indexB = channelOrder.indexOf(b.Channel);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    const formattedSalesStats = salesStats.map(item => ({
      ...item,
      "TGT": formatValue(item["TGT"]),
      "Last Month ACH": formatValue(item["Last Month ACH"]),
      "Contribution": `${item["Contribution"].toFixed(2)}%`
    }));

    if (!formattedSalesStats || formattedSalesStats.length === 0) {
      return res.status(404).send({ error: "Data not found" });
    }

    res.status(200).send(formattedSalesStats);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};


// not getting used APIs
exports.getSalesDataSegmentWise = async (req, res) => {
  try {
    let { start_date, end_date, data_format } = req.query;

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Calculate the last month's corresponding date range for LMTD comparison
    let lastMonthStartDate = new Date(startDate);
    lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
    lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

    let lastMonthEndDate = new Date(endDate);
    lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
    lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

    const targetValues = {
      "100K": 82729425,
      "70-100K": 30461652,
      "40-70K": 25169124,
      "30-40K": 27633511,
      "20-30K": 11072500,
      "15-20K": 33387787,
      "10-15K": 14580195,
      "6-10K": 9291145,
      "Tab >40K": 5202269,
      "Tab <40K": 3844941,
      "Wearable": 2676870
    };

    const targetVolumes = {
        "100K": 574,
        "70-100K": 347,
        "40-70K": 454,
        "30-40K": 878,
        "20-30K": 423,
        "15-20K": 1947,
        "10-15K": 1027,
        "6-10K": 1020,
        "Tab >40K": 231,
        "Tab <40K": 59,
        "Wearable": 130
    }

    const staticIds = [
      "100K",
      "70-100K",
      "40-70K",
      "30-40K",
      "20-30K",
      "15-20K",
      "10-15K",
      "6-10K",
      "Tab >40K",
      "Tab <40K",
      "Wearable"
    ];

    // Fetch sales data
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          parsedDate: {$gte: startDate, $lte: endDate}
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data seperately 
    // Fetch sales data specifically for the end date for FTD
    const ftdData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticIds.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;
      

      if (data_format === "value"){
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD" : ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD" : ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }

    });

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataTSEWise = async (req, res) => {
  try {
    let { start_date, end_date, data_format } = req.query;
    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Calculate the last month's corresponding date range for LMTD comparison
    let lastMonthStartDate = new Date(startDate);
    lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
    lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

    let lastMonthEndDate = new Date(endDate);
    lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
    lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

    const targetValues = {
      "Anil Choudhary": 52741851,
      "Dhanajay": 7109004,
      "Govind Sharma": 2046902,
      "Hemant": 3164577,
      "Jitendra Parashar": 37443710,
      "Kunal": 9328490,
      "MUKESH SAIN": 20768660,
      "Rahul": 11414821,
      "Ram Chandra": 2276583,
      "RAVI": 18429557,
      "Rishi Sharma": 5817764,
      "Sunny Hatwal": 72451604,
      "Vacant": 3054409
    };

    const targetVolumes = {
      "Anil Choudhary": 1263,
      "Dhanajay": 352,
      "Govind Sharma": 104,
      "Hemant": 186,
      "Jitendra Parashar": 1221,
      "Kunal": 376,
      "MUKESH SAIN": 542,
      "Rahul": 461,
      "Ram Chandra": 105,
      "RAVI": 659,
      "Rishi Sharma": 226,
      "Sunny Hatwal": 1474,
      "Vacant": 102
    };

    const staticTSENames = [
      "Anil Choudhary",
      "Dhanajay",
      "Govind Sharma",
      "Hemant",
      "Jitendra Parashar",
      "Kunal",
      "MUKESH SAIN",
      "Rahul",
      "Ram Chandra",
      "RAVI",
      "Rishi Sharma",
      "Sunny Hatwal",
      "Vacant"
    ];

    // Fetch sales data
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$TSE",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static TSEs and calculate additional fields
    const resultData = staticTSENames.map(tseName => {
      const tseData = salesData.find(tse => tse._id === tseName) || {};
      const targetValue = targetValues[tseName] || 0;
      const targetVolume = targetVolumes[tseName] || 0;
      const mtdSellOut = tseData["MTD SELL OUT"] || 0;
      const lmtSellOut = tseData["LMTD SELL OUT"] || 0;

      if (data_format === "value") {
        return {
          _id: tseName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: tseName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataABMWise = async (req, res) => {
  try {
    let { start_date, end_date, data_format } = req.query;
    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();
    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));
    
    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Calculate the last month's corresponding date range for LMTD comparison
    let lastMonthStartDate = new Date(startDate);
    lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
    lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

    let lastMonthEndDate = new Date(endDate);
    lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
    lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

    const targetValues = {
      "Narendra Singh Shekhawat": 203383462,
      "Natansh Pareek": 40339527,
      "Neeraj Raghuwanshi": 1661542,
      "Piyush Soni": 189261,
      "Vikramaditya Singh Rathore": 474141,
    };
    
    const targetVolumes = {
      "Narendra Singh Shekhawat": 6356,
      "Natansh Pareek": 2246,
      "Neeraj Raghuwanshi": 49,
      "Piyush Soni": 5,
      "Vikramaditya Singh Rathore": 10,
    };

    const staticTSENames = [
      "Narendra Singh Shekhawat",
      "Natansh Pareek",
      "Neeraj Raghuwanshi",
      "Piyush Soni",
      "Vikramaditya Singh Rathore"
    ];

    // Fetch sales data
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$ABM",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static TSEs and calculate additional fields
    const resultData = staticTSENames.map(tseName => {
      const tseData = salesData.find(tse => tse._id === tseName) || {};
      const targetValue = targetValues[tseName] || 0;
      const targetVolume = targetVolumes[tseName] || 0;
      // console.log("MTD:", tseData["MTD SELL OUT"])
      const mtdSellOut = tseData["MTD SELL OUT"] || 0;
      const lmtSellOut = tseData["LMTD SELL OUT"] || 0;

      if (data_format === "value") {
        return {
          _id: tseName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: tseName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataASMWise = async (req, res) => {
 try {
   let { start_date, end_date, data_format } = req.query;
   if (!data_format) data_format = "value";

   let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
   let endDate = end_date ? new Date(end_date) : new Date();
   const parseDate = (dateString) => {
     const [month, day, year] = dateString.split('/');
     return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
   };

   startDate = parseDate(startDate.toLocaleDateString('en-US'));
   endDate = parseDate(endDate.toLocaleDateString('en-US'));
   
   const currentMonth = endDate.getMonth() + 1;
   const currentYear = endDate.getFullYear();
   const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
   const daysPassed = endDate.getDate();

   // Calculate the last month's corresponding date range for LMTD comparison
   let lastMonthStartDate = new Date(startDate);
   lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
   lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

   let lastMonthEndDate = new Date(endDate);
   lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
   lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

   const targetValues = {
    "Jay Tikkiwal" : 45334,
    "Jitendra":29115,
    "Manish Pareek":12227,
   };
   
   const targetVolumes = {
    "Jay Tikkiwal" : 4533,
    "Jitendra":2911,
    "Manish Pareek":1222,
   };

   const staticASMNames = [
   "Jay Tikkiwal",
   "Jitendra",
   "Manish Pareek"
   ];

   // Fetch sales data
   const salesData = await SalesData.aggregate([
     {
       $addFields: {
         parsedDate: {
           $dateFromString: {
             dateString: "$DATE",
             format: "%m/%d/%Y", // Define the format of the date strings in your dataset
             timezone: "UTC" // Specify timezone if necessary
           }
         }
       }
     },
     {
       $match: {
         "SALES TYPE": "Sell Out",
         parsedDate: { $gte: startDate, $lte: endDate }
       }
     },
     {
       $group: {
         _id: "$ASM",
         "MTD SELL OUT": {
           $sum: {
             $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
           }
         },
         "LMTD SELL OUT": {
           $sum: {
             $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
           }
         } 
       }
     }
   ]);

   // Manually assign static TSEs and calculate additional fields
   const resultData = staticASMNames.map(aseName => {
     const aseData = salesData.find(asm => asm._id === aseName) || {};
     const targetValue = targetValues[aseName] || 0;
     const targetVolume = targetVolumes[aseName] || 0;
     // console.log("MTD:", tseData["MTD SELL OUT"])
     const mtdSellOut = aseData["MTD SELL OUT"] || 0;
     const lmtSellOut = aseData["LMTD SELL OUT"] || 0;
 
     if (data_format === "value") {
       return {
         _id: aseName,
         "MTD SELL OUT": mtdSellOut,
         "LMTD SELL OUT": lmtSellOut,
         "TARGET VALUE": targetValue,
         "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
         "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
         "VAL PENDING": targetValue - mtdSellOut,
         // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
         "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
       };
     } else if (data_format === "volume") {
       return {
         _id: aseName,
         "MTD SELL OUT": mtdSellOut,
         "LMTD SELL OUT": lmtSellOut,
         "TARGET VOLUME": targetVolume,
         "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
         "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
         "VOL PENDING": targetVolume - mtdSellOut,
         // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
         "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
       };
     }
   });

   res.status(200).json(resultData);

 } catch (error) {
   console.error(error);
   res.status(500).send("Internal Server Error");
 }
};

exports.getSalesDataRSOWise = async (req, res) => {
  try {
    let { start_date, end_date, data_format } = req.query;
    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();
    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));
    
    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Calculate the last month's corresponding date range for LMTD comparison
    let lastMonthStartDate = new Date(startDate);
    lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
    lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

    let lastMonthEndDate = new Date(endDate);
    lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
    lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

    const targetValues = {
      "Ravindra Singh Shekhawat": 203383462,
      "Rishi Raj Pareek": 40339527,
    };
    
    const targetVolumes = {
      "Ravindra Singh Shekhawat": 6356,
      "Rishi Raj Pareek": 2246,
    };

    const staticRSONames = [
      "Ravindra Singh Shekhawat",
      "Rishi Raj Pareek",
    ];

    // Fetch sales data
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$RSO",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static RSOs and calculate additional fields
    const resultData = staticRSONames.map(rsoName => {
      const rsoData = salesData.find(rso => rso._id === rsoName) || {};
      const targetValue = targetValues[rsoName] || 0;
      const targetVolume = targetVolumes[rsoName] || 0;
      const mtdSellOut = rsoData["MTD SELL OUT"] || 0;
      const lmtSellOut = rsoData["LMTD SELL OUT"] || 0;

      if (data_format === "value") {
        return {
          _id: rsoName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: rsoName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataCLUSTERWise = async (req, res) => {
  try {
    let { start_date, end_date, data_format } = req.query;
    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();
    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));
    
    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Calculate the last month's corresponding date range for LMTD comparison
    let lastMonthStartDate = new Date(startDate);
    lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
    lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

    let lastMonthEndDate = new Date(endDate);
    lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
    lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

    const targetValues = {
      "Agra Road": 5836167,
      "Barkat Nagar": 1149923,
      "GANPATI Plaza": 47717732,
      "Jagat Pura & India Gate": 9686231,
      "Jayanti": 24796104,
      "Mahesh Nagar": 845053,
      "Malpura Gate": 9668430,
      "Malviya Ngr & Tonk Road": 43155775,
      "NSR": 15043632,
      "Raisar Plaza": 3086038,
      "RAJAPARK": 21331528,
      "Sanganer": 17581776,
      "Shastri Nagar": 6969862,
      "Sodala": 17965104,
      "Udaipur": 1850803,
      "Vaishali Nagar": 7853244,
      "WALL CITY": 11036391,
      "Jodhpur": 474141,
    };
    
    const targetVolumes = {
      "Agra Road": 227,
      "Barkat Nagar": 53,
      "GANPATI Plaza": 852,
      "Jagat Pura & India Gate": 411,
      "Jayanti": 627,
      "Mahesh Nagar": 40,
      "Malpura Gate": 395,
      "Malviya Ngr & Tonk Road": 1049,
      "NSR": 436,
      "Raisar Plaza": 125,
      "RAJAPARK": 568,
      "Sanganer": 658,
      "Shastri Nagar": 299,
      "Sodala": 603,
      "Udaipur": 53,
      "Vaishali Nagar": 201,
      "WALL CITY": 465,
      "Jodhpur": 10,
    };
    
    const staticClusterNames = [
      "Agra Road",
      "Barkat Nagar",
      "GANPATI Plaza",
      "Jagat Pura & India Gate",
      "Jayanti",
      "Mahesh Nagar",
      "Malpura Gate",
      "Malviya Ngr & Tonk Road",
      "NSR",
      "Raisar Plaza",
      "RAJAPARK",
      "Sanganer",
      "Shastri Nagar",
      "Sodala",
      "Udaipur",
      "Vaishali Nagar",
      "WALL CITY",
      "Jodhpur",
    ];

    // Fetch sales data
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$CLUSTER",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static RSOs and calculate additional fields
    const resultData = staticClusterNames.map(clusterName => {
      const clusterData = salesData.find(cluster => cluster._id === clusterName) || {};
      const targetValue = targetValues[clusterName] || 0;
      const targetVolume = targetVolumes[clusterName] || 0;
      const mtdSellOut = clusterData["MTD SELL OUT"] || 0;
      const lmtSellOut = clusterData["LMTD SELL OUT"] || 0;

      if (data_format === "value") {
        return {
          _id: clusterName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: clusterName,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          // "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, tse) => acc + (tse["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataSegmentWiseTSE = async (req, res) => {
  try {
    let { start_date, end_date, data_format, tse } = req.query;

    if (!data_format) data_format = "value";

    const targetValues = {
      "Anil Choudhary": 52741851,
      "Dhanajay": 7109004,
      "Govind Sharma": 2046902,
      "Hemant": 3164577,
      "Jitendra Parashar": 37443710,
      "Kunal": 9328490,
      "MUKESH SAIN": 20768660,
      "Rahul": 11414821,
      "Ram Chandra": 2276583,
      "RAVI": 18429557,
      "Rishi Sharma": 5817764,
      "Sunny Hatwal": 72451604,
      "Vacant": 3054409
    };

    const targetVolumes = {
      "Anil Choudhary": 1263,
      "Dhanajay": 352,
      "Govind Sharma": 104,
      "Hemant": 186,
      "Jitendra Parashar": 1221,
      "Kunal": 376,
      "MUKESH SAIN": 542,
      "Rahul": 461,
      "Ram Chandra": 105,
      "RAVI": 659,
      "Rishi Sharma": 226,
      "Sunny Hatwal": 1474,
      "Vacant": 102
    };

    const staticTSENames = [
      "Anil Choudhary",
      "Dhanajay",
      "Govind Sharma",
      "Hemant",
      "Jitendra Parashar",
      "Kunal",
      "MUKESH SAIN",
      "Rahul",
      "Ram Chandra",
      "RAVI",
      "Rishi Sharma",
      "Sunny Hatwal",
      "Vacant"
    ];

    // Check if the provided TSE name exists in the static list
    if (!staticTSENames.includes(tse)) {
      return res.status(400).json({ error: "Invalid TSE name" });
    }

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Calculate the last month's corresponding date range for LMTD comparison
    let lastMonthStartDate = new Date(startDate);
    lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
    lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

    let lastMonthEndDate = new Date(endDate);
    lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
    lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

    // Fetch sales data for the specific TSE
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          "TSE": tse,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Fetch FTD data specifically for the end date
    const ftdData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          "TSE": tse,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticTSENames.map(name => {
      if (name === tse) {
        return salesData.map(segment => {
          const segmentId = segment._id;
          const ftdSegment = ftdData.find(s => s._id === segmentId) || {};
          const targetValue = targetValues[name] || 0;
          const targetVolume = targetVolumes[name] || 0;
          const mtdSellOut = segment["MTD SELL OUT"] || 0;
          const lmtSellOut = segment["LMTD SELL OUT"] || 0;
          const ftdSellOut = ftdSegment["FTD"] || 0;

          if (data_format === "value") {
            return {
              TSE: name,
              "Segment": segmentId,
              "MTD SELL OUT": mtdSellOut || 0,
              "LMTD SELL OUT": lmtSellOut || 0,
              "TARGET VALUE": targetValue || 0,
              "FTD": ftdSellOut || 0,
              "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1) || 0,
              "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1) || 0,
              "VAL PENDING": targetValue - mtdSellOut || 0,
              "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2) || "0.00",
              "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
            };
          } else if (data_format === "volume") {
            return {
              TSE: name,
              "Segment": segmentId,
              "MTD SELL OUT": mtdSellOut || 0,
              "LMTD SELL OUT": lmtSellOut || 0,
              "TARGET VOLUME": targetVolume || 0,
              "FTD": ftdSellOut || 0,
              "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1) || 0,
              "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1) || 0,
              "VOL PENDING": targetVolume - mtdSellOut || 0,
              "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2) || "0.00",
              "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
            };
          }
        });
      }
    }).flat();

    res.status(200).json(resultData.filter(data => data != null));

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};




// Segment wise APIs
// exports.getSegmentDataForZSM = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, zsm } = req.query;

//     if (!zsm) return res.status(400).send({ error: "ZSM parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Calculate the last month's corresponding date range for LMTD comparison
//     let lastMonthStartDate = new Date(startDate);
//     lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
//     lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

//     let lastMonthEndDate = new Date(endDate);
//     lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
//     lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

//     const targetValues = {
//       "100K": 82729425,
//       "70-100K": 30461652,
//       "40-70K": 25169124,
//       "30-40K": 27633511,
//       "20-30K": 11072500,
//       "15-20K": 33387787,
//       "10-15K": 14580195,
//       "6-10K": 9291145,
//       "Tab >40K": 5202269,
//       "Tab <40K": 3844941,
//       "Wearable": 2676870
//     };

//     const targetVolumes = {
//         "100K": 574,
//         "70-100K": 347,
//         "40-70K": 454,
//         "30-40K": 878,
//         "20-30K": 423,
//         "15-20K": 1947,
//         "10-15K": 1027,
//         "6-10K": 1020,
//         "Tab >40K": 231,
//         "Tab <40K": 59,
//         "Wearable": 130
//     }

//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ZSM": zsm,
//           parsedDate: {$gte: startDate, $lte: endDate}
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data seperately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ZSM": zsm,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;
      

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }

//     });

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

// exports.getSegmentDataForZSM = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, zsm } = req.query;
//     console.log("Start date, End date, data_format, zsm: ", start_date, end_date, data_format, zsm)

//     if (!zsm) return res.status(400).send({ error: "ZSM parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Use the helper function to fetch target values and volumes
//     const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, zsm, "ZSM");



//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ZSM": zsm,
//           parsedDate: {$gte: startDate, $lte: endDate}
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data seperately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ZSM": zsm,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;
      

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }

//     });

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getSegmentDataForZSM = async (req, res) => {
  try {
    let { start_date, end_date, data_format, zsm } = req.query;
    console.log("Start date, End date, data_format, zsm: ", start_date, end_date, data_format, zsm);

    if (!zsm) return res.status(400).send({ error: "ZSM parameter is required" });

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Use the helper function to fetch target values and volumes
    const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, zsm, "ZSM");

    // Fetch sales data
    const salesData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "ZSM": zsm,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "ZSM": zsm,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

// exports.getSegmentDataForABM = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, abm } = req.query;

//     if (!abm) return res.status(400).send({ error: "ABM parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Calculate the last month's corresponding date range for LMTD comparison
//     let lastMonthStartDate = new Date(startDate);
//     lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
//     lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

//     let lastMonthEndDate = new Date(endDate);
//     lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
//     lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

//     // Use the helper function to fetch target values and volumes
//     const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, abm, "ABM");


//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ABM": abm,
//           parsedDate: {$gte: startDate, $lte: endDate}
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data separately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ABM": abm,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }

//     });

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getSegmentDataForABM = async (req, res) => {
  try {
    let { start_date, end_date, data_format, abm } = req.query;

    if (!abm) return res.status(400).send({ error: "ABM parameter is required" });

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Use the helper function to fetch target values and volumes
    const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, abm, "ABM");

    // Fetch sales data
    const salesData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "ABM": abm,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "ABM": abm,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};


// exports.getSegmentDataForRSO = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, rso } = req.query;

//     if (!rso) return res.status(400).send({ error: "RSO parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Calculate the last month's corresponding date range for LMTD comparison
//     let lastMonthStartDate = new Date(startDate);
//     lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
//     lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

//     let lastMonthEndDate = new Date(endDate);
//     lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
//     lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

//     const targetValues = {
//       "100K": 82729425,
//       "70-100K": 30461652,
//       "40-70K": 25169124,
//       "30-40K": 27633511,
//       "20-30K": 11072500,
//       "15-20K": 33387787,
//       "10-15K": 14580195,
//       "6-10K": 9291145,
//       "Tab >40K": 5202269,
//       "Tab <40K": 3844941,
//       "Wearable": 2676870
//     };

//     const targetVolumes = {
//         "100K": 574,
//         "70-100K": 347,
//         "40-70K": 454,
//         "30-40K": 878,
//         "20-30K": 423,
//         "15-20K": 1947,
//         "10-15K": 1027,
//         "6-10K": 1020,
//         "Tab >40K": 231,
//         "Tab <40K": 59,
//         "Wearable": 130
//     }

//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "RSO": rso,
//           parsedDate: {$gte: startDate, $lte: endDate}
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data separately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "RSO": rso,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }

//     });

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getSegmentDataForRSO = async (req, res) => {
  try {
    let { start_date, end_date, data_format, rso } = req.query;

    if (!rso) return res.status(400).send({ error: "RSO parameter is required" });

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    const targetValues = {
      "100K": 82729425,
      "70-100K": 30461652,
      "40-70K": 25169124,
      "30-40K": 27633511,
      "20-30K": 11072500,
      "15-20K": 33387787,
      "10-15K": 14580195,
      "6-10K": 9291145,
      "Tab >40K": 5202269,
      "Tab <40K": 3844941,
      "Wearable": 2676870
    };

    const targetVolumes = {
        "100K": 574,
        "70-100K": 347,
        "40-70K": 454,
        "30-40K": 878,
        "20-30K": 423,
        "15-20K": 1947,
        "10-15K": 1027,
        "6-10K": 1020,
        "Tab >40K": 231,
        "Tab <40K": 59,
        "Wearable": 130
    };

    // Fetch sales data
    const salesData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "RSO": rso,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "RSO": rso,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value"){
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD" : ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD" : ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};


// exports.getSegmentDataForASE = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, ase } = req.query;

//     if (!ase) return res.status(400).send({ error: "ASE parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Calculate the last month's corresponding date range for LMTD comparison
//     let lastMonthStartDate = new Date(startDate);
//     lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
//     lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

//     let lastMonthEndDate = new Date(endDate);
//     lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
//     lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

//     // Use the helper function to fetch target values and volumes
//     const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, ase, "ASE");


//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ASE": ase,
//           parsedDate: {$gte: startDate, $lte: endDate}
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data separately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ASE": ase,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }

//     });

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getSegmentDataForASE = async (req, res) => {
  try {
    let { start_date, end_date, data_format, ase } = req.query;

    if (!ase) return res.status(400).send({ error: "ASE parameter is required" });

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Use the helper function to fetch target values and volumes
    const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, ase, "ASE");

    // Fetch sales data
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          "ASE": ase,
          parsedDate: {$gte: startDate, $lte: endDate}
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          "ASE": ase,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value"){
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD" : ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD" : ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};


// exports.getSegmentDataForASM = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, asm } = req.query;

//     if (!asm) return res.status(400).send({ error: "ASM parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Calculate the last month's corresponding date range for LMTD comparison
//     let lastMonthStartDate = new Date(startDate);
//     lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
//     lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

//     let lastMonthEndDate = new Date(endDate);
//     lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
//     lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

//     // Use the helper function to fetch target values and volumes
//     const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, asm, "ASM");


//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ASM": asm,
//           parsedDate: {$gte: startDate, $lte: endDate}
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data separately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "ASM": asm,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }

//     });

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getSegmentDataForASM = async (req, res) => {
  try {
    let { start_date, end_date, data_format, asm } = req.query;

    if (!asm) return res.status(400).send({ error: "ASM parameter is required" });

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Use the helper function to fetch target values and volumes
    const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, asm, "ASM");

    // Fetch sales data
    const salesData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          "ASM": asm,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$DATE",
              format: "%m/%d/%Y", // Define the format of the date strings in your dataset
              timezone: "UTC" // Specify timezone if necessary
            }
          }
        }
      },
      {
        $match: {
          "SALES TYPE": "Sell Out",
          "ASM": asm,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};


// exports.getSegmentDataForTSE = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, tse } = req.query;

//     if (!tse) return res.status(400).send({ error: "TSE parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Calculate the last month's corresponding date range for LMTD comparison
//     let lastMonthStartDate = new Date(startDate);
//     lastMonthStartDate.setMonth(lastMonthStartDate.getMonth() - 1);
//     lastMonthStartDate = parseDate(lastMonthStartDate.toLocaleDateString('en-US'));

//     let lastMonthEndDate = new Date(endDate);
//     lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() - 1);
//     lastMonthEndDate = parseDate(lastMonthEndDate.toLocaleDateString('en-US'));

//     // Use the helper function to fetch target values and volumes
//     const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, tse, "TSE");


//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "TSE": tse,
//           parsedDate: {$gte: startDate, $lte: endDate}
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data separately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y", // Define the format of the date strings in your dataset
//               timezone: "UTC" // Specify timezone if necessary
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "TSE": tse,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD" : ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }

//     });

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getSegmentDataForTSE = async (req, res) => {
  try {
    let { start_date, end_date, data_format, tse } = req.query;

    if (!tse) return res.status(400).send({ error: "TSE parameter is required" });

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Use the helper function to fetch target values and volumes
    const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, tse, "TSE");

    // Fetch sales data
    const salesData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "TSE": tse,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "TSE": tse,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};


// Segment wise APIs for dealer 


// exports.getSegmentDataForDealer = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format, dealer_code } = req.query;
//     console.log("Start date, End date, data_format, dealer_code: ", start_date, end_date, data_format, dealer_code);

//     if (!dealer_code) return res.status(400).send({ error: "Dealer parameter is required" });

//     if (!data_format) data_format = "value";

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const currentMonth = endDate.getMonth() + 1;
//     const currentYear = endDate.getFullYear();
//     const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
//     const daysPassed = endDate.getDate();

//     // Use the helper function to fetch target values and volumes
//     const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, dealer_code, "BUYER CODE");

//     // Fetch sales data
//     const salesData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y",
//               timezone: "UTC"
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealer_code,
//           parsedDate: { $gte: startDate, $lte: endDate }
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "MTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           },
//           "LMTD SELL OUT": {
//             $sum: {
//               $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Find FTD data separately 
//     const ftdData = await SalesData.aggregate([
//       {
//         $addFields: {
//           parsedDate: {
//             $dateFromString: {
//               dateString: "$DATE",
//               format: "%m/%d/%Y",
//               timezone: "UTC"
//             }
//           }
//         }
//       },
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealer_code,
//           parsedDate: endDate
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",
//           "FTD": {
//             $sum: {
//               $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
//             }
//           }
//         }
//       }
//     ]);

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticSegments.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
//       const ftdSellOut = ftdSegmentData["FTD"] || 0;

//       if (data_format === "value") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
//           "FTD": ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VAL PENDING": targetValue - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       } else if (data_format === "volume") {
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VOLUME": targetVolume,
//           "FTD": ftdSellOut,
//           "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
//           "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
//           "VOL PENDING": targetVolume - mtdSellOut,
//           "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
//           "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
//         };
//       }
//     });

//     // Calculate the grand total row based on the data format
//     let grandTotal;
//     if (data_format === "value") {
//       grandTotal = resultData.reduce((totals, segment) => {
//         totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
//         totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
//         totals["FTD"] += segment["FTD"] || 0;
//         totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
//         totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
//         return totals;
//       }, {
//         "_id": "Grand Total",
//         "MTD SELL OUT": 0,
//         "LMTD SELL OUT": 0,
//         "FTD": 0,
//         "TARGET VALUE": 0,
//         "AVERAGE DAY SALE": 0,
//         "DAILY REQUIRED AVERAGE": 0,
//         "VAL PENDING": 0,
//         "CONTRIBUTION %": 0,
//         "% GWTH": 0
//       });

//       // Calculate derived fields for "value"
//       grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
//       grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
//       grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
//       grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
//     } else if (data_format === "volume") {
//       grandTotal = resultData.reduce((totals, segment) => {
//         totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
//         totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
//         totals["FTD"] += segment["FTD"] || 0;
//         totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
//         totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
//         return totals;
//       }, {
//         "_id": "Grand Total",
//         "MTD SELL OUT": 0,
//         "LMTD SELL OUT": 0,
//         "FTD": 0,
//         "TARGET VOLUME": 0,
//         "AVERAGE DAY SALE": 0,
//         "DAILY REQUIRED AVERAGE": 0,
//         "VOL PENDING": 0,
//         "CONTRIBUTION %": 0,
//         "% GWTH": 0
//       });

//       // Calculate derived fields for "volume"
//       grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
//       grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
//       grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
//       grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
//     }

//     // Add the grand total as the first row in resultData
//     resultData.unshift(grandTotal);

//     res.status(200).json(resultData);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getSegmentDataForDealer = async (req, res) => {
  try {
    let { start_date, end_date, data_format, dealer_code } = req.query;
    console.log("Start date, End date, data_format, dealer_code: ", start_date, end_date, data_format, dealer_code);

    if (!dealer_code) return res.status(400).send({ error: "Dealer parameter is required" });

    // Convert dealer_code to uppercase
    dealer_code = dealer_code.toUpperCase();

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Use the helper function to fetch target values and volumes
    const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, dealer_code, "BUYER CODE");

    // Fetch sales data
    const salesData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealer_code,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealer_code,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};




exports.getSalesDashboardDataForDealer = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format, dealer_code } = req.query;

    if (!dealer_code) {
      return res.status(400).send({ error: "Dealer Code is required." });
    }

    if (!td_format) td_format = 'MTD';
    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1; // Month is zero-based
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1; // Month is zero-based
    const presentDayOfMonth = endDate.getDate();

    let matchStage = {
      parsedDate: {
        $gte: startDate,
        $lte: endDate
      },
      ['BUYER CODE']: dealer_code
    };

    const lytdStartDate = new Date(`${endYear - 1}-01-01`);
    const lytdEndDate = new Date(`${endYear - 1}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`);

    let result = {};

    if (td_format === 'MTD') {
      const salesStats = await SalesData.aggregate([
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
        { $match: matchStage },
        {
          $group: {
            _id: "$SALES TYPE",
            MTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
            LMTD_Value: { $sum: { $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME" } }
          }
        },
        {
          $project: {
            _id: 0,
            salesType: "$_id",
            MTD_Value: 1,
            LMTD_Value: 1,
            Growth_Percent: {
              $cond: {
                if: { $eq: ["$LMTD_Value", 0] },
                then: "N/A",
                else: { $multiply: [{ $divide: [{ $subtract: ["$MTD_Value", "$LMTD_Value"] }, "$LMTD_Value"] }, 100] }
              }
            }
          }
        }
      ]);

      salesStats.forEach(item => {
        if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
          result.td_sell_in = formatNumberIndian(item.MTD_Value);
          result.ltd_sell_in = formatNumberIndian(item.LMTD_Value);
          result.sell_in_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        } else if (item.salesType === "Sell Out") {
          result.td_sell_out = formatNumberIndian(item.MTD_Value);
          result.ltd_sell_out = formatNumberIndian(item.LMTD_Value);
          result.sell_out_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        }
      });

    }

    if (td_format === 'YTD') {
      let lastYearSalesStats = await SalesData.aggregate([
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
            parsedDate: {
              $gte: lytdStartDate,
              $lte: lytdEndDate
            },
            ['BUYER CODE']: dealer_code
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } },
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        }
      ]);

      const salesStats = await SalesData.aggregate([
        {
          $addFields: {
            parsedDate: {
              $dateFromString: {
                dateString: "$DATE",
                format: "%m/%d/%Y",
                timezone: "UTC"
              }
            }
          },
        },
        {
          $match: {
            parsedDate: {
              $gte: new Date(`${endYear}-01-01`),
              $lte: endDate
            },
            ['BUYER CODE']: dealer_code
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } },
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        }
      ]);

      if (lastYearSalesStats.length <= 0) {
        lastYearSalesStats = [
          { _id: 'Sell Thru2', 'YTD VALUE': 0, 'YTD VOLUME': 0 },
          { _id: 'Sell Out', 'YTD VALUE': 0, 'YTD VOLUME': 0 }
        ]
      }

      salesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.td_sell_out = item['YTD VALUE'];
        } else {
          result.td_sell_in = item['YTD VALUE'];
        }
      });
      lastYearSalesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.ltd_sell_out = item['YTD VALUE'];
        } else {
          result.ltd_sell_in = item['YTD VALUE'];
        }
      });

      result.sell_in_growth =
        result.ltd_sell_in !== 0 ?
          (result.td_sell_in - result.ltd_sell_in) / result.ltd_sell_in * 100
          : 0;

      result.sell_out_growth =
        result.ltd_sell_out !== 0 ?
          (result.td_sell_out - result.ltd_sell_out) / result.ltd_sell_out * 100
          : 0;

      result.td_sell_in = formatNumberIndian(result.td_sell_in);
      result.ltd_sell_in = formatNumberIndian(result.ltd_sell_in);
      result.td_sell_out = formatNumberIndian(result.td_sell_out);
      result.ltd_sell_out = formatNumberIndian(result.ltd_sell_out);
      result.sell_in_growth = result.sell_in_growth + '%';
      result.sell_out_growth = result.sell_out_growth + '%';

      // Remove any additional fields if present
      result = {
        td_sell_out: result.td_sell_out,
        ltd_sell_out: result.ltd_sell_out,
        sell_out_growth: result.sell_out_growth,
        td_sell_in: result.td_sell_in,
        ltd_sell_in: result.ltd_sell_in,
        sell_in_growth: result.sell_in_growth
      };
    }

    res.status(200).send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};


// Segment wise APIs for all  
exports.getSegmentDataForAllPositions = async (req, res) => {
  try {
    let { start_date, end_date, data_format, position, name } = req.query;
    console.log("Start date, End date, data_format, position, name: ", start_date, end_date, data_format, zsm, position);

    if (!position) return res.status(400).send({ error: "Position parameter is required" });
    if (!name) return res.status(400).send({ error: "Name parameter is required" });

    if (!data_format) data_format = "value";

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const currentMonth = endDate.getMonth() + 1;
    const currentYear = endDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysPassed = endDate.getDate();

    // Use the helper function to fetch target values and volumes
    const { targetValues, targetVolumes } = await fetchTargetValuesAndVolumes(endDate, name, position);

    // Fetch sales data
    const salesData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          position : name,
          parsedDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "MTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          },
          "LMTD SELL OUT": {
            $sum: {
              $toInt: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME"
            }
          }
        }
      }
    ]);

    // Find FTD data separately 
    const ftdData = await SalesData.aggregate([
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
          "SALES TYPE": "Sell Out",
          position : name,
          parsedDate: endDate
        }
      },
      {
        $group: {
          _id: "$Segment New",
          "FTD": {
            $sum: {
              $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME"
            }
          }
        }
      }
    ]);

    // Manually assign static IDs and calculate additional fields
    const resultData = staticSegments.map(id => {
      const segmentData = salesData.find(segment => segment._id === id) || {};
      const ftdSegmentData = ftdData.find(segment => segment._id === id) || {};
      const targetValue = targetValues[id] || 0;
      const targetVolume = targetVolumes[id] || 0;
      const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
      const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;
      const ftdSellOut = ftdSegmentData["FTD"] || 0;

      if (data_format === "value") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VALUE": targetValue,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetValue - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VAL PENDING": targetValue - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      } else if (data_format === "volume") {
        return {
          _id: id,
          "MTD SELL OUT": mtdSellOut,
          "LMTD SELL OUT": lmtSellOut,
          "TARGET VOLUME": targetVolume,
          "FTD": ftdSellOut,
          "AVERAGE DAY SALE": mtdSellOut / Math.max(daysPassed - 1, 1),
          "DAILY REQUIRED AVERAGE": (targetVolume - mtdSellOut) / Math.max(daysInMonth - daysPassed, 1),
          "VOL PENDING": targetVolume - mtdSellOut,
          "CONTRIBUTION %": ((mtdSellOut / (salesData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0))) * 100).toFixed(2),
          "% GWTH": lmtSellOut ? (((mtdSellOut - lmtSellOut) / lmtSellOut) * 100).toFixed(2) : "N/A"
        };
      }
    });

    // Calculate the grand total row based on the data format
    let grandTotal;
    if (data_format === "value") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VALUE"] += segment["TARGET VALUE"] || 0;
        totals["VAL PENDING"] += segment["VAL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VALUE": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VAL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "value"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VALUE"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    } else if (data_format === "volume") {
      grandTotal = resultData.reduce((totals, segment) => {
        totals["MTD SELL OUT"] += segment["MTD SELL OUT"] || 0;
        totals["LMTD SELL OUT"] += segment["LMTD SELL OUT"] || 0;
        totals["FTD"] += segment["FTD"] || 0;
        totals["TARGET VOLUME"] += segment["TARGET VOLUME"] || 0;
        totals["VOL PENDING"] += segment["VOL PENDING"] || 0;
        return totals;
      }, {
        "_id": "Grand Total",
        "MTD SELL OUT": 0,
        "LMTD SELL OUT": 0,
        "FTD": 0,
        "TARGET VOLUME": 0,
        "AVERAGE DAY SALE": 0,
        "DAILY REQUIRED AVERAGE": 0,
        "VOL PENDING": 0,
        "CONTRIBUTION %": 0,
        "% GWTH": 0
      });

      // Calculate derived fields for "volume"
      grandTotal["AVERAGE DAY SALE"] = grandTotal["MTD SELL OUT"] / Math.max(daysPassed - 1, 1);
      grandTotal["DAILY REQUIRED AVERAGE"] = (grandTotal["TARGET VOLUME"] - grandTotal["MTD SELL OUT"]) / Math.max(daysInMonth - daysPassed, 1);
      grandTotal["CONTRIBUTION %"] = ((grandTotal["MTD SELL OUT"] / resultData.reduce((acc, seg) => acc + (seg["MTD SELL OUT"] || 0), 0)) * 100).toFixed(2);
      grandTotal["% GWTH"] = (grandTotal["LMTD SELL OUT"] ? (((grandTotal["MTD SELL OUT"] - grandTotal["LMTD SELL OUT"]) / grandTotal["LMTD SELL OUT"]) * 100).toFixed(2) : "N/A");
    }

    // Add the grand total as the first row in resultData
    resultData.unshift(grandTotal);

    res.status(200).json(resultData);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error!");
  }
};



// GET ALL SUBORDINATES 
// exports.getAllSubordinates = async (req, res) => {
//   try {
//     let { name, position } = req.query;

//     if (!name || !position) {
//       return res.status(400).json({ error: "Name and position are required." });
//     }

//     const positionsHierarchy = {
//       ZSM: ["ABM", "RSO", "ASE", "ASM", "TSE"],
//       ABM: ["RSO", "ASE", "ASM", "TSE"],
//       RSO: ["ASE", "ASM", "TSE"],
//       ASE: ["ASM", "TSE"],
//       ASM: ["TSE"],
//     };

//     if (!positionsHierarchy[position]) {
//       return res.status(400).json({ error: "Invalid position." });
//     }

//     const subordinatesPipeline = [
//       {
//         $match: {
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: null,
//           ABM: { $addToSet: { $cond: [{ $or: [{ $eq: ["$ABM", ""] }, { $eq: ["$ABM", "0"] }] }, null, "$ABM"] } },
//           RSO: { $addToSet: { $cond: [{ $or: [{ $eq: ["$RSO", ""] }, { $eq: ["$RSO", "0"] }] }, null, "$RSO"] } },
//           ASE: { $addToSet: { $cond: [{ $or: [{ $eq: ["$ASE", ""] }, { $eq: ["$ASE", "0"] }] }, null, "$ASE"] } },
//           ASM: { $addToSet: { $cond: [{ $or: [{ $eq: ["$ASM", ""] }, { $eq: ["$ASM", "0"] }] }, null, "$ASM"] } },
//           TSE: { $addToSet: { $cond: [{ $or: [{ $eq: ["$TSE", ""] }, { $eq: ["$TSE", "0"] }] }, null, "$TSE"] } },
//         }
//       },
//       {
//         $project: {
//           _id: 0,
//           subordinates: positionsHierarchy[position].reduce((acc, pos) => {
//             acc[pos] = { $filter: { input: `$${pos}`, as: "name", cond: { $and: [{ $ne: ["$$name", null] }, { $ne: ["$$name", ""] }, { $ne: ["$$name", "0"] }] } } };
//             return acc;
//           }, {})
//         }
//       }
//     ];

//     const subordinates = await SalesData.aggregate(subordinatesPipeline);

//     if (!subordinates.length) {
//       return res.status(404).json({ error: "No subordinates found." });
//     }

//     res.status(200).json(subordinates[0].subordinates);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };

exports.getAllSubordinates = async (req, res) => {
  try {
    let { name, position } = req.query;

    if (!name || !position) {
      return res.status(400).json({ error: "Name and position are required." });
    }

    const positionsHierarchy = {
      ZSM: ["ABM", "RSO", "ASE", "ASM", "TSE"],
      ABM: ["RSO", "ASE", "ASM", "TSE"],
      RSO: ["ASE", "ASM", "TSE"],
      ASE: ["ASM", "TSE"],
      ASM: ["TSE"],
    };

    if (!positionsHierarchy[position]) {
      return res.status(400).json({ error: "Invalid position." });
    }

    const subordinatesPipeline = [
      {
        $match: {
          [position]: name
        }
      },
      {
        $group: {
          _id: null,
          ABM: { $addToSet: { $cond: [{ $or: [{ $eq: ["$ABM", ""] }, { $eq: ["$ABM", "0"] }] }, null, "$ABM"] } },
          RSO: { $addToSet: { $cond: [{ $or: [{ $eq: ["$RSO", ""] }, { $eq: ["$RSO", "0"] }] }, null, "$RSO"] } },
          ASE: { $addToSet: { $cond: [{ $or: [{ $eq: ["$ASE", ""] }, { $eq: ["$ASE", "0"] }] }, null, "$ASE"] } },
          ASM: { $addToSet: { $cond: [{ $or: [{ $eq: ["$ASM", ""] }, { $eq: ["$ASM", "0"] }] }, null, "$ASM"] } },
          TSE: { $addToSet: { $cond: [{ $or: [{ $eq: ["$TSE", ""] }, { $eq: ["$TSE", "0"] }] }, null, "$TSE"] } },
        }
      },
      {
        $project: {
          _id: 0,
          subordinates: positionsHierarchy[position].reduce((acc, pos) => {
            acc[pos] = { $filter: { input: `$${pos}`, as: "name", cond: { $and: [{ $ne: ["$$name", null] }, { $ne: ["$$name", ""] }, { $ne: ["$$name", "0"] }] } } };
            return acc;
          }, {})
        }
      }
    ];

    const subordinates = await SalesData.aggregate(subordinatesPipeline);

    if (!subordinates.length) {
      return res.status(404).json({ error: "No subordinates found." });
    }

    const result = {
      positions: positionsHierarchy[position],
      ...subordinates[0].subordinates
    };

    res.status(200).json(result);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};












