const SalesDataMTDW = require("../models/SalesDataMTDW");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");
const { formatNumberIndian, parseDate } = require("../helpers/salesHelpers");
const { fetchTargetValuesAndVolumesByChannel, fetchTargetValuesAndVolumes } = require("../helpers/reportHelpers");
const EmployeeCode = require("../models/EmployeeCode");
const Dealer = require("../models/Dealer");
const axios = require('axios');
const { BACKEND_URL } = process.env;

exports.uploadSalesDataMTDW = async (req, res) => {
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

            // Process each row asynchronously
            for (let data of results) {
              // Generate iuid by concatenating all the column values
              const iuid = Object.values(data).join('|'); // Join all values using a delimiter
              console.log("IUID: ", iuid)

              // Check if the iuid already exists in the database
              const existingRecord = await SalesDataMTDW.findOne({ iuid });

              if (!existingRecord) {
                // If iuid does not exist, add the iuid to the data
                data.iuid = iuid;

                // Extract month from the DATE field
                const dateParts = data.DATE.split("/");
                const month = dateParts[0]; // Assuming the DATE format is "MM/DD/YYYY"
                data.month = month;

                newEntries.push(data);
              }
            }

            if (newEntries.length > 0) {
              // Insert new entries into MongoDB
              await SalesDataMTDW.insertMany(newEntries);
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

// EMPLOYEE APIs 
exports.getSalesDashboardDataForEmployeeMTDW = async (req, res) => {
  try {
    let { code } = req;
    let { td_format, start_date, end_date, data_format } = req.query;

    // Validate that employee code is provided
    if (!code) {
      return res.status(400).send({ error: "Employee code is required." });
    }

    // Convert employee code to uppercase
    const employeeCodeUpper = code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });
    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code." });
    }

    const { Name: name, Position: position } = employee;

    if (!td_format) td_format = 'MTD';
    if (!data_format) data_format = "value";

    // Parse start_date and end_date from request query in YYYY-MM-DD format
    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    startDate = new Date(startDate.toLocaleDateString('en-US'));
    endDate = new Date(endDate.toLocaleDateString('en-US'));

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

    const result = {};

    if (td_format === 'MTD') {
      // Fetch current month (MTD) data
      const salesStats = await SalesDataMTDW.aggregate([
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
        { $match: matchStage }, // Match current month
        {
          $group: {
            _id: "$SALES TYPE",
            MTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
          }
        },
        {
          $project: {
            _id: 0,
            salesType: "$_id",
            MTD_Value: 1,
          }
        }
      ]);

      // Fetch last month's data (LMTD)
      let previousMonthStartDate = new Date(startDate);
      previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
      let previousMonthEndDate = new Date(endDate);
      previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

      const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
            parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
            [position]: name
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            LMTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
          }
        },
        {
          $project: {
            _id: 0,
            salesType: "$_id",
            LMTD_Value: 1,
          }
        }
      ]);

      // Error handling: if no data found, set LMTD_Value to 'N/A'
      let lmtDataMap = {};
      lastMonthSalesStats.forEach(item => {
        lmtDataMap[item.salesType] = item.LMTD_Value || 'N/A';
      });

      // Iterate through MTD data and append LMTD
      salesStats.forEach(item => {
        if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
          result.td_sell_in = formatNumberIndian(item.MTD_Value);
          result.ltd_sell_in = lmtDataMap[item.salesType] !== 'N/A' ? formatNumberIndian(lmtDataMap[item.salesType]) : 'N/A';
          result.sell_in_growth = lmtDataMap[item.salesType] !== 'N/A' && lmtDataMap[item.salesType] !== 0
            ? (((item.MTD_Value - lmtDataMap[item.salesType]) / lmtDataMap[item.salesType]) * 100).toFixed(2) + '%'
            : 'N/A';
        } else if (item.salesType === "Sell Out") {
          result.td_sell_out = formatNumberIndian(item.MTD_Value);
          result.ltd_sell_out = lmtDataMap[item.salesType] !== 'N/A' ? formatNumberIndian(lmtDataMap[item.salesType]) : 'N/A';
          result.sell_out_growth = lmtDataMap[item.salesType] !== 'N/A' && lmtDataMap[item.salesType] !== 0
            ? (((item.MTD_Value - lmtDataMap[item.salesType]) / lmtDataMap[item.salesType]) * 100).toFixed(2) + '%'
            : 'N/A';
        }
      });
    }

    // For YTD
    if (td_format === 'YTD') {
      // Current Year YTD data
      const salesStats = await SalesDataMTDW.aggregate([
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
            parsedDate: { $gte: new Date(`${endYear}-01-01`), $lte: endDate },
            [position]: name
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        }
      ]);

      // Last Year YTD data
      const lastYearSalesStats = await SalesDataMTDW.aggregate([
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
            parsedDate: { $gte: new Date(`${endYear - 1}-01-01`), $lte: new Date(`${endYear - 1}-${endMonth}-${presentDayOfMonth}`) },
            [position]: name
          }
        },
        {
          $group: {
            _id: "$SALES TYPE",
            "LYTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
          }
        }
      ]);

      // Error handling for missing LYTD data
      let lastYearDataMap = {};
      lastYearSalesStats.forEach(item => {
        lastYearDataMap[item._id] = item['LYTD VALUE'] || 'N/A';
      });

      // Process and compare YTD and LYTD data
      salesStats.forEach(item => {
        if (item._id === 'Sell Out') {
          result.td_sell_out = exports.formatNumberIndian(item['YTD VALUE']);
          result.ltd_sell_out = lastYearDataMap[item._id] !== 'N/A' ? exports.formatNumberIndian(lastYearDataMap[item._id]) : 'N/A';
          result.sell_out_growth = lastYearDataMap[item._id] !== 'N/A' && lastYearDataMap[item._id] !== 0
            ? (((item['YTD VALUE'] - lastYearDataMap[item._id]) / lastYearDataMap[item._id]) * 100).toFixed(2) + '%'
            : 'N/A';
        } else {
          result.td_sell_in = exports.formatNumberIndian(item['YTD VALUE']);
          result.ltd_sell_in = lastYearDataMap[item._id] !== 'N/A' ? exports.formatNumberIndian(lastYearDataMap[item._id]) : 'N/A';
          result.sell_in_growth = lastYearDataMap[item._id] !== 'N/A' && lastYearDataMap[item._id] !== 0
            ? (((item['YTD VALUE'] - lastYearDataMap[item._id]) / lastYearDataMap[item._id]) * 100).toFixed(2) + '%'
            : 'N/A';
        }
      });
    }

    res.status(200).send(result);

  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};

