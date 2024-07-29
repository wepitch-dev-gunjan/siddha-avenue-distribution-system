const csvParser = require("csv-parser");
const { Readable } = require("stream");
const xlsx = require("xlsx");
const Data = require("../models/SalesData");
const SalesData = require("../models/SalesData");
const { getLastDaysOfPreviousMonths, channelOrder, getDaysElapsedInMonth, getDaysRemainingInMonth, getDaysElapsedInRange, getDaysRemainingInMonthFromDate, calculateTarget, getStartOfMonth, getLastMonthPeriod  } = require("../helpers/salesHelpers");
const {
  filterSalesData,
  generateSegmentWiseReport,
  calculateContribution,
  calculatePendingValue,
  calculateExtrapolated,
  calculateGrowth,
  calculateRequiredAds,
  categorizePriceBand
} = require('../helpers/reportHelpers');


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

    if (data_format === 'value') {
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

// exports.getSalesDataSegmentWise = async (req, res) => {
//   try {
//     let { start_date, end_date, data_format } = req.query;

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

//     const staticIds = [
//       "100K",
//       "70-100K",
//       "40-70K",
//       "30-40K",
//       "20-30K",
//       "15-20K",
//       "10-15K",
//       "6-10K",
//       "Tab >40K",
//       "Tab <40K",
//       "Wearable"
//     ];

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

//     // Manually assign static IDs and calculate additional fields
//     const resultData = staticIds.map(id => {
//       const segmentData = salesData.find(segment => segment._id === id) || {};
//       const targetValue = targetValues[id] || 0;
//       const targetVolume = targetVolumes[id] || 0;
//       const mtdSellOut = segmentData["MTD SELL OUT"] || 0;
//       const lmtSellOut = segmentData["LMTD SELL OUT"] || 0;

//       if (data_format === "value"){
//         return {
//           _id: id,
//           "MTD SELL OUT": mtdSellOut,
//           "LMTD SELL OUT": lmtSellOut,
//           "TARGET VALUE": targetValue,
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
// ASM Wise
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






