const csvParser = require("csv-parser");
const { Readable } = require("stream");
const xlsx = require("xlsx");
const Data = require("../models/SalesData");
const SalesData = require("../models/SalesData");
const { getLastDaysOfPreviousMonths, channelOrder } = require("../helpers/salesHelpers");

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

exports.getSalesDataChannelWise = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format } = req.query;
    let startDate, startYear, startMonth, endDate, endMonth, endYear;

    if (!td_format) td_format = 'MTD'
    if (start_date) {
      startDate = new Date(start_date);
    } else {
      startDate = new Date();
    }
    if (end_date) {
      endDate = new Date(end_date);
    } else {
      endDate = new Date();
    }
    if (!data_format) data_format = "value"

    startYear = startDate.getFullYear();
    startMonth = startDate.getMonth() + 1; // Month is zero-based
    endYear = endDate.getFullYear();
    endMonth = endDate.getMonth() + 1; // Month is zero-based

    const presentDayOfMonth = new Date().getDate();

    // Calculate the start and end dates for LYTD
    const lytdStartDate = `${startYear - 1}-01-01`; // January 1st of the previous year
    const lytdEndDate = `${startYear - 1}-${startMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`; // End of the current month for the previous year

    if (td_format === 'MTD' && data_format === 'value') {
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-${startMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$CHANNEL",
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
            "MTD Sell out": "$channelsData.MTD VALUE",
            "LMTD Sell out": "$channelsData.LMTD VALUE",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LMTD VALUE", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.MTD VALUE", "$channelsData.LMTD VALUE"] }, "$channelsData.LMTD VALUE"] },
                    100
                  ]
                }
              }
            },
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
            }
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

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'MTD' && data_format === 'volume') {
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-${startMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$CHANNEL",
            "MTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } },
            "LMTD VOLUME": { $sum: { $toInt: "$LMTD VOLUME" } },
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VOLUME" },
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
            "MTD Sell out": "$channelsData.MTD VOLUME",
            "LMTD Sell out": "$channelsData.LMTD VOLUME",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LMTD VOLUME", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.MTD VOLUME", "$channelsData.LMTD VOLUME"] }, "$channelsData.LMTD VOLUME"] },
                    100
                  ]
                }
              }
            },
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
            }
          }
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

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'YTD' && data_format === 'value') {
      const lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: lytdStartDate, // Start of the previous year
              $lte: lytdEndDate // End of the previous year's current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        {
          $group: {
            _id: null,
            totalLYTDSellOut: { $sum: "$YTD VALUE" },
            channelsData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        {
          $unwind: "$channelsData"
        },
        {
          $project: {
            "Channel": "$channelsData._id",
            "LYTD Sell out": "$channelsData.YTD VALUE"
          }
        }
      ]);

      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalYTDSellOut: { $sum: "$YTD VALUE" },
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
            "YTD Sell out": "$channelsData.YTD VALUE",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LYTD VALUE", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.YTD VALUE", "$channelsData.LYTD VALUE"] }, "$channelsData.LYTD VALUE"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalYTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$channelsData.YTD VALUE", "$totalYTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      // Loop through each element in salesStats array
      salesStats.forEach(currentChannel => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingChannel = lastYearSalesStats.find(channel => channel.Channel === currentChannel.Channel);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingChannel) {
          currentChannel["LYTD Sell out"] = matchingChannel["LYTD Sell out"];
          currentChannel["%Gwth"] = parseInt(currentChannel["YTD Sell out"]) / parseInt(matchingChannel["LYTD Sell out"]) * 100;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentChannel["LYTD Sell out"] = 0;
          currentChannel["%Gwth"] = 0;
        }
      });

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

      // Now, salesStats array contains LYTD Sell out for each channel
      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'YTD' && data_format === 'volume') {
      const lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear - 1}-01-01`, // Start of the previous year
              $lte: `${endYear - 1}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the previous year's current month
            }
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        },
        {
          $group: {
            _id: null,
            totalLYTDSellOut: { $sum: "$YTD VOLUME" },
            channelsData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        {
          $unwind: "$channelsData"
        },
        {
          $project: {
            "Channel": "$channelsData._id",
            "LYTD Sell out": "$channelsData.YTD VOLUME"
          }
        }
      ]);

      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalYTDSellOut: { $sum: "$YTD VOLUME" },
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
            "YTD Sell out": "$channelsData.YTD VOLUME",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LYTD VOLUME", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.YTD VOLUME", "$channelsData.LYTD VOLUME"] }, "$channelsData.LYTD VOLUME"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalYTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$channelsData.YTD VOLUME", "$totalYTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      // Loop through each element in salesStats array
      salesStats.forEach(currentChannel => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingChannel = lastYearSalesStats.find(channel => channel.Channel === currentChannel.Channel);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingChannel) {
          currentChannel["LYTD Sell out"] = matchingChannel["LYTD Sell out"];
          currentChannel["%Gwth"] = parseInt(currentChannel["YTD Sell out"]) / parseInt(matchingChannel["LYTD Sell out"]) * 100;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentChannel["LYTD Sell out"] = 0;
          currentChannel["%Gwth"] = 0;
        }
      });

      // Sorting the salesStats array based on channelOrder
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
        }
        // If both channels are found in channelOrder, sort based on their indices
        return indexA - indexB;

      });

      // Now, salesStats array contains LYTD Sell out for each channel
      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataSegmentWise = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format } = req.query;
    let startDate, startYear, startMonth, endDate, endMonth, endYear;

    if (!td_format) td_format = 'MTD'
    if (start_date) {
      startDate = new Date(start_date);
    } else {
      startDate = new Date();
    }
    if (end_date) {
      endDate = new Date(end_date);
    } else {
      endDate = new Date();
    }
    if (!data_format) data_format = "value"

    startYear = startDate.getFullYear();
    startMonth = startDate.getMonth() + 1; // Month is zero-based
    endYear = endDate.getFullYear();
    endMonth = endDate.getMonth() + 1; // Month is zero-based

    const presentDayOfMonth = endDate.getDate();

    // Calculate the start and end dates for LYTD
    const lytdStartDate = `${startYear - 1}-01-01`; // January 1st of the previous year
    const lytdEndDate = `${startYear - 1}-${startMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`; // End of the current month for the previous year

    if (td_format === 'MTD' && data_format === 'value') {
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-${startMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$PRICE BAND",
            "LMTD": { $sum: { $toInt: "$LMTD VALUE" } },
            "MTD": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VALUE" },
            segmentsData: { $push: "$$ROOT" }
          }
        },
        // Stage 3: Unwind the array to access grouped data
        {
          $unwind: "$segmentsData"
        },
        // Stage 4: Calculate %Gwth (percentage growth) and Contribution
        {
          $project: {
            "Price Band": "$segmentsData._id",
            "LMTD": "$segmentsData.LMTD",
            "MTD": "$segmentsData.MTD",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$segmentsData.LMTD", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$segmentsData.MTD", "$segmentsData.LMTD"] }, "$segmentsData.LMTD"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalMTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$segmentsData.MTD", "$totalMTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      const ftdSalesStats = await SalesData.aggregate([
        {
          $match: {
            "DATE": `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth - 1}`,
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$PRICE BAND",
            "FTD": { $sum: { $toInt: "$MTD VALUE" } }
          }
        }
      ]);

      const adsSalesStats = await SalesData.aggregate([
        {
          $match: {
            "DATE": {
              $gte: `${endYear}-${endMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by PRICE BAND and calculate MTD Sell out
        {
          $group: {
            _id: "$PRICE BAND",
            "totalMTDValue": { $sum: { $toInt: "$MTD VALUE" } }, // Calculate total MTD VALUE for each PRICE BAND
            "count": { $sum: 1 } // Count the number of documents in each group
          }
        },
        // Stage 2: Calculate average MTD VALUE for each PRICE BAND
        {
          $project: {
            "ADS": { $divide: ["$totalMTDValue", "$count"] } // Calculate average MTD VALUE
          }
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
        }
        // If both channels are found in channelOrder, sort based on their indices
        return indexA - indexB;

      });

      salesStats.forEach(currentSegment => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingSegment = ftdSalesStats.find(segment => segment._id === currentSegment['Price Band']);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingSegment) {
          currentSegment['FTD'] = matchingSegment.FTD;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentSegment['FTD'] = 0;
        }
      });

      salesStats.forEach(currentSegment => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingSegment = adsSalesStats.find(segment => segment._id === currentSegment['Price Band']);
        console.log(matchingSegment)

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingSegment) {
          currentSegment['ADS'] = matchingSegment.ADS;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentSegment['ADS'] = 0;
        }
      });

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'MTD' && data_format === 'volume') {
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-${startMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$CHANNEL",
            "MTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } },
            "LMTD VOLUME": { $sum: { $toInt: "$LMTD VOLUME" } },
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VOLUME" },
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
            "MTD Sell out": "$channelsData.MTD VOLUME",
            "LMTD Sell out": "$channelsData.LMTD VOLUME",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LMTD VOLUME", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.MTD VOLUME", "$channelsData.LMTD VOLUME"] }, "$channelsData.LMTD VOLUME"] },
                    100
                  ]
                }
              }
            },
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
            }
          }
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

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'YTD' && data_format === 'value') {
      const lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: lytdStartDate, // Start of the previous year
              $lte: lytdEndDate // End of the previous year's current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        {
          $group: {
            _id: null,
            totalLYTDSellOut: { $sum: "$YTD VALUE" },
            channelsData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        {
          $unwind: "$channelsData"
        },
        {
          $project: {
            "Channel": "$channelsData._id",
            "LYTD Sell out": "$channelsData.YTD VALUE"
          }
        }
      ]);

      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalYTDSellOut: { $sum: "$YTD VALUE" },
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
            "YTD Sell out": "$channelsData.YTD VALUE",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LYTD VALUE", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.YTD VALUE", "$channelsData.LYTD VALUE"] }, "$channelsData.LYTD VALUE"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalYTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$channelsData.YTD VALUE", "$totalYTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      // Loop through each element in salesStats array
      salesStats.forEach(currentChannel => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingChannel = lastYearSalesStats.find(channel => channel.Channel === currentChannel.Channel);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingChannel) {
          currentChannel["LYTD Sell out"] = matchingChannel["LYTD Sell out"];
          currentChannel["%Gwth"] = parseInt(currentChannel["YTD Sell out"]) / parseInt(matchingChannel["LYTD Sell out"]) * 100;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentChannel["LYTD Sell out"] = 0;
          currentChannel["%Gwth"] = 0;
        }
      });

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

      // Now, salesStats array contains LYTD Sell out for each channel
      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'YTD' && data_format === 'volume') {
      const lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear - 1}-01-01`, // Start of the previous year
              $lte: `${endYear - 1}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the previous year's current month
            }
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        },
        {
          $group: {
            _id: null,
            totalLYTDSellOut: { $sum: "$YTD VOLUME" },
            channelsData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        {
          $unwind: "$channelsData"
        },
        {
          $project: {
            "Channel": "$channelsData._id",
            "LYTD Sell out": "$channelsData.YTD VOLUME"
          }
        }
      ]);

      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$CHANNEL",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalYTDSellOut: { $sum: "$YTD VOLUME" },
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
            "YTD Sell out": "$channelsData.YTD VOLUME",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LYTD VOLUME", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.YTD VOLUME", "$channelsData.LYTD VOLUME"] }, "$channelsData.LYTD VOLUME"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalYTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$channelsData.YTD VOLUME", "$totalYTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      // Loop through each element in salesStats array
      salesStats.forEach(currentChannel => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingChannel = lastYearSalesStats.find(channel => channel.Channel === currentChannel.Channel);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingChannel) {
          currentChannel["LYTD Sell out"] = matchingChannel["LYTD Sell out"];
          currentChannel["%Gwth"] = parseInt(currentChannel["YTD Sell out"]) / parseInt(matchingChannel["LYTD Sell out"]) * 100;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentChannel["LYTD Sell out"] = 0;
          currentChannel["%Gwth"] = 0;
        }
      });

      // Sorting the salesStats array based on channelOrder
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
        }
        // If both channels are found in channelOrder, sort based on their indices
        return indexA - indexB;

      });

      // Now, salesStats array contains LYTD Sell out for each channel
      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataTSEWise = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format } = req.query;
    let startDate, startYear, startMonth, endDate, endMonth, endYear;

    if (!td_format) td_format = 'MTD'
    if (start_date) {
      startDate = new Date(start_date);
    } else {
      startDate = new Date();
    }
    if (end_date) {
      endDate = new Date(end_date);
    } else {
      endDate = new Date();
    }
    if (!data_format) data_format = "value"

    startYear = startDate.getFullYear();
    startMonth = startDate.getMonth() + 1; // Month is zero-based
    endYear = endDate.getFullYear();
    endMonth = endDate.getMonth() + 1; // Month is zero-based

    const presentDayOfMonth = endDate.getDate();

    // Calculate the start and end dates for LYTD
    const lytdStartDate = `${startYear - 1}-01-01`; // January 1st of the previous year
    const lytdEndDate = `${startYear - 1}-${startMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`; // End of the current month for the previous year

    if (td_format === 'MTD' && data_format === 'value') {
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-${startMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$TSE",
            "LMTD": { $sum: { $toInt: "$LMTD VALUE" } },
            "MTD": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VALUE" },
            tseData: { $push: "$$ROOT" }
          }
        },
        // Stage 3: Unwind the array to access grouped data
        {
          $unwind: "$tseData"
        },
        // Stage 4: Calculate %Gwth (percentage growth) and Contribution
        {
          $project: {
            "TSE": "$tseData._id",
            "LMTD": "$tseData.LMTD",
            "MTD": "$tseData.MTD",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$tseData.LMTD", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$tseData.MTD", "$tseData.LMTD"] }, "$tseData.LMTD"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalMTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$tseData.MTD", "$totalMTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      const ftdSalesStats = await SalesData.aggregate([
        {
          $match: {
            "DATE": `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth - 1}`,
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$TSE",
            "FTD": { $sum: { $toInt: "$MTD VALUE" } }
          }
        }
      ]);

      const adsSalesStats = await SalesData.aggregate([
        {
          $match: {
            "DATE": {
              $gte: `${endYear}-${endMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by PRICE BAND and calculate MTD Sell out
        {
          $group: {
            _id: "$TSE",
            "totalMTDValue": { $sum: { $toInt: "$MTD VALUE" } }, // Calculate total MTD VALUE for each PRICE BAND
            "count": { $sum: 1 } // Count the number of documents in each group
          }
        },
        // Stage 2: Calculate average MTD VALUE for each PRICE BAND
        {
          $project: {
            "ADS": { $divide: ["$totalMTDValue", "$count"] } // Calculate average MTD VALUE
          }
        },
        {
          $sort: { "contribution": -1 }
        }
      ]);

      salesStats.forEach(currentTse => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingTse = ftdSalesStats.find(segment => segment._id === currentTse['TSE']);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingTse) {
          currentTse['FTD'] = matchingTse.FTD;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentTse['FTD'] = 0;
        }
      });

      salesStats.forEach(currentTse => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingTse = adsSalesStats.find(segment => segment._id === currentTse['TSE']);
        console.log(matchingTse)

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingTse) {
          currentTse['ADS'] = matchingTse.ADS;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentTse['ADS'] = 0;
        }
      });

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'MTD' && data_format === 'volume') {
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-${startMonth.toString().padStart(2, '0')}-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        // Stage 1: Group by Channel and calculate MTD and LMTD Sell out
        {
          $group: {
            _id: "$TSE",
            "MTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } },
            "LMTD VOLUME": { $sum: { $toInt: "$LMTD VOLUME" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalMTDSellOut: { $sum: "$MTD VOLUME" },
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
            "MTD Sell out": "$channelsData.MTD VOLUME",
            "LMTD Sell out": "$channelsData.LMTD VOLUME",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$channelsData.LMTD VOLUME", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$channelsData.MTD VOLUME", "$channelsData.LMTD VOLUME"] }, "$channelsData.LMTD VOLUME"] },
                    100
                  ]
                }
              }
            },
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
            }
          }
        },
        // Stage 5: Sort by descending Contribution
        {
          $sort: { "Contribution": -1 }
        }
      ]);

      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'YTD' && data_format === 'value') {
      const lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: lytdStartDate, // Start of the previous year
              $lte: lytdEndDate // End of the previous year's current month
            },
            "SALES TYPE": "Sell Out"
          }
        },
        {
          $group: {
            _id: "$TSE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        {
          $group: {
            _id: null,
            totalLYTDSellOut: { $sum: "$YTD VALUE" },
            tseData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        {
          $unwind: "$tseData"
        },
        {
          $project: {
            "TSE": "$tseData._id",
            "LYTD Sell out": "$tseData.YTD VALUE"
          }
        }
      ]);

      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$TSE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalYTDSellOut: { $sum: "$YTD VALUE" },
            tseData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        // Stage 3: Unwind the array to access grouped data
        {
          $unwind: "$tseData"
        },
        // Stage 4: Calculate %Gwth (percentage growth) and Contribution
        {
          $project: {
            "TSE": "$tseData._id",
            "YTD Sell out": "$tseData.YTD VALUE",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$tseData.LYTD VALUE", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$tseData.YTD VALUE", "$tseData.LYTD VALUE"] }, "$tseData.LYTD VALUE"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalYTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$tseData.YTD VALUE", "$totalYTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        },
        // Stage 5: Sort by descending Contribution
        {
          $sort: { "Contribution": -1 }
        }
      ]);

      // Loop through each element in salesStats array
      salesStats.forEach(currentChannel => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingChannel = lastYearSalesStats.find(channel => channel.Channel === currentChannel.Channel);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingChannel) {
          currentChannel["LYTD Sell out"] = matchingChannel["LYTD Sell out"];
          currentChannel["%Gwth"] = parseInt(currentChannel["YTD Sell out"]) / parseInt(matchingChannel["LYTD Sell out"]) * 100;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentChannel["LYTD Sell out"] = 0;
          currentChannel["%Gwth"] = 0;
        }
      });

      // Now, salesStats array contains LYTD Sell out for each channel
      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

    if (td_format === 'YTD' && data_format === 'volume') {
      const lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear - 1}-01-01`, // Start of the previous year
              $lte: `${endYear - 1}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the previous year's current month
            }
          }
        },
        {
          $group: {
            _id: "$TSE",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        },
        {
          $group: {
            _id: null,
            totalLYTDSellOut: { $sum: "$YTD VOLUME" },
            tseData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        {
          $unwind: "$tseData"
        },
        {
          $project: {
            "TSE": "$tseData._id",
            "LYTD Sell out": "$tseData.YTD VOLUME"
          }
        }
      ]);

      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$TSE",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        },
        // Stage 2: Calculate total MTD Sell out
        {
          $group: {
            _id: null,
            totalYTDSellOut: { $sum: "$YTD VOLUME" },
            tseData: { $push: "$$ROOT" } // Preserve grouped data for further processing
          }
        },
        // Stage 3: Unwind the array to access grouped data
        {
          $unwind: "$tseData"
        },
        // Stage 4: Calculate %Gwth (percentage growth) and Contribution
        {
          $project: {
            "TSE": "$tseData._id",
            "YTD Sell out": "$tseData.YTD VOLUME",
            "%Gwth": {
              $cond: {
                if: { $eq: ["$tseData.LYTD VOLUME", 0] },
                then: 0,
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$tseData.YTD VOLUME", "$tseData.LYTD VOLUME"] }, "$tseData.LYTD VOLUME"] },
                    100
                  ]
                }
              }
            },
            "Contribution": {
              $cond: {
                if: { $eq: ["$totalYTDSellOut", 0] }, // Handling zero totalMTDSellOut
                then: 0,
                else: {
                  $multiply: [
                    { $divide: ["$channelsData.YTD VOLUME", "$totalYTDSellOut"] },
                    100
                  ]
                }
              }
            }
          }
        },
        // Stage 5: Sort by descending Contribution
        {
          $sort: { "Contribution": -1 }
        }
      ]);

      // Loop through each element in salesStats array
      salesStats.forEach(currentChannel => {
        // Find the corresponding channel in lastYearSalesStats array
        const matchingChannel = lastYearSalesStats.find(channel => channel.Channel === currentChannel.Channel);

        // If a matching channel is found, merge LYTD Sell out into the currentChannel object
        if (matchingChannel) {
          currentChannel["LYTD Sell out"] = matchingChannel["LYTD Sell out"];
          currentChannel["%Gwth"] = parseInt(currentChannel["YTD Sell out"], 10) / parseInt(matchingChannel["LYTD Sell out"]) * 100;
        } else {
          // If no matching channel is found, set LYTD Sell out to 0
          currentChannel["LYTD Sell out"] = 0;
          currentChannel["%Gwth"] = 0;
        }
      });

      // Now, salesStats array contains LYTD Sell out for each channel
      if (!salesStats || salesStats.length === 0) return res.status(404).send({ error: "Data not found" });
      res.status(200).send(salesStats);
    }

  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDashboardData = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format } = req.query;
    let startDate, startYear, startMonth, endDate, endMonth, endYear;

    if (!td_format) td_format = 'MTD';
    if (start_date) {
      startDate = new Date(start_date);
    } else {
      startDate = new Date(-1);
    }
    if (end_date) {
      endDate = new Date(end_date);
    } else {
      endDate = new Date();
    }
    if (!data_format) data_format = "value";

    startYear = startDate.getFullYear();
    startMonth = startDate.getMonth() + 1; // Month is zero-based
    endYear = endDate.getFullYear();
    endMonth = endDate.getMonth() + 1; // Month is zero-based

    const presentDayOfMonth = endDate.getDate();

    let matchStage = {};

    if (start_date && end_date) {
      matchStage = {
        DATE: {
          $gte: new Date(`${startYear}-${startMonth.toString().padStart(2, '0')}-01`),
          $lte: new Date(`${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`)
        }
      };
    }

    const lytdStartDate = `${startYear - 1}-01-01`;
    const lytdEndDate = `${startYear - 1}-${startMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`;

    let result = {};

    const formatNumber = (num) => {
      if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
      }
      if (num >= 1e3) {
        return (num / 1e3).toFixed(2) + 'K';
      }
      return num.toString();
    };

    if (td_format === 'MTD' && data_format === 'value') {
      const salesStats = await SalesData.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$SALES TYPE",
            MTD_Value: { $sum: { $toInt: "$MTD VALUE" } },
            LMTD_Value: { $sum: { $toInt: "$LMTD VALUE" } }
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
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$MTD_Value", "$LMTD_Value"] }, "$LMTD_Value"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      salesStats.forEach(item => {
        if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
          result.td_sell_in = formatNumber(item.MTD_Value);
          result.ltd_sell_in = formatNumber(item.LMTD_Value);
          result.sell_in_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        } else if (item.salesType === "Sell Out") {
          result.td_sell_out = formatNumber(item.MTD_Value);
          result.ltd_sell_out = formatNumber(item.LMTD_Value);
          result.sell_out_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        }
      });

    }

    if (td_format === 'MTD' && data_format === 'volume') {
      const salesStats = await SalesData.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$SALES TYPE",
            MTD_Volume: { $sum: { $toInt: "$MTD VOLUME" } },
            LMTD_Volume: { $sum: { $toInt: "$LMTD VOLUME" } }
          }
        },
        {
          $project: {
            _id: 0,
            salesType: "$_id",
            MTD_Volume: 1,
            LMTD_Volume: 1,
            Growth_Percent: {
              $cond: {
                if: { $eq: ["$LMTD_Volume", 0] },
                then: "N/A",
                else: {
                  $multiply: [
                    { $divide: [{ $subtract: ["$MTD_Volume", "$LMTD_Volume"] }, "$LMTD_Volume"] },
                    100
                  ]
                }
              }
            }
          }
        }
      ]);

      salesStats.forEach(item => {
        if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
          result.td_sell_in = formatNumber(item.MTD_Volume);
          result.ltd_sell_in = formatNumber(item.LMTD_Volume);
          result.sell_in_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        } else if (item.salesType === "Sell Out") {
          result.td_sell_out = formatNumber(item.MTD_Volume);
          result.ltd_sell_out = formatNumber(item.LMTD_Volume);
          result.sell_out_growth = item.Growth_Percent !== "N/A" ? item.Growth_Percent.toFixed(2) + '%' : "N/A";
        }
      });

    }

    if (td_format === 'YTD' && data_format === 'value') {
      let lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: lytdStartDate, // Start of the previous year
              $lte: lytdEndDate // End of the previous year's current month
            },
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        }
      ]);


      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        },
      ]);

      if (lastYearSalesStats.length <= 0) {
        lastYearSalesStats = [
          { _id: 'Sell Thru2', 'YTD VALUE': 0 },
          { _id: 'Sell Out', 'YTD VALUE': 0 }
        ]
      }

      // console.log("lastYearSalesStats : ", lastYearSalesStats);
      // console.log("salesStats : ", salesStats);
      salesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.td_sell_out = item['YTD VALUE'];
        } else {
          result.td_sell_in = item['YTD VALUE'];
        }
      })
      lastYearSalesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.ltd_sell_out = item['YTD VALUE'];
        } else {
          result.ltd_sell_in = item['YTD VALUE'];
        }
      })


      result.sell_in_growth =
        result.ltd_sell_in !== 0 ?
          (result.td_sell_in - result.ltd_sell_in) / result.ltd_sell_in * 100
          : 0;

      result.sell_out_growth =
        result.ltd_sell_out !== 0 ?
          (result.td_sell_out - result.ltd_sell_out) / result.ltd_sell_out * 100
          : 0;

      result.td_sell_in = formatNumber(result.td_sell_in);
      result.ltd_sell_in = formatNumber(result.ltd_sell_in);
      result.td_sell_out = formatNumber(result.td_sell_out);
      result.ltd_sell_out = formatNumber(result.ltd_sell_out);
      result.sell_in_growth = result.sell_in_growth + '%';
      result.sell_out_growth = result.sell_out_growth + '%';
    }

    if (td_format === 'YTD' && data_format === 'volume') {
      let lastYearSalesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: lytdStartDate, // Start of the previous year
              $lte: lytdEndDate // End of the previous year's current month
            },
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        }
      ]);


      const lastDays = getLastDaysOfPreviousMonths()
      const salesStats = await SalesData.aggregate([
        {
          $match: {
            DATE: {
              $gte: `${startYear}-01-01`, // Start of the current month
              $lte: `${endYear}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}` // End of the current month
            }
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VOLUME": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        },
      ]);

      if (lastYearSalesStats.length <= 0) {
        lastYearSalesStats = [
          { _id: 'Sell Thru2', 'YTD VOLUME': 0 },
          { _id: 'Sell Out', 'YTD VOLUME': 0 }
        ]
      }

      // console.log("lastYearSalesStats : ", lastYearSalesStats);
      // console.log("salesStats : ", salesStats);
      salesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.td_sell_out = item['YTD VOLUME'];
        } else {
          result.td_sell_in = item['YTD VOLUME'];
        }
      })
      lastYearSalesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.ltd_sell_out = item['YTD VOLUME'];
        } else {
          result.ltd_sell_in = item['YTD VOLUME'];
        }
      })


      result.sell_in_growth =
        result.ltd_sell_in !== 0 ?
          (result.td_sell_in - result.ltd_sell_in) / result.ltd_sell_in * 100
          : 0;

      result.sell_out_growth =
        result.ltd_sell_out !== 0 ?
          (result.td_sell_out - result.ltd_sell_out) / result.ltd_sell_out * 100
          : 0;

      result.td_sell_in = formatNumber(result.td_sell_in);
      result.ltd_sell_in = formatNumber(result.ltd_sell_in);
      result.td_sell_out = formatNumber(result.td_sell_out);
      result.ltd_sell_out = formatNumber(result.ltd_sell_out);
      result.sell_in_growth = result.sell_in_growth + '%';
      result.sell_out_growth = result.sell_out_growth + '%';
    }

    res.status(200).send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};