exports.getSalesDataChannelWiseForEmployeeMTDW = async (req, res) => {
  try {
    let { code } = req;
    let { td_format, start_date, end_date, data_format } = req.query;

    if (!code) {
      return res.status(400).send({ error: "Employee code is required" });
    }

    // Convert employee code to uppercase
    const employeeCodeUpper = code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // Default channels and columns
    const channels = [
      "DCM", "PC", "SCP", "SIS Plus", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
    ];

    const defaultRow = {
      "Category Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!td_format) td_format = 'MTD';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parsedDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by channel
    const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);

    // Query for MTD data
    let salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      totalMTDSales += mtdVol;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      return {
        "Category Wise": channel,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": targetValuesByChannel[channel] || 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Category Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Send column names as an array
    const columnNames = [
      "Category Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Add the column names array to the response
    res.status(200).send({ columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataSegmentWiseForEmployeeMTDW = async (req, res) => {
  try {
    let { code } = req;
    let { start_date, end_date, data_format } = req.query;

    if (!code) {
      return res.status(400).send({ error: "Employee code is required" });
    }

    // Convert employee code to uppercase
    const employeeCodeUpper = code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // Default segments, including smartphones and tablets
    const segments = [
      "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K",
      "Tab >40K", "Tab <40K", "Wearable"
    ];

    const defaultRow = {
      "Segment Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!data_format) data_format = 'value';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by segment
    const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, name, position);

    // Query for MTD data
    const salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise aggregation
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data (previous month's data)
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise LMTD aggregation
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise FTD aggregation
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Handle smartphone segments separately for >40K and <40K
    let greaterThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) > 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    let lessThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) <= 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    // Build the report logic with all segments and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = segments.map(segment => {
      let segmentData = salesStats.find(item => item._id === segment) || {};
      let lmtValue = lmtDataMap[segment] || 0;
      let ftdValue = ftdDataMap[segment] || 0;
    
      // Safely access target values and volumes, defaulting to 0 if undefined
      let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
      let mtdVol = segmentData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;
    
      totalMTDSales += mtdVol;
    
      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
      return {
        "Segment Wise": segment,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Segment Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Segment Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataChannelWiseBySubordinateCodeMTDW = async (req, res) => {
  try {
    let { subordinate_code } = req.params;
    let { td_format, start_date, end_date, data_format } = req.query;

    if (!subordinate_code) {
      return res.status(400).send({ error: "Subordinate code is required" });
    }

    // Convert employee code to uppercase
    const subordinateCodeUpper = subordinate_code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: subordinateCodeUpper });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // Default channels and columns
    const channels = [
      "DCM", "PC", "SCP", "SIS Plus", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
    ];

    const defaultRow = {
      "Category Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!td_format) td_format = 'MTD';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parsedDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by channel
    const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);

    // Query for MTD data
    let salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      totalMTDSales += mtdVol;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      return {
        "Category Wise": channel,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": targetValuesByChannel[channel] || 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Category Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row


        // Add dynamic column names as the first entry in the response
        const columnNames = {
          "Category Wise": "Category Wise",
          "Target Vol": "Target Vol",
          "Mtd Vol": "Mtd Vol",
          "Lmtd Vol": "Lmtd Vol",
          "Pending Vol": "Pending Vol",
          "ADS": "ADS",
          "Req. ADS": "Req. ADS",
          "% Gwth Vol": "% Gwth Vol",
          "Target SO": "Target SO",
          "Activation MTD": "Activation MTD",
          "Activation LMTD": "Activation LMTD",
          "Pending Act": "Pending Act",
          "ADS Activation": "ADS Activation",
          "Req. ADS Activation": "Req. ADS Activation",
          "% Gwth Val": "% Gwth Val",
          "FTD": "FTD",
          "Contribution %": "Contribution %"
        };
    
        // Add the column names at the start of the report
        report.unshift(columnNames);

    res.status(200).send(report);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataSegmentWiseBySubordinateCodeMTDW = async (req, res) => {
  try {
    let { subordinate_code } = req.params;
    let { start_date, end_date, data_format } = req.query;

    if (!subordinate_code) {
      return res.status(400).send({ error: "Subordinate code is required" });
    }

    // Convert employee code to uppercase
    const subordinateCodeUpper = subordinate_code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: subordinateCodeUpper });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // Default segments, including smartphones and tablets
    const segments = [
      "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
      "Tab >40K", "Tab <40K", "Wearable"
    ];

    const defaultRow = {
      "Segment Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!data_format) data_format = 'value';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by segment
    const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, name, position);

    // Query for MTD data
    const salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise aggregation
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data (previous month's data)
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise LMTD aggregation
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise FTD aggregation
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Handle smartphone segments separately for >40K and <40K
    let greaterThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) > 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    let lessThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) <= 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    // Build the report logic with all segments and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = segments.map(segment => {
      let segmentData = salesStats.find(item => item._id === segment) || {};
      let lmtValue = lmtDataMap[segment] || 0;
      let ftdValue = ftdDataMap[segment] || 0;
    
      // Safely access target values and volumes, defaulting to 0 if undefined
      let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
      let mtdVol = segmentData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;
    
      totalMTDSales += mtdVol;
    
      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
      return {
        "Segment Wise": segment,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });
    

    // // Add aggregated smartphone segments
    // report.push({
    //   "Segment Wise": "> 40 K (Smartphones)",
    //   "Target Vol": greaterThan40KSmartphones["TARGET VALUE"],
    //   "Mtd Vol": greaterThan40KSmartphones["MTD VALUE"],
    //   "Lmtd Vol": 0, // Assuming no LMTD for now, can be calculated similarly
    //   "Pending Vol": greaterThan40KSmartphones["TARGET VALUE"] - greaterThan40KSmartphones["MTD VALUE"],
    //   // ... other fields
    // });

    // report.push({
    //   "Segment Wise": "< 40 K (Smartphones)",
    //   "Target Vol": lessThan40KSmartphones["TARGET VALUE"],
    //   "Mtd Vol": lessThan40KSmartphones["MTD VALUE"],
    //   "Lmtd Vol": 0, // Assuming no LMTD for now, can be calculated similarly
    //   "Pending Vol": lessThan40KSmartphones["TARGET VALUE"] - lessThan40KSmartphones["MTD VALUE"],
    //   // ... other fields
    // });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Segment Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Add dynamic column names as the first entry in the response
    const columnNames = {
      "Segment Wise": "Segment Wise",
      "Target Vol": "Target Vol",
      "Mtd Vol": "Mtd Vol",
      "Lmtd Vol": "Lmtd Vol",
      "Pending Vol": "Pending Vol",
      "ADS": "ADS",
      "Req. ADS": "Req. ADS",
      "% Gwth Vol": "% Gwth Vol",
      "Target SO": "Target SO",
      "Activation MTD": "Activation MTD",
      "Activation LMTD": "Activation LMTD",
      "Pending Act": "Pending Act",
      "ADS Activation": "ADS Activation",
      "Req. ADS Activation": "Req. ADS Activation",
      "% Gwth Val": "% Gwth Val",
      "FTD": "FTD",
      "Contribution %": "Contribution %"
    };

    // Add the column names at the start of the report
    report.unshift(columnNames);

    res.status(200).send(report);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataChannelWiseByPositionCategoryMTDW = async (req, res) => {
  try {
    let { code } = req;
    let { td_format, start_date, end_date, data_format, position_category } = req.query;

    if (!code) {
      return res.status(400).send({ error: "Employee code is required" });
    }

    // Convert employee code to uppercase
    const employeeCodeUpper = code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // Call the getAllSubordinatesByCodeMTDW API
    const subordinateRes = await axios.get(
      `${BACKEND_URL}/sales-data-mtdw/get-all-subordinates-by-code-mtdw/${code}`
    );
    
    // Extract the list of subordinates for the provided position category
    const subordinates = subordinateRes.data[position_category] || [];

    // Default channels and columns
    const channels = [
      "DCM", "PC", "SCP", "SIS Plus", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
    ];

    const defaultRow = {
      "Category Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!td_format) td_format = 'MTD';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by channel
    const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);

    // Modify the query to match only the subordinates in salesDataMTDW
    let salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      totalMTDSales += mtdVol;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      return {
        "Category Wise": channel,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": targetValuesByChannel[channel] || 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Category Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Category Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Send response with column names and report data
    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataSegmentWiseByPositionCategoryMTDW = async (req, res) => {
  try {
    let { code } = req;
    let { start_date, end_date, data_format, position_category } = req.query;

    if (!code) {
      return res.status(400).send({ error: "Employee code is required" });
    }

    // Convert employee code to uppercase
    const employeeCodeUpper = code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // Call the getAllSubordinatesByCodeMTDW API to get subordinates for the given position category
    const subordinateRes = await axios.get(
      `${BACKEND_URL}/sales-data-mtdw/get-all-subordinates-by-code-mtdw/${code}`
    );
    
    // Extract the list of subordinates for the provided position category
    const subordinates = subordinateRes.data[position_category] || [];

    // Default segments, including smartphones and tablets
    const segments = [
      "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
      "Tab >40K", "Tab <40K", "Wearable"
    ];

    const defaultRow = {
      "Segment Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!data_format) data_format = 'value';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by segment
    const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, name, position);

    // Query for MTD data (segment-wise aggregation)
    const salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise aggregation
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data (previous month's data)
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise LMTD aggregation
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data (today's data)
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise FTD aggregation
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Build the report logic with all segments and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = segments.map(segment => {
      let segmentData = salesStats.find(item => item._id === segment) || {};
      let lmtValue = lmtDataMap[segment] || 0;
      let ftdValue = ftdDataMap[segment] || 0;
    
      // Safely access target values and volumes, defaulting to 0 if undefined
      let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
      let mtdVol = segmentData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;
    
      totalMTDSales += mtdVol;
    
      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
      return {
        "Segment Wise": segment,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Segment Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Segment Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Send response with column names and report data
    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataChannelWiseBySubordinateNameMTDW = async (req, res) => {
  try {
    let { subordinate_name } = req.params;
    let { td_format, start_date, end_date, data_format } = req.query;

    if (!subordinate_name) {
      return res.status(400).send({ error: "Subordinate name is required" });
    }

    const subordinateName = subordinate_name.trim(); // Sanitize and trim the name if necessary

    // Fetch employee details based on the name
    const employee = await EmployeeCode.findOne({ Name: subordinateName });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given name" });
    }

    const { Name: name, Position: position } = employee;

    // Default channels and columns
    const channels = [
      "DCM", "PC", "SCP", "SIS Plus", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
    ];

    const defaultRow = {
      "Category Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!td_format) td_format = 'MTD';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by channel
    const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);

    // Query for MTD data
    let salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      totalMTDSales += mtdVol;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      return {
        "Category Wise": channel,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": targetValuesByChannel[channel] || 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Category Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Category Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Send response with column names and report data
    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataSegmentWiseBySubordinateNameMTDW = async (req, res) => {
  try {
    let { subordinate_name } = req.params;
    let { start_date, end_date, data_format } = req.query;

    if (!subordinate_name) {
      return res.status(400).send({ error: "Subordinate name is required" });
    }

    const subordinateName = subordinate_name.trim(); // Sanitize and trim the name if necessary

    // Fetch employee details based on the name
    const employee = await EmployeeCode.findOne({ Name: subordinateName });

    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given name" });
    }

    const { Name: name, Position: position } = employee;

    // Default segments, including smartphones and tablets
    const segments = [
      "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K",
      "Tab >40K", "Tab <40K", "Wearable"
    ];

    const defaultRow = {
      "Segment Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!name || !position) {
      return res.status(400).send({ error: "Name and position parameters are required" });
    }

    if (!data_format) data_format = 'value';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by segment
    const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, name, position);

    // Query for MTD data
    const salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise aggregation
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data (previous month's data)
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise LMTD aggregation
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          [position]: name
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise FTD aggregation
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Handle smartphone segments separately for >40K and <40K
    let greaterThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) > 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    let lessThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) <= 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    // Build the report logic with all segments and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = segments.map(segment => {
      let segmentData = salesStats.find(item => item._id === segment) || {};
      let lmtValue = lmtDataMap[segment] || 0;
      let ftdValue = ftdDataMap[segment] || 0;
    
      // Safely access target values and volumes, defaulting to 0 if undefined
      let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
      let mtdVol = segmentData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;
    
      totalMTDSales += mtdVol;
    
      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
      return {
        "Segment Wise": segment,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Segment Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Segment Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Send response with column names and report data
    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getDealerListForEmployee = async (req, res) => {
  try {
    let { code } = req;
    let { start_date, end_date, data_format, dealer_category } = req.query;

    if (!code) {
      return res.status(400).send({ error: "Employee code is required!"});
    }

    const employeeCodeUpper = code.toUpperCase();

    console.log("CODE: ", employeeCodeUpper);

    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

    if (!employee) {
      return res.status(400).send({ error: "Employee not found with this code!!" });
    }

    const { Name: name, Position: position } = employee;
    console.log("Name and Position: ", name, position)

    if (!data_format) data_format = 'value';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    // Query for dealers list 
    const dealerListQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          [position]: name  // Dynamically match the position field to the employee's name
        }
      },
      {
        $project: {
          _id: 0,  // Hide the MongoDB ID
          "BUYER CODE": 1,  // Include BUYER CODE in the result
          "BUYER": 1,       // Include BUYER name in the result
        }
      }
    ];

    const dealers = await SalesDataMTDW.aggregate(dealerListQuery);

    if (!dealers.length) {
      return res.status(404).send({ message: "No matching dealers found!" });
    }

    // Return the list of dealers with BUYER CODE and BUYER
    return res.status(200).send(dealers);

  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};



exports.getSalesDashboardDataForDealerMTDW = async (req, res) => {
  try {
    let { dealerCode } = req;
    let { td_format, start_date, end_date, data_format } = req.query;

    if (!dealerCode) {
      return res.status(400).send({ error: "Dealer Code is required." });
    }
    // console.log("Buyer code:", dealerCode)

    if (!td_format) td_format = 'MTD';
    if (!data_format) data_format = "value";

    // console.log("Start date, End date, td_format, data_format: ", start_date, end_date, td_format, data_format);

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
      ['BUYER CODE']: dealerCode
    };

    const lytdStartDate = new Date(`${endYear - 1}-01-01`);
    const lytdEndDate = new Date(`${endYear - 1}-${endMonth.toString().padStart(2, '0')}-${presentDayOfMonth}`);

    let result = {};

    if (td_format === 'MTD') {
      const salesStats = await SalesDataMTDW.aggregate([
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
            MTD_Value: {
              $sum: {
                $convert: {
                  input: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME",
                  to: "int",
                  onError: 0, // If conversion fails, default to 0
                  onNull: 0   // If the field is null, default to 0
                }
              }
            },
            LMTD_Value: {
              $sum: {
                $convert: {
                  input: data_format === "value" ? "$LMTD VALUE" : "$LMTD VOLUME",
                  to: "int",
                  onError: 0, // If conversion fails, default to 0
                  onNull: 0   // If the field is null, default to 0
                }
              }
            }
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
      let lastYearSalesStats = await SalesDataMTDW.aggregate([
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

      const salesStats = await SalesDataMTDW.aggregate([
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

exports.getSalesDataChannelWiseForDealerMTDW = async (req, res) => {
  try {
    let { dealerCode } = req;
    let { td_format, start_date, end_date, data_format } = req.query;

    if (!dealerCode) {
      return res.status(400).send({ error: "Dealer code is required" });
    }

    // Convert dealer code to uppercase
    const dealerCodeUpper = dealerCode.toUpperCase();

    // Default channels and columns
    const channels = [
      "DCM", "PC", "SCP", "SIS PLUS", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
    ];

    const defaultRow = {
      "Category Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!td_format) td_format = 'MTD';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by channel
    const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, dealerCodeUpper, "BUYER CODE");

    // Query for MTD data
    let salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      totalMTDSales += mtdVol;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      return {
        "Category Wise": channel,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": targetValuesByChannel[channel] || 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Category Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Category Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Send response with column names and report data
    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataSegmentWiseForDealerMTDW = async (req, res) => {
  try {
    let { dealerCode } = req;
    let { start_date, end_date, data_format } = req.query;

    if (!dealerCode) {
      return res.status(400).send({ error: "Dealer code is required" });
    }

    // Convert dealer code to uppercase
    const dealerCodeUpper = dealerCode.toUpperCase();

    // Default segments, including smartphones and tablets
    const segments = [
      "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
      "Tab >40K", "Tab <40K", "Wearable"
    ];

    const defaultRow = {
      "Segment Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!data_format) data_format = 'value';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by segment
    const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, dealerCodeUpper, "BUYER CODE");

    // Query for MTD data
    const salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise aggregation
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data (previous month's data)
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise LMTD aggregation
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$Segment New",  // Segment-wise FTD aggregation
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Handle smartphone segments separately for >40K and <40K
    let greaterThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) > 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    let lessThan40KSmartphones = salesStats
      .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) <= 40)
      .reduce((acc, item) => {
        acc["MTD VALUE"] += item["MTD VALUE"];
        acc["TARGET VALUE"] += item["TARGET VALUE"];
        return acc;
      }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

    // Build the report logic with all segments and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = segments.map(segment => {
      let segmentData = salesStats.find(item => item._id === segment) || {};
      let lmtValue = lmtDataMap[segment] || 0;
      let ftdValue = ftdDataMap[segment] || 0;
    
      // Safely access target values and volumes, defaulting to 0 if undefined
      let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
      let mtdVol = segmentData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;
    
      totalMTDSales += mtdVol;
    
      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
      return {
        "Segment Wise": segment,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Segment Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Segment Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Send response with column names and report data
    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

exports.getSalesDataChannelWiseForDealerByDealerCodeMTDW = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format, dealerCode } = req.query;

    if (!dealerCode) {
      return res.status(400).send({ error: "Dealer code is required" });
    }

    // Convert dealer code to uppercase
    const dealerCodeUpper = dealerCode.toUpperCase();

    // Default channels and columns
    const channels = [
      "DCM", "PC", "SCP", "SIS PLUS", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
    ];

    const defaultRow = {
      "Category Wise": "",
      "Target Vol": 0,
      "Mtd Vol": 0,
      "Lmtd Vol": 0,
      "Pending Vol": 0,
      "ADS": 0,
      "Req. ADS": 0,
      "% Gwth Vol": 0,
      "Target SO": 0,
      "Activation MTD": 0,
      "Activation LMTD": 0,
      "Pending Act": 0,
      "ADS Activation": 0,
      "Req. ADS Activation": 0,
      "% Gwth Val": 0,
      "FTD": 0,
      "Contribution %": 0
    };

    if (!td_format) td_format = 'MTD';

    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    const presentDayOfMonth = new Date().getDate();

    // Fetch target values and volumes by channel
    const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, dealerCodeUpper, "BUYER CODE");

    // Query for MTD data
    let salesStatsQuery = [
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
          parsedDate: { $gte: startDate, $lte: endDate },
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
          "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
        }
      }
    ];

    const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

    // Query for LMTD data
    let previousMonthStartDate = new Date(startDate);
    previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
    let previousMonthEndDate = new Date(endDate);
    previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

    const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
          parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "LMTD VALUE": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Query for FTD data
    const ftdData = await SalesDataMTDW.aggregate([
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
          parsedDate: endDate,
          "SALES TYPE": "Sell Out",
          "BUYER CODE": dealerCodeUpper
        }
      },
      {
        $group: {
          _id: "$OLS TYPE",
          "FTD": {
            $sum: {
              $convert: {
                input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }
      }
    ]);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let totalMTDSales = 0;
    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      totalMTDSales += mtdVol;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      return {
        "Category Wise": channel,
        "Target Vol": targetVol,
        "Mtd Vol": mtdVol,
        "Lmtd Vol": lmtdVol,
        "Pending Vol": pendingVol,
        "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Vol": growthVol.toFixed(2),
        "Target SO": targetValuesByChannel[channel] || 0,
        "Activation MTD": mtdVol,
        "Activation LMTD": lmtdVol,
        "Pending Act": pendingVol,
        "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
        "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
        "% Gwth Val": growthVol.toFixed(2),
        "FTD": ftdValue,
        "Contribution %": contribution
      };
    });

    // Grand total logic
    let grandTotal = report.reduce(
      (total, row) => {
        Object.keys(row).forEach(key => {
          if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
        });
        return total;
      },
      { ...defaultRow, "Category Wise": "Grand Total" }
    );

    grandTotal = {
      ...grandTotal,
      "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Column names as array
    const columnNames = [
      "Category Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "% Gwth Vol",
      "Target SO",
      "Activation MTD",
      "Activation LMTD",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth Val",
      "FTD",
      "Contribution %"
    ];

    // Send response with column names and report data
    res.status(200).json({ columns: columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};



// Utilities 
exports.getAllSubordinatesMTDW = async (req, res) => {
  try {
    let { code } = req;

    if (!code) {
      return res.status(400).send({ error: "Employee code is required!" });
    }

    const employeeCodeUpper = code.toUpperCase();

    // Fetching employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });
    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // console.log("Name & Position: ", name, position);

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
          [position]: name,
        },
      },
      {
        $group: {
          _id: null,
          ABM: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$ABM", ""] }, { $eq: ["$ABM", "0"] }] },
                null,
                "$ABM",
              ],
            },
          },
          RSO: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$RSO", ""] }, { $eq: ["$RSO", "0"] }] },
                null,
                "$RSO",
              ],
            },
          },
          ASE: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$ASE", ""] }, { $eq: ["$ASE", "0"] }] },
                null,
                "$ASE",
              ],
            },
          },
          ASM: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$ASM", ""] }, { $eq: ["$ASM", "0"] }] },
                null,
                "$ASM",
              ],
            },
          },
          TSE: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$TSE", ""] }, { $eq: ["$TSE", "0"] }] },
                null,
                "$TSE",
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          subordinates: positionsHierarchy[position].reduce((acc, pos) => {
            acc[pos] = {
              $concatArrays: [
                [{ $literal: "All" }], // Add "All" element at the start of the array
                {
                  $filter: {
                    input: `$${pos}`,
                    as: "name",
                    cond: {
                      $and: [
                        { $ne: ["$$name", null] },
                        { $ne: ["$$name", ""] },
                        { $ne: ["$$name", "0"] },
                      ],
                    },
                  },
                },
              ],
            };
            return acc;
          }, {}),
        },
      },
    ];

    const subordinates = await SalesDataMTDW.aggregate(subordinatesPipeline);

    if (!subordinates.length) {
      return res.status(404).json({ error: "No subordinates found." });
    }

    const result = {
      positions: positionsHierarchy[position],
      ...subordinates[0].subordinates,
    };

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getAllSubordinatesByCodeMTDW = async (req, res) => {
  try {
    let { code } = req.params;

    if (!code) {
      return res.status(400).send({ error: "Employee code is required!" });
    }

    const employeeCodeUpper = code.toUpperCase();

    // Fetching employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });
    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code" });
    }

    const { Name: name, Position: position } = employee;

    // console.log("Name & Position: ", name, position);

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
          [position]: name,
        },
      },
      {
        $group: {
          _id: null,
          ABM: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$ABM", ""] }, { $eq: ["$ABM", "0"] }] },
                null,
                "$ABM",
              ],
            },
          },
          RSO: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$RSO", ""] }, { $eq: ["$RSO", "0"] }] },
                null,
                "$RSO",
              ],
            },
          },
          ASE: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$ASE", ""] }, { $eq: ["$ASE", "0"] }] },
                null,
                "$ASE",
              ],
            },
          },
          ASM: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$ASM", ""] }, { $eq: ["$ASM", "0"] }] },
                null,
                "$ASM",
              ],
            },
          },
          TSE: {
            $addToSet: {
              $cond: [
                { $or: [{ $eq: ["$TSE", ""] }, { $eq: ["$TSE", "0"] }] },
                null,
                "$TSE",
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          subordinates: positionsHierarchy[position].reduce((acc, pos) => {
            acc[pos] = {
              $concatArrays: [
                [{ $literal: "All" }], // Add "All" element at the start of the array
                {
                  $filter: {
                    input: `$${pos}`,
                    as: "name",
                    cond: {
                      $and: [
                        { $ne: ["$$name", null] },
                        { $ne: ["$$name", ""] },
                        { $ne: ["$$name", "0"] },
                      ],
                    },
                  },
                },
              ],
            };
            return acc;
          }, {}),
        },
      },
    ];

    const subordinates = await SalesDataMTDW.aggregate(subordinatesPipeline);

    if (!subordinates.length) {
      return res.status(404).json({ error: "No subordinates found." });
    }

    const result = {
      positions: positionsHierarchy[position],
      ...subordinates[0].subordinates,
    };

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};






// exports.getSalesDataSegmentWiseForDealerMTDW = async (req, res) => {
//   try {
//     let { dealerCode } = req;
//     let { start_date, end_date, data_format } = req.query;

//     if (!dealerCode) {
//       return res.status(400).send({ error: "Dealer code is required" });
//     }

//     // Convert dealer code to uppercase
//     const dealerCodeUpper = dealerCode.toUpperCase();

//     // Default segments, including smartphones and tablets
//     const segments = [
//       "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
//       "Tab >40K", "Tab <40K", "Wearable"
//     ];

//     const defaultRow = {
//       "Segment Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!data_format) data_format = 'value';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by segment
//     const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, dealerCodeUpper, "BUYER CODE");

//     // Query for MTD data
//     const salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealerCodeUpper
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise aggregation
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data (previous month's data)
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealerCodeUpper
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise LMTD aggregation
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealerCodeUpper
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise FTD aggregation
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Handle smartphone segments separately for >40K and <40K
//     let greaterThan40KSmartphones = salesStats
//       .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) > 40)
//       .reduce((acc, item) => {
//         acc["MTD VALUE"] += item["MTD VALUE"];
//         acc["TARGET VALUE"] += item["TARGET VALUE"];
//         return acc;
//       }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

//     let lessThan40KSmartphones = salesStats
//       .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) <= 40)
//       .reduce((acc, item) => {
//         acc["MTD VALUE"] += item["MTD VALUE"];
//         acc["TARGET VALUE"] += item["TARGET VALUE"];
//         return acc;
//       }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

//     // Build the report logic with all segments and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = segments.map(segment => {
//       let segmentData = salesStats.find(item => item._id === segment) || {};
//       let lmtValue = lmtDataMap[segment] || 0;
//       let ftdValue = ftdDataMap[segment] || 0;
    
//       // Safely access target values and volumes, defaulting to 0 if undefined
//       let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
//       let mtdVol = segmentData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;
    
//       totalMTDSales += mtdVol;
    
//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
//       return {
//         "Segment Wise": segment,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Segment Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     // Add dynamic column names as the first entry in the response
//     const columnNames = {
//       "Segment Wise": "Segment Wise",
//       "Target Vol": "Target Vol",
//       "Mtd Vol": "Mtd Vol",
//       "Lmtd Vol": "Lmtd Vol",
//       "Pending Vol": "Pending Vol",
//       "ADS": "ADS",
//       "Req. ADS": "Req. ADS",
//       "% Gwth Vol": "% Gwth Vol",
//       "Target SO": "Target SO",
//       "Activation MTD": "Activation MTD",
//       "Activation LMTD": "Activation LMTD",
//       "Pending Act": "Pending Act",
//       "ADS Activation": "ADS Activation",
//       "Req. ADS Activation": "Req. ADS Activation",
//       "% Gwth Val": "% Gwth Val",
//       "FTD": "FTD",
//       "Contribution %": "Contribution %"
//     };

//     // Add the column names at the start of the report
//     report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };


// Utility APIs 

// exports.getSalesDataChannelWiseForDealerMTDW = async (req, res) => {
//   try {
//     let { dealerCode } = req;
//     let { td_format, start_date, end_date, data_format } = req.query;

//     if (!dealerCode) {
//       return res.status(400).send({ error: "Dealer code is required" });
//     }

//     // Convert dealer code to uppercase
//     const dealerCodeUpper = dealerCode.toUpperCase();

//     // Default channels and columns
//     const channels = [
//       "DCM", "PC", "SCP", "SIS PLUS", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
//     ];

//     const defaultRow = {
//       "Category Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!td_format) td_format = 'MTD';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by channel
//     const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, dealerCodeUpper, "BUYER CODE");

//     // Query for MTD data
//     let salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealerCodeUpper
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealerCodeUpper
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": dealerCodeUpper
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Build the report logic with all channels and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = channels.map(channel => {
//       let channelData = salesStats.find(item => item._id === channel) || {};
//       let lmtValue = lmtDataMap[channel] || 0;
//       let ftdValue = ftdDataMap[channel] || 0;

//       let targetVol = targetVolumesByChannel[channel] || 0;
//       let mtdVol = channelData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;

//       totalMTDSales += mtdVol;

//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

//       return {
//         "Category Wise": channel,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": targetValuesByChannel[channel] || 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Category Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     // Add dynamic column names as the first entry in the response
//     const columnNames = {
//       "Category Wise": "Category Wise",
//       "Target Vol": "Target Vol",
//       "Mtd Vol": "Mtd Vol",
//       "Lmtd Vol": "Lmtd Vol",
//       "Pending Vol": "Pending Vol",
//       "ADS": "ADS",
//       "Req. ADS": "Req. ADS",
//       "% Gwth Vol": "% Gwth Vol",
//       "Target SO": "Target SO",
//       "Activation MTD": "Activation MTD",
//       "Activation LMTD": "Activation LMTD",
//       "Pending Act": "Pending Act",
//       "ADS Activation": "ADS Activation",
//       "Req. ADS Activation": "Req. ADS Activation",
//       "% Gwth Val": "% Gwth Val",
//       "FTD": "FTD",
//       "Contribution %": "Contribution %"
//     };

//     // Add the column names at the start of the report
//     report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

// exports.getSalesDataSegmentWiseBySubordinateNameMTDW = async (req, res) => {
//   try {
//     let { subordinate_name } = req.params;
//     let { start_date, end_date, data_format } = req.query;

//     if (!subordinate_name) {
//       return res.status(400).send({ error: "Subordinate name is required" });
//     }

//     const subordinateName = subordinate_name.trim(); // Sanitize and trim the name if necessary

//     // Fetch employee details based on the name
//     const employee = await EmployeeCode.findOne({ Name: subordinateName });

//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given name" });
//     }

//     const { Name: name, Position: position } = employee;

//     // Default segments, including smartphones and tablets
//     const segments = [
//       "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K",
//       "Tab >40K", "Tab <40K", "Wearable"
//     ];

//     const defaultRow = {
//       "Segment Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!name || !position) {
//       return res.status(400).send({ error: "Name and position parameters are required" });
//     }

//     if (!data_format) data_format = 'value';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by segment
//     const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, name, position);

//     // Query for MTD data
//     const salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise aggregation
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data (previous month's data)
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise LMTD aggregation
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise FTD aggregation
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Handle smartphone segments separately for >40K and <40K
//     let greaterThan40KSmartphones = salesStats
//       .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) > 40)
//       .reduce((acc, item) => {
//         acc["MTD VALUE"] += item["MTD VALUE"];
//         acc["TARGET VALUE"] += item["TARGET VALUE"];
//         return acc;
//       }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

//     let lessThan40KSmartphones = salesStats
//       .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) <= 40)
//       .reduce((acc, item) => {
//         acc["MTD VALUE"] += item["MTD VALUE"];
//         acc["TARGET VALUE"] += item["TARGET VALUE"];
//         return acc;
//       }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

//     // Build the report logic with all segments and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = segments.map(segment => {
//       let segmentData = salesStats.find(item => item._id === segment) || {};
//       let lmtValue = lmtDataMap[segment] || 0;
//       let ftdValue = ftdDataMap[segment] || 0;
    
//       // Safely access target values and volumes, defaulting to 0 if undefined
//       let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
//       let mtdVol = segmentData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;
    
//       totalMTDSales += mtdVol;
    
//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
//       return {
//         "Segment Wise": segment,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Segment Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     // Add dynamic column names as the first entry in the response
//     const columnNames = {
//       "Segment Wise": "Segment Wise",
//       "Target Vol": "Target Vol",
//       "Mtd Vol": "Mtd Vol",
//       "Lmtd Vol": "Lmtd Vol",
//       "Pending Vol": "Pending Vol",
//       "ADS": "ADS",
//       "Req. ADS": "Req. ADS",
//       "% Gwth Vol": "% Gwth Vol",
//       "Target SO": "Target SO",
//       "Activation MTD": "Activation MTD",
//       "Activation LMTD": "Activation LMTD",
//       "Pending Act": "Pending Act",
//       "ADS Activation": "ADS Activation",
//       "Req. ADS Activation": "Req. ADS Activation",
//       "% Gwth Val": "% Gwth Val",
//       "FTD": "FTD",
//       "Contribution %": "Contribution %"
//     };

//     // Add the column names at the start of the report
//     report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

// exports.getSalesDataChannelWiseForEmployeeMTDW = async (req, res) => {
//   try {
//     let { code } = req;
//     let { td_format, start_date, end_date, data_format } = req.query;

//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required" });
//     }

//     // Convert employee code to uppercase
//     const employeeCodeUpper = code.toUpperCase();

//     // Fetch employee details based on the code
//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given code" });
//     }

//     const { Name: name, Position: position } = employee;

//     // Default channels and columns
//     const channels = [
//       "DCM", "PC", "SCP", "SIS Plus", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
//     ];

//     const defaultRow = {
//       "Category Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!name || !position) {
//       return res.status(400).send({ error: "Name and position parameters are required" });
//     }

//     if (!td_format) td_format = 'MTD';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parsedDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by channel
//     const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);

//     // Query for MTD data
//     let salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Build the report logic with all channels and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = channels.map(channel => {
//       let channelData = salesStats.find(item => item._id === channel) || {};
//       let lmtValue = lmtDataMap[channel] || 0;
//       let ftdValue = ftdDataMap[channel] || 0;

//       let targetVol = targetVolumesByChannel[channel] || 0;
//       let mtdVol = channelData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;

//       totalMTDSales += mtdVol;

//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

//       return {
//         "Category Wise": channel,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": targetValuesByChannel[channel] || 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Category Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row


//         // Add dynamic column names as the first entry in the response
//         const columnNames = {
//           "Category Wise": "Category Wise",
//           "Target Vol": "Target Vol",
//           "Mtd Vol": "Mtd Vol",
//           "Lmtd Vol": "Lmtd Vol",
//           "Pending Vol": "Pending Vol",
//           "ADS": "ADS",
//           "Req. ADS": "Req. ADS",
//           "% Gwth Vol": "% Gwth Vol",
//           "Target SO": "Target SO",
//           "Activation MTD": "Activation MTD",
//           "Activation LMTD": "Activation LMTD",
//           "Pending Act": "Pending Act",
//           "ADS Activation": "ADS Activation",
//           "Req. ADS Activation": "Req. ADS Activation",
//           "% Gwth Val": "% Gwth Val",
//           "FTD": "FTD",
//           "Contribution %": "Contribution %"
//         };
    
//         // Add the column names at the start of the report
//         report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

// exports.getSalesDataSegmentWiseForEmployeeMTDW = async (req, res) => {
//   try {
//     let { code } = req;
//     let { start_date, end_date, data_format } = req.query;

//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required" });
//     }

//     // Convert employee code to uppercase
//     const employeeCodeUpper = code.toUpperCase();

//     // Fetch employee details based on the code
//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given code" });
//     }

//     const { Name: name, Position: position } = employee;

//     // Default segments, including smartphones and tablets
//     const segments = [
//       "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
//       "Tab >40K", "Tab <40K", "Wearable"
//     ];

//     const defaultRow = {
//       "Segment Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!name || !position) {
//       return res.status(400).send({ error: "Name and position parameters are required" });
//     }

//     if (!data_format) data_format = 'value';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by segment
//     const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, name, position);

//     // Query for MTD data
//     const salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise aggregation
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data (previous month's data)
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise LMTD aggregation
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise FTD aggregation
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Handle smartphone segments separately for >40K and <40K
//     let greaterThan40KSmartphones = salesStats
//       .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) > 40)
//       .reduce((acc, item) => {
//         acc["MTD VALUE"] += item["MTD VALUE"];
//         acc["TARGET VALUE"] += item["TARGET VALUE"];
//         return acc;
//       }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

//     let lessThan40KSmartphones = salesStats
//       .filter(item => item._id.includes("K") && parseFloat(item._id.split("-")[0]) <= 40)
//       .reduce((acc, item) => {
//         acc["MTD VALUE"] += item["MTD VALUE"];
//         acc["TARGET VALUE"] += item["TARGET VALUE"];
//         return acc;
//       }, { "MTD VALUE": 0, "TARGET VALUE": 0 });

//     // Build the report logic with all segments and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = segments.map(segment => {
//       let segmentData = salesStats.find(item => item._id === segment) || {};
//       let lmtValue = lmtDataMap[segment] || 0;
//       let ftdValue = ftdDataMap[segment] || 0;
    
//       // Safely access target values and volumes, defaulting to 0 if undefined
//       let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
//       let mtdVol = segmentData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;
    
//       totalMTDSales += mtdVol;
    
//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
//       return {
//         "Segment Wise": segment,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });
    

//     // // Add aggregated smartphone segments
//     // report.push({
//     //   "Segment Wise": "> 40 K (Smartphones)",
//     //   "Target Vol": greaterThan40KSmartphones["TARGET VALUE"],
//     //   "Mtd Vol": greaterThan40KSmartphones["MTD VALUE"],
//     //   "Lmtd Vol": 0, // Assuming no LMTD for now, can be calculated similarly
//     //   "Pending Vol": greaterThan40KSmartphones["TARGET VALUE"] - greaterThan40KSmartphones["MTD VALUE"],
//     //   // ... other fields
//     // });

//     // report.push({
//     //   "Segment Wise": "< 40 K (Smartphones)",
//     //   "Target Vol": lessThan40KSmartphones["TARGET VALUE"],
//     //   "Mtd Vol": lessThan40KSmartphones["MTD VALUE"],
//     //   "Lmtd Vol": 0, // Assuming no LMTD for now, can be calculated similarly
//     //   "Pending Vol": lessThan40KSmartphones["TARGET VALUE"] - lessThan40KSmartphones["MTD VALUE"],
//     //   // ... other fields
//     // });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Segment Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     // Add dynamic column names as the first entry in the response
//     const columnNames = {
//       "Segment Wise": "Segment Wise",
//       "Target Vol": "Target Vol",
//       "Mtd Vol": "Mtd Vol",
//       "Lmtd Vol": "Lmtd Vol",
//       "Pending Vol": "Pending Vol",
//       "ADS": "ADS",
//       "Req. ADS": "Req. ADS",
//       "% Gwth Vol": "% Gwth Vol",
//       "Target SO": "Target SO",
//       "Activation MTD": "Activation MTD",
//       "Activation LMTD": "Activation LMTD",
//       "Pending Act": "Pending Act",
//       "ADS Activation": "ADS Activation",
//       "Req. ADS Activation": "Req. ADS Activation",
//       "% Gwth Val": "% Gwth Val",
//       "FTD": "FTD",
//       "Contribution %": "Contribution %"
//     };

//     // Add the column names at the start of the report
//     report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };
// exports.getSalesDataChannelWiseByPositionCategoryMTDW = async (req, res) => {
//   try {
//     let { code } = req;
//     let { td_format, start_date, end_date, data_format, position_category } = req.query;

//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required" });
//     }

//     // Convert employee code to uppercase
//     const employeeCodeUpper = code.toUpperCase();

//     // Fetch employee details based on the code
//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given code" });
//     }

//     const { Name: name, Position: position } = employee;

//     // Call the getAllSubordinatesByCodeMTDW API
//     const subordinateRes = await axios.get(
//       `${BACKEND_URL}/sales-data-mtdw/get-all-subordinates-by-code-mtdw/${code}`
//     );
    
//     // Extract the list of subordinates for the provided position category
//     const subordinates = subordinateRes.data[position_category] || [];

//     // Log the subordinates array for the given position category
//     // console.log(`Subordinates for ${position_category}:`, subordinates);

//     // Default channels and columns
//     const channels = [
//       "DCM", "PC", "SCP", "SIS Plus", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
//     ];

//     const defaultRow = {
//       "Category Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!name || !position) {
//       return res.status(400).send({ error: "Name and position parameters are required" });
//     }

//     if (!td_format) td_format = 'MTD';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by channel
//     const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);

//     // Modify the query to match only the subordinates in salesDataMTDW
//     let salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Build the report logic with all channels and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = channels.map(channel => {
//       let channelData = salesStats.find(item => item._id === channel) || {};
//       let lmtValue = lmtDataMap[channel] || 0;
//       let ftdValue = ftdDataMap[channel] || 0;

//       let targetVol = targetVolumesByChannel[channel] || 0;
//       let mtdVol = channelData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;

//       totalMTDSales += mtdVol;

//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

//       return {
//         "Category Wise": channel,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": targetValuesByChannel[channel] || 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Category Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     // Add dynamic column names as the first entry in the response
//     const columnNames = {
//       "Category Wise": "Category Wise",
//       "Target Vol": "Target Vol",
//       "Mtd Vol": "Mtd Vol",
//       "Lmtd Vol": "Lmtd Vol",
//       "Pending Vol": "Pending Vol",
//       "ADS": "ADS",
//       "Req. ADS": "Req. ADS",
//       "% Gwth Vol": "% Gwth Vol",
//       "Target SO": "Target SO",
//       "Activation MTD": "Activation MTD",
//       "Activation LMTD": "Activation LMTD",
//       "Pending Act": "Pending Act",
//       "ADS Activation": "ADS Activation",
//       "Req. ADS Activation": "Req. ADS Activation",
//       "% Gwth Val": "% Gwth Val",
//       "FTD": "FTD",
//       "Contribution %": "Contribution %"
//     };
    
//     // Add the column names at the start of the report
//     report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };
// exports.getSalesDataSegmentWiseByPositionCategoryMTDW = async (req, res) => {
//   try {
//     let { code } = req;
//     let { start_date, end_date, data_format, position_category } = req.query;

//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required" });
//     }

//     // Convert employee code to uppercase
//     const employeeCodeUpper = code.toUpperCase();

//     // Fetch employee details based on the code
//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given code" });
//     }

//     const { Name: name, Position: position } = employee;

//     // Call the getAllSubordinatesByCodeMTDW API to get subordinates for the given position category
//     const subordinateRes = await axios.get(
//       `${BACKEND_URL}/sales-data-mtdw/get-all-subordinates-by-code-mtdw/${code}`
//     );
    
//     // Extract the list of subordinates for the provided position category
//     const subordinates = subordinateRes.data[position_category] || [];

//     // Log the subordinates array for the given position category
//     // console.log(`Subordinates for ${position_category}:`, subordinates);

//     // Default segments, including smartphones and tablets
//     const segments = [
//       "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
//       "Tab >40K", "Tab <40K", "Wearable"
//     ];

//     const defaultRow = {
//       "Segment Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!name || !position) {
//       return res.status(400).send({ error: "Name and position parameters are required" });
//     }

//     if (!data_format) data_format = 'value';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by segment
//     const { targetValuesBySegment, targetVolumesBySegment } = await fetchTargetValuesAndVolumes(endDate, name, position);

//     // Query for MTD data (segment-wise aggregation)
//     const salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise aggregation
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data (previous month's data)
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise LMTD aggregation
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data (today's data)
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           [position_category]: { $in: subordinates } // Match only the subordinates in the sales data
//         }
//       },
//       {
//         $group: {
//           _id: "$Segment New",  // Segment-wise FTD aggregation
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Build the report logic with all segments and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = segments.map(segment => {
//       let segmentData = salesStats.find(item => item._id === segment) || {};
//       let lmtValue = lmtDataMap[segment] || 0;
//       let ftdValue = ftdDataMap[segment] || 0;
    
//       // Safely access target values and volumes, defaulting to 0 if undefined
//       let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
//       let mtdVol = segmentData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;
    
//       totalMTDSales += mtdVol;
    
//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
//       return {
//         "Segment Wise": segment,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Segment Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Segment Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     // Add dynamic column names as the first entry in the response
//     const columnNames = {
//       "Segment Wise": "Segment Wise",
//       "Target Vol": "Target Vol",
//       "Mtd Vol": "Mtd Vol",
//       "Lmtd Vol": "Lmtd Vol",
//       "Pending Vol": "Pending Vol",
//       "ADS": "ADS",
//       "Req. ADS": "Req. ADS",
//       "% Gwth Vol": "% Gwth Vol",
//       "Target SO": "Target SO",
//       "Activation MTD": "Activation MTD",
//       "Activation LMTD": "Activation LMTD",
//       "Pending Act": "Pending Act",
//       "ADS Activation": "ADS Activation",
//       "Req. ADS Activation": "Req. ADS Activation",
//       "% Gwth Val": "% Gwth Val",
//       "FTD": "FTD",
//       "Contribution %": "Contribution %"
//     };

//     // Add the column names at the start of the report
//     report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

// exports.getSalesDataChannelWiseBySubordinateNameMTDW = async (req, res) => {
//   try {
//     let { subordinate_name } = req.params;
//     let { td_format, start_date, end_date, data_format } = req.query;

//     if (!subordinate_name) {
//       return res.status(400).send({ error: "Subordinate name is required" });
//     }

//     const subordinateName = subordinate_name.trim(); // Sanitize and trim the name if necessary

//     // Fetch employee details based on the name
//     const employee = await EmployeeCode.findOne({ Name: subordinateName });

//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given name" });
//     }

//     const { Name: name, Position: position } = employee;

//     // Default channels and columns
//     const channels = [
//       "DCM", "PC", "SCP", "SIS Plus", "SIS PRO", "STAR DCM", "SES", "SDP", "RRF EXT", "SES-LITE"
//     ];

//     const defaultRow = {
//       "Category Wise": "",
//       "Target Vol": 0,
//       "Mtd Vol": 0,
//       "Lmtd Vol": 0,
//       "Pending Vol": 0,
//       "ADS": 0,
//       "Req. ADS": 0,
//       "% Gwth Vol": 0,
//       "Target SO": 0,
//       "Activation MTD": 0,
//       "Activation LMTD": 0,
//       "Pending Act": 0,
//       "ADS Activation": 0,
//       "Req. ADS Activation": 0,
//       "% Gwth Val": 0,
//       "FTD": 0,
//       "Contribution %": 0
//     };

//     if (!name || !position) {
//       return res.status(400).send({ error: "Name and position parameters are required" });
//     }

//     if (!td_format) td_format = 'MTD';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parsedDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     const presentDayOfMonth = new Date().getDate();

//     // Fetch target values and volumes by channel
//     const { targetValuesByChannel, targetVolumesByChannel } = await fetchTargetValuesAndVolumesByChannel(endDate, name, position);

//     // Query for MTD data
//     let salesStatsQuery = [
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
//           parsedDate: { $gte: startDate, $lte: endDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "MTD VALUE": { $sum: { $toInt: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME" } },
//           "TARGET VALUE": { $sum: { $toInt: data_format === 'value' ? "$TARGET VALUE" : "$TARGET VOLUME" } }
//         }
//       }
//     ];

//     const salesStats = await SalesDataMTDW.aggregate(salesStatsQuery);

//     // Query for LMTD data
//     let previousMonthStartDate = new Date(startDate);
//     previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//     let previousMonthEndDate = new Date(endDate);
//     previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//     const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "LMTD VALUE": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Query for FTD data
//     const ftdData = await SalesDataMTDW.aggregate([
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
//           parsedDate: endDate,
//           "SALES TYPE": "Sell Out",
//           [position]: name
//         }
//       },
//       {
//         $group: {
//           _id: "$OLS TYPE",
//           "FTD": {
//             $sum: {
//               $convert: {
//                 input: data_format === 'value' ? "$MTD VALUE" : "$MTD VOLUME",
//                 to: "int",
//                 onError: 0,
//                 onNull: 0
//               }
//             }
//           }
//         }
//       }
//     ]);

//     // Build the report logic with all channels and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let totalMTDSales = 0;
//     let report = channels.map(channel => {
//       let channelData = salesStats.find(item => item._id === channel) || {};
//       let lmtValue = lmtDataMap[channel] || 0;
//       let ftdValue = ftdDataMap[channel] || 0;

//       let targetVol = targetVolumesByChannel[channel] || 0;
//       let mtdVol = channelData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;

//       totalMTDSales += mtdVol;

//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

//       return {
//         "Category Wise": channel,
//         "Target Vol": targetVol,
//         "Mtd Vol": mtdVol,
//         "Lmtd Vol": lmtdVol,
//         "Pending Vol": pendingVol,
//         "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Vol": growthVol.toFixed(2),
//         "Target SO": targetValuesByChannel[channel] || 0,
//         "Activation MTD": mtdVol,
//         "Activation LMTD": lmtdVol,
//         "Pending Act": pendingVol,
//         "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//         "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//         "% Gwth Val": growthVol.toFixed(2),
//         "FTD": ftdValue,
//         "Contribution %": contribution
//       };
//     });

//     // Grand total logic
//     let grandTotal = report.reduce(
//       (total, row) => {
//         Object.keys(row).forEach(key => {
//           if (key !== "Category Wise") total[key] += parseFloat(row[key]) || 0;
//         });
//         return total;
//       },
//       { ...defaultRow, "Category Wise": "Grand Total" }
//     );

//     grandTotal = {
//       ...grandTotal,
//       "ADS": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS": (grandTotal["Pending Vol"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Vol": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2)
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     // Add dynamic column names as the first entry in the response
//     const columnNames = {
//       "Category Wise": "Category Wise",
//       "Target Vol": "Target Vol",
//       "Mtd Vol": "Mtd Vol",
//       "Lmtd Vol": "Lmtd Vol",
//       "Pending Vol": "Pending Vol",
//       "ADS": "ADS",
//       "Req. ADS": "Req. ADS",
//       "% Gwth Vol": "% Gwth Vol",
//       "Target SO": "Target SO",
//       "Activation MTD": "Activation MTD",
//       "Activation LMTD": "Activation LMTD",
//       "Pending Act": "Pending Act",
//       "ADS Activation": "ADS Activation",
//       "Req. ADS Activation": "Req. ADS Activation",
//       "% Gwth Val": "% Gwth Val",
//       "FTD": "FTD",
//       "Contribution %": "Contribution %"
//     };

//     // Add the column names at the start of the report
//     report.unshift(columnNames);

//     res.status(200).send(report);
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };












