const SalesDataMTDW = require("../models/SalesDataMTDW");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");
const { formatNumberIndian, parseDate } = require("../helpers/salesHelpers");
const { fetchTargetValuesAndVolumesByChannel, fetchTargetValuesAndVolumes } = require("../helpers/reportHelpers");
const EmployeeCode = require("../models/EmployeeCode");
const Dealer = require("../models/Dealer");
const axios = require('axios');
const DealerListTseWise = require("../models/DealerListTseWise");
const { BACKEND_URL } = process.env;

exports.uploadSalesDataMTDW = async (req, res) => {
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

              const existingRecord = await SalesDataMTDW.findOne({ iuid });

              if (!existingRecord) {
                // Deep clone the data object to avoid modification issues
                const newData = JSON.parse(JSON.stringify(data)); 

                newData.iuid = iuid;

                const dateParts = newData.DATE.split("/");
                const month = dateParts[0];
                newData.month = month;

                // Ensure MTD VOLUME and MTD VALUE are valid numbers
                const mtdValue = parseFloat(newData['MTD VALUE']) || 0;
                const mtdVolume = parseFloat(newData['MTD VOLUME']) || 1;  // Avoid division by zero
                const price = mtdValue / mtdVolume;
                const segment = newData['Segment New'];
                // console.log("Sekajsdh: ", segment);
                // Categorize Tab based on price or keep Segment Final same as Segment New
                if (segment === "Tab") {
                  // console.log("newData['Segment New']")
                  newData['Segment Final'] = price > 40000 ? 'Tab>40k' : 'Tab<40k';
                } else {
                  newData['Segment Final'] = newData['Segment New'];  // For non-Tab, keep Segment New same
                }

                newEntries.push(newData);  // Push the deeply cloned data
              }
            }

            if (newEntries.length > 0) {
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

// DAAAAAAAAAAAAAAAAATE UTIILITIIIIESSSSSSSSSSSSSSSSSSSSSS

// Date utilities
const getUTCDate = (dateStr) => new Date(`${dateStr}T00:00:00Z`);
const getUTCStartOfMonth = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
const getUTCEndOfMonth = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999));
const getCurrentDateUTC = () => new Date(new Date().toISOString());

// Utility function to subtract a month and handle edge cases
const getPreviousMonthDates = (startDate, endDate) => {
  // Adjust start date to the previous month
  let previousMonthStartDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 1, startDate.getUTCDate()));
  
  // Adjust end date to the previous month
  let previousMonthEndDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, endDate.getUTCDate()));

  // Handle edge case: If the resulting date is invalid (e.g., Feb 30), adjust to the last valid date
  if (previousMonthStartDate.getUTCDate() !== startDate.getUTCDate()) {
      previousMonthStartDate.setUTCDate(0); // Set to last day of the previous month
  }
  if (previousMonthEndDate.getUTCDate() !== endDate.getUTCDate()) {
      previousMonthEndDate.setUTCDate(0); // Set to last day of the previous month
  }

  return { previousMonthStartDate, previousMonthEndDate };
};

// DAAAAAAAAAAAAAAAAAAAAAAAAAATE UTIILITIIIIESSSSSSSSSSSSSSSSSSSSSS




exports.getSalesDashboardDataForEmployeeMTDW = async (req, res) => {
  try {
    let { code } = req;
    let { is_siddha_admin } = req;
    console.log("IS SIDDHA ADMIN: ", is_siddha_admin);
    let { td_format, start_date, end_date, data_format } = req.query;
    console.log("Start date, end date, td_format, data_format: ", start_date, end_date, td_format, data_format);

    // Validate that employee code is provided
    if (!code) {
      return res.status(400).send({ error: "Employee code is required." });
    }
    console.log("COde: ", code);

    // Convert employee code to uppercase
    const employeeCodeUpper = code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });
    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code." });
    }

    const { Name: name, Position: position } = employee;
    console.log("Name and Pos: ", name, position);

    if (!td_format) td_format = 'MTD';
    if (!data_format) data_format = "value";


    // Parse and handle start_date and end_date
    const startDate = start_date ? getUTCDate(start_date) : getUTCStartOfMonth(new Date());
    const endDate = end_date ? getUTCDate(end_date) : getCurrentDateUTC();

    console.log('Start Date (UTC):', startDate.toISOString());
    console.log('End Date (UTC):', endDate.toISOString());
    console.log("endDate: ", endDate);


    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1; // Month is zero-based
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1; // Month is zero-based
    const presentDayOfMonth = endDate.getDate();


    const currentMonthStartDate = getUTCStartOfMonth(new Date(endDate));
    const endDateForThisMonth = getUTCEndOfMonth(new Date(endDate));
    const dateNow = getCurrentDateUTC();
    console.log("Daate Now: ", dateNow);
    console.log("currentMonthStartDate: ", currentMonthStartDate);
    console.log("endDateForThisMonth: ", endDateForThisMonth);
 
    let matchStage = {
      parsedDate: {
        $gte: currentMonthStartDate,
        $lte: endDateForThisMonth
      }
    };

    if(!is_siddha_admin){
      matchStage[position] = name;
    }

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
                // timezone: "UTC"
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

      const { previousMonthStartDate, previousMonthEndDate } = getPreviousMonthDates(startDate, endDate);


      console.log("previousMonthStartDate: ", previousMonthStartDate);
      console.log("previousMonthEndDate: ", previousMonthEndDate);

      const matchStageForLastMonth = {
        parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
      }

      if (!is_siddha_admin){
        matchStageForLastMonth[position] = name;
      }

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
          $match : matchStageForLastMonth
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
            [position]: name  //VARUN
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
            [position]: name //VARUN
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

exports.getSalesDashboardDataByEmployeeCodeMTDW = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format, code } = req.query;

    // Validate that employee code is provided
    if (!code) {
      return res.status(400).send({ error: "Employee code is required." });
    }
    console.log("COde: ", code);

    // Convert employee code to uppercase
    const employeeCodeUpper = code.toUpperCase();

    // Fetch employee details based on the code
    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });
    if (!employee) {
      return res.status(404).send({ error: "Employee not found with the given code." });
    }

    const { Name: name, Position: position } = employee;
    console.log("Name and Pos: ", name, position);

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

exports.getSalesDashboardDataByEmployeeNameMTDW = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format, name, position_category } = req.query;

    // Validate that employee code is provided
    if (!name || !position_category) {
      return res.status(400).send({ error: "Name and position category is required." });
    }

    if (!td_format) td_format = 'MTD';
    if (!data_format) data_format = "value";

    // Parse start_date and end_date from request query in YYYY-MM-DD format
    const startDate = start_date ? getUTCDate(start_date) : getUTCStartOfMonth(new Date());
    const endDate = end_date ? getUTCDate(end_date) : getCurrentDateUTC();


    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1; // Month is zero-based
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1; // Month is zero-based
    const presentDayOfMonth = endDate.getDate();

    const currentMonthStartDate = getUTCStartOfMonth(new Date(endDate));
    const endDateForThisMonth = getUTCEndOfMonth(new Date(endDate));

    let matchStage = {
      parsedDate: {
        $gte: currentMonthStartDate,
        $lte: endDateForThisMonth
      },
      [position_category]: name
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

      const { previousMonthStartDate, previousMonthEndDate } = getPreviousMonthDates(startDate, endDate);

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
            [position_category]: name
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
            [position_category]: name
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
            [position_category]: name
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
//       "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"   
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

//     // Send column names as an array
//     const columnNames = [
//       "Category Wise",
//       "Target Vol",
//       "Mtd Vol",
//       "Lmtd Vol",
//       "Pending Vol",
//       "ADS",
//       "Req. ADS",
//       "% Gwth Vol",
//       "Target SO",
//       "Activation MTD",
//       "Activation LMTD",
//       "Pending Act",
//       "ADS Activation",
//       "Req. ADS Activation",
//       "% Gwth Val",
//       "FTD",
//       "Contribution %"
//     ];

//     // Add the column names array to the response
//     res.status(200).send({ columnNames, data: report });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

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
      "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"   
    ];

    let defaultRow = [];

    if (data_format == 'volume') {
      defaultRow = {
        "Category Wise": "",
        "Target Vol": 0,
        "Mtd Vol": 0,
        "Lmtd Vol": 0,
        "Pending Vol": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    } else {
      defaultRow = {
        "Category Wise": "",
        "Target Val": 0,
        "Mtd Val": 0,
        "Lmtd Val": 0,
        "Pending Val": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    }


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

    startDate = parsedDate(startDate.toLocaleDateString('en-US'));
    endDate = parsedDate(endDate.toLocaleDateString('en-US'));

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

    // First, calculate the total MTD sales across all channels
    let totalMTDSales = salesStats.reduce((total, channelData) => {
      return total + (channelData['MTD VALUE'] || 0);
    }, 0);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      console.log("MTD vol, Total ", mtdVol, totalMTDSales);
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      if (data_format == 'volume'){
        return {
          "Category Wise": channel,
          "Target Vol": targetVol,
          "Mtd Vol": mtdVol,
          "Lmtd Vol": lmtdVol,
          "Pending Vol": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": targetValuesByChannel[channel] || 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": growthVol.toFixed(2),
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      } else {
        return {
          "Category Wise": channel,
          "Target Val": targetVol,
          "Mtd Val": mtdVol,
          "Lmtd Val": lmtdVol,
          "Pending Val": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": targetValuesByChannel[channel] || 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": growthVol.toFixed(2),
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      }

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
      "ADS Activation": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "Contribution %": "100.00 %"  // Grand total will always have 100% contribution
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    let columnNames = [];

    if (data_format == 'volume'){
    columnNames = [
      "Category Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "Target SO",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth",
      "FTD",
      "Contribution %"
    ];
    } else {
    columnNames = [
      "Category Wise",
      "Target Val",
      "Mtd Val",
      "Lmtd Val",
      "Pending Val",
      "ADS",
      "Req. ADS",
      "Target SO",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth",
      "FTD",
      "Contribution %"
    ];
    }


    // Add the column names array to the response
    res.status(200).send({ columnNames, data: report });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};

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
//       "Tab>40k", "Tab<40k", "Wearable"
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
//           _id: "$Segment Final",  // Segment-wise aggregation
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
//           _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
//           _id: "$Segment Final",  // Segment-wise FTD aggregation
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

//     // Column names as array
//     const columnNames = [
//       "Segment Wise",
//       "Target Vol",
//       "Mtd Vol",
//       "Lmtd Vol",
//       "Pending Vol",
//       "ADS",
//       "Req. ADS",
//       "% Gwth Vol",
//       "Target SO",
//       "Activation MTD",
//       "Activation LMTD",
//       "Pending Act",
//       "ADS Activation",
//       "Req. ADS Activation",
//       "% Gwth Val",
//       "FTD",
//       "Contribution %"
//     ];

//     res.status(200).json({ columns: columnNames, data: report });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

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
      "Tab>40k", "Tab<40k", "Wearable"
    ];


    let defaultRow = []

    if (data_format == "volume"){
      defaultRow = {
        "Segment Wise": "",
        "Target Vol": 0,
        "Mtd Vol": 0,
        "Lmtd Vol": 0,
        "Pending Vol": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    } else {
      defaultRow = {
        "Segment Wise": "",
        "Target Val": 0,
        "Mtd Val": 0,
        "Lmtd Val": 0,
        "Pending Val": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    }


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

    console.log("Start date, end date: ", startDate, endDate);

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
          _id: "$Segment Final",  // Segment-wise aggregation
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
          _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
          _id: "$Segment Final",  // Segment-wise FTD aggregation
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

    let totalMTDSales = salesStats.reduce((total, segmentData) => {
      return total + (segmentData['MTD VALUE'] || 0); // sum up all the MTD values
    }, 0);

    // Build the report logic with all segments and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let report = segments.map(segment => {
      let segmentData = salesStats.find(item => item._id === segment) || {};
      let lmtValue = lmtDataMap[segment] || 0;
      let ftdValue = ftdDataMap[segment] || 0;

      // Safely access target values and volumes, defaulting to 0 if undefined
      let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
      let mtdVol = segmentData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;

      // totalMTDSales += mtdVol;

      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      console.log("MTD vol, Total ", mtdVol, totalMTDSales);
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;



      if (data_format == 'volume') {
        return {
          "Segment Wise": segment,
          "Target Vol": targetVol,
          "Mtd Vol": mtdVol,
          "Lmtd Vol": lmtdVol,
          "Pending Vol": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": (growthVol.toFixed(2)).toString() + ' %',
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      } else {
        return {
          "Segment Wise": segment,
          "Target Val": targetVol,
          "Mtd Val": mtdVol,
          "Lmtd Val": lmtdVol,
          "Pending Val": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": (growthVol.toFixed(2)).toString() + ' %',
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      }
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
      "ADS Activation": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth": (((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2)).toString() + ' %',
      "Contribution %": "100.00 %"  // Grand total will always have 100% contribution
    };
    console.log("Grand total: ", grandTotal);

    report.unshift(grandTotal); // Insert the grand total as the first row

    let columnNames = [];
    
    if (data_format == 'volume') {
      columnNames = [
        "Segment Wise",
        "Target Vol",
        "Mtd Vol",
        "Lmtd Vol",
        "Pending Vol",
        "ADS",
        "Req. ADS",
        "Target SO",
        "Pending Act",
        "ADS Activation",
        "Req. ADS Activation",
        "% Gwth",
        "FTD",
        "Contribution %"
      ];
    } else {
      columnNames = [
        "Segment Wise",
        "Target Val",
        "Mtd Val",
        "Lmtd Val",
        "Pending Val",
        "ADS",
        "Req. ADS",
        "Target SO",
        "Pending Act",
        "ADS Activation",
        "Req. ADS Activation",
        "% Gwth",
        "FTD",
        "Contribution %"
      ];
    }

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
      "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"   
    ];

    let defaultRow = [];

    if (data_format == 'volume') {
      defaultRow = {
        "Category Wise": "",
        "Target Vol": 0,
        "Mtd Vol": 0,
        "Lmtd Vol": 0,
        "Pending Vol": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    } else {
      defaultRow = {
        "Category Wise": "",
        "Target Val": 0,
        "Mtd Val": 0,
        "Lmtd Val": 0,
        "Pending Val": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    }

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

    // First, calculate the total MTD sales across all channels
    let totalMTDSales = salesStats.reduce((total, channelData) => {
      return total + (channelData['MTD VALUE'] || 0);
    }, 0);
    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });


    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;


      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      if (data_format == 'volume'){
        return {
          "Category Wise": channel,
          "Target Vol": targetVol,
          "Mtd Vol": mtdVol,
          "Lmtd Vol": lmtdVol,
          "Pending Vol": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": targetValuesByChannel[channel] || 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": growthVol.toFixed(2),
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      } else {
        return {
          "Category Wise": channel,
          "Target Val": targetVol,
          "Mtd Val": mtdVol,
          "Lmtd Val": lmtdVol,
          "Pending Val": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": targetValuesByChannel[channel] || 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": growthVol.toFixed(2),
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      }
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
      "ADS Activation": (grandTotal["Activation MTD"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth": ((grandTotal["Activation MTD"] - grandTotal["Activation LMTD"]) / grandTotal["Activation LMTD"] * 100).toFixed(2),
      "Contribution %": '100 %'
    };

    report.unshift(grandTotal); // Insert the grand total as the first row


    let columnNames = [];

    if (data_format == 'volume'){
    columnNames = [
      "Category Wise",
      "Target Vol",
      "Mtd Vol",
      "Lmtd Vol",
      "Pending Vol",
      "ADS",
      "Req. ADS",
      "Target SO",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth",
      "FTD",
      "Contribution %"
    ];
    } else {
    columnNames = [
      "Category Wise",
      "Target Val",
      "Mtd Val",
      "Lmtd Val",
      "Pending Val",
      "ADS",
      "Req. ADS",
      "Target SO",
      "Pending Act",
      "ADS Activation",
      "Req. ADS Activation",
      "% Gwth",
      "FTD",
      "Contribution %"
    ];
    }
    

    res.status(200).send({columnNames, data: report});
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
      "Tab>40k", "Tab<40k", "Wearable"
    ];

    let defaultRow = []

    if (data_format == "volume"){
      defaultRow = {
        "Segment Wise": "",
        "Target Vol": 0,
        "Mtd Vol": 0,
        "Lmtd Vol": 0,
        "Pending Vol": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    } else {
      defaultRow = {
        "Segment Wise": "",
        "Target Val": 0,
        "Mtd Val": 0,
        "Lmtd Val": 0,
        "Pending Val": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    }

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
          _id: "$Segment Final",  // Segment-wise aggregation
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
          _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
          _id: "$Segment Final",  // Segment-wise FTD aggregation
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

      let totalMTDSales = salesStats.reduce((total, segmentData) => {
        return total + (segmentData['MTD VALUE'] || 0); // sum up all the MTD values
      }, 0);
  
    // Build the report logic with all segments and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    
    let report = segments.map(segment => {
      let segmentData = salesStats.find(item => item._id === segment) || {};
      let lmtValue = lmtDataMap[segment] || 0;
      let ftdValue = ftdDataMap[segment] || 0;
    
      // Safely access target values and volumes, defaulting to 0 if undefined
      let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
      let mtdVol = segmentData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;
    
      
    
      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;
    
      if (data_format == 'volume') {
        return {
          "Segment Wise": segment,
          "Target Vol": targetVol,
          "Mtd Vol": mtdVol,
          "Lmtd Vol": lmtdVol,
          "Pending Vol": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": (growthVol.toFixed(2)).toString() + ' %',
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      } else {
        return {
          "Segment Wise": segment,
          "Target Val": targetVol,
          "Mtd Val": mtdVol,
          "Lmtd Val": lmtdVol,
          "Pending Val": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": (growthVol.toFixed(2)).toString() + ' %',
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + ' %'
        };
      }
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
      "ADS Activation": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "Contribution %": "100.00 %" 
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    // Add dynamic column names as the first entry in the response

    let columnNames = [];

    if (data_format == 'volume') {
      columnNames = [
        "Segment Wise",
        "Target Vol",
        "Mtd Vol",
        "Lmtd Vol",
        "Pending Vol",
        "ADS",
        "Req. ADS",
        "Target SO",
        "Pending Act",
        "ADS Activation",
        "Req. ADS Activation",
        "% Gwth",
        "FTD",
        "Contribution %"
      ];
    } else {
      columnNames = [
        "Segment Wise",
        "Target Val",
        "Mtd Val",
        "Lmtd Val",
        "Pending Val",
        "ADS",
        "Req. ADS",
        "Target SO",
        "Pending Act",
        "ADS Activation",
        "Req. ADS Activation",
        "% Gwth",
        "FTD",
        "Contribution %"
      ];
    }

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
      "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"   
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
      "Tab>40k", "Tab<40k", "Wearable"
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
          _id: "$Segment Final",  // Segment-wise aggregation
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
          _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
          _id: "$Segment Final",  // Segment-wise FTD aggregation
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
      "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"   
    ];
    let defaultRow = {}

    if (data_format == 'volume') {
      defaultRow = {
        "Category Wise": "",
        "Target Vol": 0,
        "Mtd Vol": 0,
        "Lmtd Vol": 0,
        "Pending Vol": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    } else {
      defaultRow = {
        "Category Wise": "",
        "Target Val": 0,
        "Mtd Val": 0,
        "Lmtd Val": 0,
        "Pending Val": 0,
        "ADS": 0,
        "Req. ADS": 0,
        "Target SO": 0,
        "Pending Act": 0,
        "ADS Activation": 0,
        "Req. ADS Activation": 0,
        "% Gwth": 0,
        "FTD": 0,
        "Contribution %": 0
      };
    }


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

    // First, calculate the total MTD sales across all channels
    let totalMTDSales = salesStats.reduce((total, channelData) => {
      return total + (channelData['MTD VALUE'] || 0);
    }, 0);

    // Build the report logic with all channels and include LMTD and FTD
    let lmtDataMap = {};
    let ftdDataMap = {};
    lastMonthSalesStats.forEach(item => {
      lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
    });
    ftdData.forEach(item => {
      ftdDataMap[item._id] = item['FTD'] || 0;
    });

    let report = channels.map(channel => {
      let channelData = salesStats.find(item => item._id === channel) || {};
      let lmtValue = lmtDataMap[channel] || 0;
      let ftdValue = ftdDataMap[channel] || 0;

      let targetVol = targetVolumesByChannel[channel] || 0;
      let mtdVol = channelData['MTD VALUE'] || 0;
      let lmtdVol = lmtValue;


      let pendingVol = targetVol - mtdVol;
      let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
      let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;

      if (data_format == 'volume') {
        return {
          "Category Wise": channel,
          "Target Vol": targetVol,
          "Mtd Vol": mtdVol,
          "Lmtd Vol": lmtdVol,
          "Pending Vol": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": targetValuesByChannel[channel] || 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": growthVol.toFixed(2),
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + " %"
        };
      } else {
        return {
          "Category Wise": channel,
          "Target Val": targetVol,
          "Mtd Val": mtdVol,
          "Lmtd Val": lmtdVol,
          "Pending Val": pendingVol,
          "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "Target SO": targetValuesByChannel[channel] || 0,
          "Pending Act": pendingVol,
          "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
          "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
          "% Gwth": growthVol.toFixed(2),
          "FTD": ftdValue,
          "Contribution %": contribution.toString() + " %"
        };
      }


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
      "ADS Activation": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
      "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
      "% Gwth": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
      "Contribution %" : "100 %"
    };

    report.unshift(grandTotal); // Insert the grand total as the first row

    let columnNames = [];

    if (data_format == 'volume') {
      columnNames = [
        "Category Wise",
        "Target Vol",
        "Mtd Vol",
        "Lmtd Vol",
        "Pending Vol",
        "ADS",
        "Req. ADS",
        "Target SO",
        "Pending Act",
        "ADS Activation",
        "Req. ADS Activation",
        "% Gwth",
        "FTD",
        "Contribution %"
      ];
    } else {
      columnNames = [
        "Category Wise",
        "Target Val",
        "Mtd Val",
        "Lmtd Val",
        "Pending Val",
        "ADS",
        "Req. ADS",
        "Target SO",
        "Pending Act",
        "ADS Activation",
        "Req. ADS Activation",
        "% Gwth",
        "FTD",
        "Contribution %"
      ];
    }



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
      "Tab>40k", "Tab<40k", "Wearable"
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
          _id: "$Segment Final",  // Segment-wise aggregation
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
          _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
          _id: "$Segment Final",  // Segment-wise FTD aggregation
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


// For Dealer

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

exports.getSalesDashboardDataByDealerCodeMTDW = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format, dealerCode } = req.query;

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
      "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"   
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
      "Tab>40k", "Tab<40k", "Wearable"
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
          _id: "$Segment Final",  // Segment-wise aggregation
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
          _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
          _id: "$Segment Final",  // Segment-wise FTD aggregation
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

exports.getSalesDataChannelWiseForEmployeeByDealerCodeMTDW = async (req, res) => {
  try {
    let { td_format, start_date, end_date, data_format, dealerCode } = req.query;

    if (!dealerCode) {
      return res.status(400).send({ error: "Dealer code is required" });
    }

    // Convert dealer code to uppercase
    const dealerCodeUpper = dealerCode.toUpperCase();

    // Default channels and columns
    const channels = [
      "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"   
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

exports.getSalesDataSegmentWiseForEmployeeByDealerCodeMTDW = async (req, res) => {
  try {
    let { start_date, end_date, data_format, dealerCode } = req.query;

    if (!dealerCode) {
      return res.status(400).send({ error: "Dealer code is required" });
    }

    // Convert dealer code to uppercase
    const dealerCodeUpper = dealerCode.toUpperCase();

    // Default segments, including smartphones and tablets
    const segments = [
      "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
      "Tab>40k", "Tab<40k", "Wearable"
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
          _id: "$Segment Final",  // Segment-wise aggregation
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
          _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
          _id: "$Segment Final",  // Segment-wise FTD aggregation
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


// Dealer wise 
exports.getSalesDataChannelWiseByDealerCategoryMTDW = async (req, res) => {
  try {
    let { code } = req;
    let { td_format, start_date, end_date, data_format, position_category, dealer_category } = req.query;

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

    let buyerCodes = [];
    try {
      // Call the getAllSubordinatesByCodeMTDW API
      const subordinateRes = await axios.get(
        `${BACKEND_URL}/sales-data-mtdw/get-dealer-list-for-employees-by-code`, {
          params: {
            dealer_category: dealer_category,
            code: code,
            start_date: start_date,
            end_date: end_date
          }
        }
      );

      // Extract the list of BUYER CODEs from the response
      buyerCodes = subordinateRes.data.map(dealer => dealer["BUYER CODE"]);

      if (!buyerCodes.length) {
        return res.status(404).send({ message: "No dealers found with the specified criteria." });
      }
    } catch (err) {
      console.error("Error fetching dealer list:", err.message || err);
      return res.status(500).send({ error: "Failed to fetch dealer list. Please try again later." });
    }

    // Default channels and columns
    const channels = [
      "DCM", "PC", "PC EXT", "RRF EXT", "SCP", "SCP EXT", "SDP", "SES", "SES-LITE", "SIS PLUS", "SIS PLUS EXT", "SIS PRO", "SIS PRO EXT", "STAR DCM"
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

    // Modify the query to match only the dealers in salesDataMTDW
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
          "BUYER CODE": { $in: buyerCodes } // Match only the dealers in the sales data
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
          "BUYER CODE": { $in: buyerCodes } // Match only the dealers in the sales data
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
          "BUYER CODE": { $in: buyerCodes } // Match only the dealers in the sales data
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
    console.error("Error processing request:", error.message || error);
    return res.status(500).send({ error: "Internal Server Error" });
  }
};


// Utilities 
exports.getAllSubordinatesMTDW = async (req, res) => {
  try {
    let { code, is_siddha_admin } = req;

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
      OWN: ["ZSM", "ABM", "RSO", "ASE", "ASM", "TSE"],
      BM: ["ZSM", "ABM", "RSO", "ASE", "ASM", "TSE"],
      MIS: ["ZSM", "ABM", "RSO", "ASE", "ASM", "TSE"],
      FIN: ["ZSM", "ABM", "RSO", "ASE", "ASM", "TSE"],
      ZSM: ["ABM", "RSO", "ASE", "ASM", "TSE"],
      ABM: ["RSO", "ASE", "ASM", "TSE"],
      RSO: ["ASE", "ASM", "TSE"],
      ASE: ["ASM", "TSE"],
      ASM: ["TSE"],
    };

    if (!positionsHierarchy[position]) {
      return res.status(400).json({ error: "Invalid position." });
    }

    

    const subordinatesPipeline = is_siddha_admin ?  
    [
      // Match all records
      {
        $match: {},
      },
      {
        $group: positionsHierarchy["OWN"].reduce((group, pos) => {
          group[pos] = {
            $addToSet: {
              $cond: [
                {
                  $or: [{ $eq: [`$${pos}`, ""] }, { $eq: [`$${pos}`, "0"] }]
                },
                null,
                `$${pos}`,
              ],
            },
          };
          return group;
        }, {_id: null}
      ),
      },

      //Formatting the result
      {
        $project: {
          _id: 0,
          subordinates: positionsHierarchy["OWN"].reduce((acc, pos) => {
            acc[pos] = {
              $concatArrays: [
                [{ $literal: "ALL" }], //Add "All" at the start of the array
                {
                  $filter: {
                    input: `$${pos}`,
                    as: "name",
                    cond: {
                      $and: [
                        { $ne: ["$$name", null] },
                        { $ne: ["$$name", ""] },
                        { $ne: ["$$name", "0"]},
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
    ]
    : 
    [
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

exports.getDealerListForEmployee = async (req, res) => {
  try {
    console.log("Reaching dealer list for employee")
    let { code } = req; 
    let { name } = req;
    let { start_date, end_date, data_format, dealer_category } = req.query;

    console.log("Name: ", name);
    if (!code) {
      return res.status(400).send({ error: "Employee code is required!" });
    }

    const employeeCodeUpper = code.toUpperCase();
    console.log("CODE: ", employeeCodeUpper);

    const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

    if (!employee) {
      return res.status(400).send({ error: "Employee not found with this code!!" });
    }

    const { Position: position } = employee;
    console.log("Name and Position: ", name, position);

    if (!data_format) data_format = 'value';

    // Still receiving the dates from the user, but we won't use them in the query
    let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDate = end_date ? new Date(end_date) : new Date();

    const parseDate = (dateString) => {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    };

    startDate = parseDate(startDate.toLocaleDateString('en-US'));
    endDate = parseDate(endDate.toLocaleDateString('en-US'));

    // Fetch dealer codes based on TSE name from DealerListTseWise model
    const dealerListTseWiseQuery = {
      [position]: name  // Match TSE field to the provided employee name
    };

    const dealerListTseWise = await DealerListTseWise.find(dealerListTseWiseQuery, { "Dealer Code": 1, "DEALER NAME": 1 });

    if (!dealerListTseWise.length) {
      return res.status(404).send({ message: "No matching dealers found!" });
    }

    // Extract the dealer codes from the result
    const dealerCodes = dealerListTseWise.map(dealer => dealer["Dealer Code"]);

    // Query for matching dealers in the SalesDataMTDW model
    const dealerListQuery = [
      {
        $match: {
          "SALES TYPE": "Sell Out",
          "BUYER CODE": { $in: dealerCodes }  // Match dealer codes from the TSE wise dealer list
        }
      },
      {
        $group: {
          _id: "$BUYER CODE",  // Group by BUYER CODE to ensure uniqueness
          BUYER: { $first: "$BUYER" },  // Take the first BUYER name for each BUYER CODE
        }
      },
      {
        $project: {
          _id: 0,  // Hide the MongoDB ID
          "BUYER CODE": "$_id",  // Rename _id back to BUYER CODE
          "BUYER": 1  // Include BUYER name in the result
        }
      }
    ];

    const dealersInSalesData = await SalesDataMTDW.aggregate(dealerListQuery);

    // Map the dealers from SalesDataMTDW into a dictionary for quick lookup
    const salesDataMap = dealersInSalesData.reduce((map, dealer) => {
      map[dealer["BUYER CODE"]] = dealer;
      return map;
    }, {});

    // Merge the data from SalesDataMTDW with DealerListTseWise to include all dealers
    const completeDealerList = dealerListTseWise.map(dealer => {
      const dealerCode = dealer["Dealer Code"];
      // If the dealer code is found in SalesDataMTDW, use that information, otherwise fallback to DealerListTseWise
      if (salesDataMap[dealerCode]) {
        return {
          "BUYER CODE": dealerCode,
          BUYER: salesDataMap[dealerCode].BUYER  // Use BUYER from SalesDataMTDW
        };
      } else {
        return {
          "BUYER CODE": dealerCode,
          BUYER: dealer["DEALER NAME"]  // Use DEALER NAME from DealerListTseWise if not found in SalesDataMTDW
        };
      }
    });

    // If dealer_category is "ALL" or not provided, return all dealers
    if (!dealer_category || dealer_category === "ALL") {
      return res.status(200).send(completeDealerList);
    }

    // If dealer_category is "NPO" or "KRO", filter dealers based on the category
    const filteredDealerCodes = dealerListTseWise
      .filter(dealer => dealer.dealerCategory === dealer_category)
      .map(d => d["Dealer Code"]);

    // Update the completeDealerList array to only include those in the selected category
    const filteredResult = completeDealerList.filter(dealer => filteredDealerCodes.includes(dealer['BUYER CODE']));

    if (!filteredResult.length) {
      return res.status(404).send({ message: `No dealers found in the ${dealer_category} category.` });
    }

    // Return the filtered result with the updated BUYER names
    return res.status(200).send(filteredResult);

  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};




// exports.getDealerListForEmployee = async (req, res) => {
//   try {
//     let { code } = req; 
//     let { start_date, end_date, data_format, dealer_category } = req.query;

//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required!"});
//     }

//     const employeeCodeUpper = code.toUpperCase();
//     console.log("CODE: ", employeeCodeUpper);

//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

//     if (!employee) {
//       return res.status(400).send({ error: "Employee not found with this code!!" });
//     }

//     const { Name: name, Position: position } = employee;
//     console.log("Name and Position: ", name, position);

//     if (!data_format) data_format = 'value';

//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     // Query for dealers list
//     const dealerListQuery = [
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
//           [position]: name  // Dynamically match the position field to the employee's name
//         }
//       },
//       {
//         $group: {
//           _id: "$BUYER CODE",  // Group by BUYER CODE to ensure uniqueness
//           BUYER: { $first: "$BUYER" },  // Take the first BUYER name for each BUYER CODE
//         }
//       },
//       {
//         $project: {
//           _id: 0,  // Hide the MongoDB ID
//           "BUYER CODE": "$_id",  // Rename _id back to BUYER CODE
//           "BUYER": 1  // Include BUYER name in the result
//         }
//       }
//     ];

//     const dealers = await SalesDataMTDW.aggregate(dealerListQuery);

//     if (!dealers.length) {
//       return res.status(404).send({ message: "No matching dealers found!" });
//     }

//     // If dealer_category is "ALL" or not provided, return all dealers
//     if (!dealer_category || dealer_category === "ALL") {
//       return res.status(200).send(dealers);
//     }

//     // If dealer_category is "NPO" or "KRO", filter dealers based on the category
//     const dealerCodes = dealers.map(d => d['BUYER CODE']);

//     // Fetch dealer information from the Dealer model based on the provided dealer codes
//     const filteredDealers = await Dealer.find({
//       dealerCode: { $in: dealerCodes },
//       dealerCategory: dealer_category  // Match the dealer category
//     });

//     // Filter dealers that are in the selected category
//     const filteredDealerCodes = filteredDealers.map(d => d.dealerCode);

//     // Update the dealers array to only include those in the selected category
//     const filteredResult = dealers.filter(dealer => filteredDealerCodes.includes(dealer['BUYER CODE']));

//     if (!filteredResult.length) {
//       return res.status(404).send({ message: `No dealers found in the ${dealer_category} category.` });
//     }

//     // Return the filtered result
//     return res.status(200).send(filteredResult);

//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

// exports.getDealerListForEmployee = async (req, res) => {
//   try {
//     let { code } = req; 
//     let { name } = req;
//     let { start_date, end_date, data_format, dealer_category } = req.query;

//     console.log("Name: ", name);
//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required!" });
//     }

//     const employeeCodeUpper = code.toUpperCase();
//     console.log("CODE: ", employeeCodeUpper);

//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

//     if (!employee) {
//       return res.status(400).send({ error: "Employee not found with this code!!" });
//     }

//     const { Position: position } = employee;
//     console.log("Name and Position: ", name, position);

//     if (!data_format) data_format = 'value';

//     // Still receiving the dates from the user, but we won't use them in the query
//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     // Fetch dealer codes based on TSE name from DealerListTseWise model
//     const dealerListTseWiseQuery = {
//       TSE: name  // Match TSE field to the provided employee name
//     };

//     const dealerListTseWise = await DealerListTseWise.find(dealerListTseWiseQuery, { "Dealer Code": 1 });

//     if (!dealerListTseWise.length) {
//       return res.status(404).send({ message: "No matching dealers found!" });
//     }

//     // Extract the dealer codes from the result
//     const dealerCodes = dealerListTseWise.map(dealer => dealer["Dealer Code"]);

//     // Query for matching dealers in the SalesDataMTDW model
//     const dealerListQuery = [
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           "BUYER CODE": { $in: dealerCodes }  // Match dealer codes from the TSE wise dealer list
//         }
//       },
//       {
//         $group: {
//           _id: "$BUYER CODE",  // Group by BUYER CODE to ensure uniqueness
//           BUYER: { $first: "$BUYER" },  // Take the first BUYER name for each BUYER CODE
//         }
//       },
//       {
//         $project: {
//           _id: 0,  // Hide the MongoDB ID
//           "BUYER CODE": "$_id",  // Rename _id back to BUYER CODE
//           "BUYER": 1  // Include BUYER name in the result
//         }
//       }
//     ];

//     const dealers = await SalesDataMTDW.aggregate(dealerListQuery);

//     if (!dealers.length) {
//       return res.status(404).send({ message: "No matching dealers found!" });
//     }

//     // If dealer_category is "ALL" or not provided, return all dealers
//     if (!dealer_category || dealer_category === "ALL") {
//       return res.status(200).send(dealers);
//     }

//     // If dealer_category is "NPO" or "KRO", filter dealers based on the category
//     const filteredDealers = await Dealer.find({
//       dealerCode: { $in: dealerCodes },
//       dealerCategory: dealer_category  // Match the dealer category
//     });

//     // Filter dealers that are in the selected category
//     const filteredDealerCodes = filteredDealers.map(d => d.dealerCode);

//     // Update the dealers array to only include those in the selected category
//     const filteredResult = dealers.filter(dealer => filteredDealerCodes.includes(dealer['BUYER CODE']));

//     if (!filteredResult.length) {
//       return res.status(404).send({ message: `No dealers found in the ${dealer_category} category.` });
//     }

//     // Return the filtered result
//     return res.status(200).send(filteredResult);

//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

// exports.getDealerListForEmployee = async (req, res) => {
//   try {
//     let { code } = req; 
//     let { start_date, end_date, data_format, dealer_category } = req.query;

//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required!"});
//     }

//     const employeeCodeUpper = code.toUpperCase();
//     console.log("CODE: ", employeeCodeUpper);

//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });

//     if (!employee) {
//       return res.status(400).send({ error: "Employee not found with this code!!" });
//     }

//     const { Name: name, Position: position } = employee;
//     console.log("Name and Position: ", name, position);

//     if (!data_format) data_format = 'value';

//     // Still receiving the dates from the user, but we won't use them in the query
//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     const parseDate = (dateString) => {
//       const [month, day, year] = dateString.split('/');
//       return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
//     };

//     startDate = parseDate(startDate.toLocaleDateString('en-US'));
//     endDate = parseDate(endDate.toLocaleDateString('en-US'));

//     // Query for dealers list (removed date filtering)
//     const dealerListQuery = [
//       {
//         $match: {
//           "SALES TYPE": "Sell Out",
//           [position]: name  // Dynamically match the position field to the employee's name
//         }
//       },
//       {
//         $group: {
//           _id: "$BUYER CODE",  // Group by BUYER CODE to ensure uniqueness
//           BUYER: { $first: "$BUYER" },  // Take the first BUYER name for each BUYER CODE
//         }
//       },
//       {
//         $project: {
//           _id: 0,  // Hide the MongoDB ID
//           "BUYER CODE": "$_id",  // Rename _id back to BUYER CODE
//           "BUYER": 1  // Include BUYER name in the result
//         }
//       }
//     ];

//     const dealers = await SalesDataMTDW.aggregate(dealerListQuery);

//     if (!dealers.length) {
//       return res.status(404).send({ message: "No matching dealers found!" });
//     }

//     // If dealer_category is "ALL" or not provided, return all dealers
//     if (!dealer_category || dealer_category === "ALL") {
//       return res.status(200).send(dealers);
//     }

//     // If dealer_category is "NPO" or "KRO", filter dealers based on the category
//     const dealerCodes = dealers.map(d => d['BUYER CODE']);

//     // Fetch dealer information from the Dealer model based on the provided dealer codes
//     const filteredDealers = await Dealer.find({
//       dealerCode: { $in: dealerCodes },
//       dealerCategory: dealer_category  // Match the dealer category
//     });

//     // Filter dealers that are in the selected category
//     const filteredDealerCodes = filteredDealers.map(d => d.dealerCode);

//     // Update the dealers array to only include those in the selected category
//     const filteredResult = dealers.filter(dealer => filteredDealerCodes.includes(dealer['BUYER CODE']));

//     if (!filteredResult.length) {
//       return res.status(404).send({ message: `No dealers found in the ${dealer_category} category.` });
//     }

//     // Return the filtered result
//     return res.status(200).send(filteredResult);

//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };

exports.getDealerListForEmployeeByCode = async (req, res) => {
  try {
    let { start_date, end_date, data_format, dealer_category, code } = req.query;

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
    console.log("Name and Position: ", name, position);

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
        $group: {
          _id: "$BUYER CODE",  // Group by BUYER CODE to ensure uniqueness
          BUYER: { $first: "$BUYER" },  // Take the first BUYER name for each BUYER CODE
        }
      },
      {
        $project: {
          _id: 0,  // Hide the MongoDB ID
          "BUYER CODE": "$_id",  // Rename _id back to BUYER CODE
          "BUYER": 1  // Include BUYER name in the result
        }
      }
    ];

    const dealers = await SalesDataMTDW.aggregate(dealerListQuery);

    if (!dealers.length) {
      return res.status(404).send({ message: "No matching dealers found!" });
    }

    // If dealer_category is "ALL" or not provided, return all dealers
    if (!dealer_category || dealer_category === "ALL") {
      return res.status(200).send(dealers);
    }

    // If dealer_category is "NPO" or "KRO", filter dealers based on the category
    const dealerCodes = dealers.map(d => d['BUYER CODE']);

    // Fetch dealer information from the Dealer model based on the provided dealer codes
    const filteredDealers = await Dealer.find({
      dealerCode: { $in: dealerCodes },
      dealerCategory: dealer_category  // Match the dealer category
    });

    // Filter dealers that are in the selected category
    const filteredDealerCodes = filteredDealers.map(d => d.dealerCode);

    // Update the dealers array to only include those in the selected category
    const filteredResult = dealers.filter(dealer => filteredDealerCodes.includes(dealer['BUYER CODE']));

    if (!filteredResult.length) {
      return res.status(404).send({ message: `No dealers found in the ${dealer_category} category.` });
    }

    // Return the filtered result
    return res.status(200).send(filteredResult);

  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};


// exports.getSalesDataSegmentWiseBySubordinateCodeMTDW = async (req, res) => {
//   try {
//     let { subordinate_code } = req.params;
//     let { start_date, end_date, data_format } = req.query;

//     if (!subordinate_code) {
//       return res.status(400).send({ error: "Subordinate code is required" });
//     }

//     // Convert employee code to uppercase
//     const subordinateCodeUpper = subordinate_code.toUpperCase();

//     // Fetch employee details based on the code
//     const employee = await EmployeeCode.findOne({ Code: subordinateCodeUpper });

//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given code" });
//     }

//     const { Name: name, Position: position } = employee;

//     // Default segments, including smartphones and tablets
//     const segments = [
//       "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K", 
//       "Tab>40k", "Tab<40k", "Wearable"
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
//           _id: "$Segment Final",  // Segment-wise aggregation
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
//           _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
//           _id: "$Segment Final",  // Segment-wise FTD aggregation
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
//       "Tab>40k", "Tab<40k", "Wearable"
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

//     console.log("Start date, end date: ", startDate, endDate);

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
//           _id: "$Segment Final",  // Segment-wise aggregation
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
//           _id: "$Segment Final",  // Segment-wise LMTD aggregation
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
//           _id: "$Segment Final",  // Segment-wise FTD aggregation
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

//     let totalMTDSales = salesStats.reduce((total, segmentData) => {
//       return total + (segmentData['MTD VALUE'] || 0); // sum up all the MTD values
//     }, 0);

//     // Build the report logic with all segments and include LMTD and FTD
//     let lmtDataMap = {};
//     let ftdDataMap = {};
//     lastMonthSalesStats.forEach(item => {
//       lmtDataMap[item._id] = item['LMTD VALUE'] || 0;
//     });
//     ftdData.forEach(item => {
//       ftdDataMap[item._id] = item['FTD'] || 0;
//     });

//     let report = segments.map(segment => {
//       let segmentData = salesStats.find(item => item._id === segment) || {};
//       let lmtValue = lmtDataMap[segment] || 0;
//       let ftdValue = ftdDataMap[segment] || 0;

//       // Safely access target values and volumes, defaulting to 0 if undefined
//       let targetVol = (targetVolumesBySegment && targetVolumesBySegment[segment]) ? targetVolumesBySegment[segment] : 0;
//       let mtdVol = segmentData['MTD VALUE'] || 0;
//       let lmtdVol = lmtValue;

//       // totalMTDSales += mtdVol;

//       let pendingVol = targetVol - mtdVol;
//       let growthVol = lmtdVol !== 0 ? ((mtdVol - lmtdVol) / lmtdVol) * 100 : 0;
//       console.log("MTD vol, Total ", mtdVol, totalMTDSales);
//       let contribution = totalMTDSales !== 0 ? ((mtdVol / totalMTDSales) * 100).toFixed(2) : 0;



//       if (data_format == 'volume') {
//         return {
//           "Segment Wise": segment,
//           "Target Vol": targetVol,
//           "Mtd Vol": mtdVol,
//           "Lmtd Vol": lmtdVol,
//           "Pending Vol": pendingVol,
//           "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//           "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//           "% Gwth Vol": growthVol.toFixed(2),
//           "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
//           "Pending Act": pendingVol,
//           "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//           "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//           "% Gwth": growthVol.toFixed(2),
//           "FTD": ftdValue,
//           "Contribution %": contribution.toString() + ' %'
//         };
//       } else {
//         return {
//           "Segment Wise": segment,
//           "Target Val": targetVol,
//           "Mtd Val": mtdVol,
//           "Lmtd Val": lmtdVol,
//           "Pending Val": pendingVol,
//           "ADS": (mtdVol / presentDayOfMonth).toFixed(2),
//           "Req. ADS": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//           "% Gwth Val": growthVol.toFixed(2),
//           "Target SO": (targetValuesBySegment && targetValuesBySegment[segment]) ? targetValuesBySegment[segment] : 0,
//           "Pending Act": pendingVol,
//           "ADS Activation": (mtdVol / presentDayOfMonth).toFixed(2),
//           "Req. ADS Activation": (pendingVol / (30 - presentDayOfMonth)).toFixed(2),
//           "% Gwth": growthVol.toFixed(2),
//           "FTD": ftdValue,
//           "Contribution %": contribution.toString() + ' %'
//         };
//       }
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
//       "ADS Activation": (grandTotal["Mtd Vol"] / presentDayOfMonth).toFixed(2),
//       "Req. ADS Activation": (grandTotal["Pending Act"] / (30 - presentDayOfMonth)).toFixed(2),
//       "% Gwth Val": ((grandTotal["Mtd Vol"] - grandTotal["Lmtd Vol"]) / grandTotal["Lmtd Vol"] * 100).toFixed(2),
//       "Contribution %": "100.00 %"  // Grand total will always have 100% contribution
//     };

//     report.unshift(grandTotal); // Insert the grand total as the first row

//     let columnNames = [];
    
//     if (data_format == 'volume') {
//       columnNames = [
//         "Segment Wise",
//         "Target Vol",
//         "Mtd Vol",
//         "Lmtd Vol",
//         "Pending Vol",
//         "ADS",
//         "Req. ADS",
//         "% Gwth Vol",
//         "Target SO",
//         "Pending Act",
//         "ADS Activation",
//         "Req. ADS Activation",
//         "% Gwth",
//         "FTD",
//         "Contribution %"
//       ];
//     } else {
//       columnNames = [
//         "Segment Wise",
//         "Target Val",
//         "Mtd Val",
//         "Lmtd Val",
//         "Pending Val",
//         "ADS",
//         "Req. ADS",
//         "% Gwth Val",
//         "Target SO",
//         "Pending Act",
//         "ADS Activation",
//         "Req. ADS Activation",
//         "% Gwth",
//         "FTD",
//         "Contribution %"
//       ];
//     }

//     res.status(200).json({ columns: columnNames, data: report });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Internal Server Error");
//   }
// };



// 29112024 1510 
// exports.getSalesDashboardDataForEmployeeMTDW = async (req, res) => {
//   try {
//     let { code } = req;
//     let { is_siddha_admin } = req;
//     console.log("IS SIDDHA ADMIN: ", is_siddha_admin);
//     let { td_format, start_date, end_date, data_format } = req.query;
//     console.log("Start date, end date, td_format, data_format: ", start_date, end_date, td_format, data_format);


//     // Validate that employee code is provided
//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required." });
//     }
//     console.log("COde: ", code);

//     // Convert employee code to uppercase
//     const employeeCodeUpper = code.toUpperCase();

//     // Fetch employee details based on the code
//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });
//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given code." });
//     }

//     const { Name: name, Position: position } = employee;
//     console.log("Name and Pos: ", name, position);

//     if (!td_format) td_format = 'MTD';
//     if (!data_format) data_format = "value";

//     // // Parse start_date and end_date from request query in YYYY-MM-DD format
//     // let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     // let endDate = end_date ? new Date(end_date) : new Date();


//     // Maintaining consistent date values across local and prod 
//     // Parse start_date and end_date from request query in YYYY-MM-DD format
//     let startDate = start_date
//     ? new Date(`${start_date}T00:00:00Z`) // Explicitly set to UTC
//     : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1)); // First day of current month in UTC

//     let endDate = end_date
//     ? new Date(`${end_date}T23:59:59Z`) // Explicitly set to UTC
//     : new Date(); // Current time in system's timezone (or change to UTC if needed)

//     // Ensure dates are logged in UTC for debugging
//     console.log('Start Date (UTC):', startDate.toISOString());
//     console.log('End Date (UTC):', endDate.toISOString());


//     // startDate = new Date(startDate.toLocaleDateString('en-US'));
//     // endDate = new Date(endDate.toLocaleDateString('en-US'));
//     // endDate.setUTCHours(23, 59, 59, 59);
//     console.log("endDate: ", endDate);


//     const startYear = startDate.getFullYear();
//     const startMonth = startDate.getMonth() + 1; // Month is zero-based
//     const endYear = endDate.getFullYear();
//     const endMonth = endDate.getMonth() + 1; // Month is zero-based
//     const presentDayOfMonth = endDate.getDate();

//     const currentMonthStartDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
//     currentMonthStartDate.setUTCHours(0, 0, 0, 0);

//     const endDateForThisMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
//     endDateForThisMonth.setUTCHours(0, 0, 0, 0);
//     const dateNow = new Date();
//     console.log("Daate Now: ", dateNow);
//     console.log("currentMonthStartDate: ", currentMonthStartDate);
//     console.log("endDateForThisMonth: ", endDateForThisMonth);
 
//     let matchStage = {
//       parsedDate: {
//         $gt: currentMonthStartDate,
//         $lte: endDateForThisMonth
//       }
//     };

//     if(!is_siddha_admin){
//       matchStage[position] = name;
//     }

//     const result = {};

//     if (td_format === 'MTD') {
//       // Fetch current month (MTD) data
//       const salesStats = await SalesDataMTDW.aggregate([
//         {
//           $addFields: {
//             parsedDate: {
//               $dateFromString: {
//                 dateString: "$DATE",
//                 format: "%m/%d/%Y",
//                 // timezone: "UTC"
//               }
//             }
//           }
//         },
//         { $match: matchStage }, // Match current month
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             MTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             salesType: "$_id",
//             MTD_Value: 1,
//           }
//         }
//       ]);

//       // Fetch last month's data (LMTD)
//       let previousMonthStartDate = new Date(startDate);
//       previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//       let previousMonthEndDate = new Date(endDate);
//       previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//       const matchStageForLastMonth = {
//         parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//       }

//       if (!is_siddha_admin){
//         matchStageForLastMonth[position] = name;
//       }

//       const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//           // $match: {
//           //   parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//           //   [position]: name //VARUN
            
//           // }
//           $match : matchStageForLastMonth
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             LMTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             salesType: "$_id",
//             LMTD_Value: 1,
//           }
//         }
//       ]);

//       // Error handling: if no data found, set LMTD_Value to 'N/A'
//       let lmtDataMap = {};
//       lastMonthSalesStats.forEach(item => {
//         lmtDataMap[item.salesType] = item.LMTD_Value || 'N/A';
//       });

//       // Iterate through MTD data and append LMTD
//       salesStats.forEach(item => {
//         if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
//           result.td_sell_in = formatNumberIndian(item.MTD_Value);
//           result.ltd_sell_in = lmtDataMap[item.salesType] !== 'N/A' ? formatNumberIndian(lmtDataMap[item.salesType]) : 'N/A';
//           result.sell_in_growth = lmtDataMap[item.salesType] !== 'N/A' && lmtDataMap[item.salesType] !== 0
//             ? (((item.MTD_Value - lmtDataMap[item.salesType]) / lmtDataMap[item.salesType]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         } else if (item.salesType === "Sell Out") {
//           result.td_sell_out = formatNumberIndian(item.MTD_Value);
//           result.ltd_sell_out = lmtDataMap[item.salesType] !== 'N/A' ? formatNumberIndian(lmtDataMap[item.salesType]) : 'N/A';
//           result.sell_out_growth = lmtDataMap[item.salesType] !== 'N/A' && lmtDataMap[item.salesType] !== 0
//             ? (((item.MTD_Value - lmtDataMap[item.salesType]) / lmtDataMap[item.salesType]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         }
//       });
//     }

//     // For YTD
//     if (td_format === 'YTD') {
//       // Current Year YTD data
//       const salesStats = await SalesDataMTDW.aggregate([
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
//             parsedDate: { $gte: new Date(`${endYear}-01-01`), $lte: endDate },
//             [position]: name  //VARUN
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
//           }
//         }
//       ]);

//       // Last Year YTD data
//       const lastYearSalesStats = await SalesDataMTDW.aggregate([
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
//             parsedDate: { $gte: new Date(`${endYear - 1}-01-01`), $lte: new Date(`${endYear - 1}-${endMonth}-${presentDayOfMonth}`) },
//             [position]: name //VARUN
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "LYTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
//           }
//         }
//       ]);

//       // Error handling for missing LYTD data
//       let lastYearDataMap = {};
//       lastYearSalesStats.forEach(item => {
//         lastYearDataMap[item._id] = item['LYTD VALUE'] || 'N/A';
//       });

//       // Process and compare YTD and LYTD data
//       salesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           result.td_sell_out = exports.formatNumberIndian(item['YTD VALUE']);
//           result.ltd_sell_out = lastYearDataMap[item._id] !== 'N/A' ? exports.formatNumberIndian(lastYearDataMap[item._id]) : 'N/A';
//           result.sell_out_growth = lastYearDataMap[item._id] !== 'N/A' && lastYearDataMap[item._id] !== 0
//             ? (((item['YTD VALUE'] - lastYearDataMap[item._id]) / lastYearDataMap[item._id]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         } else {
//           result.td_sell_in = exports.formatNumberIndian(item['YTD VALUE']);
//           result.ltd_sell_in = lastYearDataMap[item._id] !== 'N/A' ? exports.formatNumberIndian(lastYearDataMap[item._id]) : 'N/A';
//           result.sell_in_growth = lastYearDataMap[item._id] !== 'N/A' && lastYearDataMap[item._id] !== 0
//             ? (((item['YTD VALUE'] - lastYearDataMap[item._id]) / lastYearDataMap[item._id]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         }
//       });
//     }

//     res.status(200).send(result);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send({ error: 'Internal Server Error' });
//   }
// };

// 29112024 1547
// exports.getSalesDashboardDataByEmployeeNameMTDW = async (req, res) => {
//   try {
//     let { td_format, start_date, end_date, data_format, name, position_category } = req.query;

//     // Validate that employee code is provided
//     if (!name || !position_category) {
//       return res.status(400).send({ error: "Name and position category is required." });
//     }

//     if (!td_format) td_format = 'MTD';
//     if (!data_format) data_format = "value";

//     // Parse start_date and end_date from request query in YYYY-MM-DD format
//     let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//     let endDate = end_date ? new Date(end_date) : new Date();

//     startDate = new Date(startDate.toLocaleDateString('en-US'));
//     endDate = new Date(endDate.toLocaleDateString('en-US'));

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
//       [position_category]: name
//     };

//     const result = {};

//     if (td_format === 'MTD') {
//       // Fetch current month (MTD) data
//       const salesStats = await SalesDataMTDW.aggregate([
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
//         { $match: matchStage }, // Match current month
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             MTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             salesType: "$_id",
//             MTD_Value: 1,
//           }
//         }
//       ]);

//       // Fetch last month's data (LMTD)
//       let previousMonthStartDate = new Date(startDate);
//       previousMonthStartDate.setMonth(previousMonthStartDate.getMonth() - 1);
//       let previousMonthEndDate = new Date(endDate);
//       previousMonthEndDate.setMonth(previousMonthEndDate.getMonth() - 1);

//       const lastMonthSalesStats = await SalesDataMTDW.aggregate([
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
//             parsedDate: { $gte: previousMonthStartDate, $lte: previousMonthEndDate },
//             [position_category]: name
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             LMTD_Value: { $sum: { $toInt: data_format === "value" ? "$MTD VALUE" : "$MTD VOLUME" } },
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             salesType: "$_id",
//             LMTD_Value: 1,
//           }
//         }
//       ]);

//       // Error handling: if no data found, set LMTD_Value to 'N/A'
//       let lmtDataMap = {};
//       lastMonthSalesStats.forEach(item => {
//         lmtDataMap[item.salesType] = item.LMTD_Value || 'N/A';
//       });

//       // Iterate through MTD data and append LMTD
//       salesStats.forEach(item => {
//         if (item.salesType === "Sell In" || item.salesType === "Sell Thru2") {
//           result.td_sell_in = formatNumberIndian(item.MTD_Value);
//           result.ltd_sell_in = lmtDataMap[item.salesType] !== 'N/A' ? formatNumberIndian(lmtDataMap[item.salesType]) : 'N/A';
//           result.sell_in_growth = lmtDataMap[item.salesType] !== 'N/A' && lmtDataMap[item.salesType] !== 0
//             ? (((item.MTD_Value - lmtDataMap[item.salesType]) / lmtDataMap[item.salesType]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         } else if (item.salesType === "Sell Out") {
//           result.td_sell_out = formatNumberIndian(item.MTD_Value);
//           result.ltd_sell_out = lmtDataMap[item.salesType] !== 'N/A' ? formatNumberIndian(lmtDataMap[item.salesType]) : 'N/A';
//           result.sell_out_growth = lmtDataMap[item.salesType] !== 'N/A' && lmtDataMap[item.salesType] !== 0
//             ? (((item.MTD_Value - lmtDataMap[item.salesType]) / lmtDataMap[item.salesType]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         }
//       });
//     }

//     // For YTD
//     if (td_format === 'YTD') {
//       // Current Year YTD data
//       const salesStats = await SalesDataMTDW.aggregate([
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
//             parsedDate: { $gte: new Date(`${endYear}-01-01`), $lte: endDate },
//             [position_category]: name
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "YTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
//           }
//         }
//       ]);

//       // Last Year YTD data
//       const lastYearSalesStats = await SalesDataMTDW.aggregate([
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
//             parsedDate: { $gte: new Date(`${endYear - 1}-01-01`), $lte: new Date(`${endYear - 1}-${endMonth}-${presentDayOfMonth}`) },
//             [position_category]: name
//           }
//         },
//         {
//           $group: {
//             _id: "$SALES TYPE",
//             "LYTD VALUE": { $sum: { $toInt: "$MTD VALUE" } }
//           }
//         }
//       ]);

//       // Error handling for missing LYTD data
//       let lastYearDataMap = {};
//       lastYearSalesStats.forEach(item => {
//         lastYearDataMap[item._id] = item['LYTD VALUE'] || 'N/A';
//       });

//       // Process and compare YTD and LYTD data
//       salesStats.forEach(item => {
//         if (item._id === 'Sell Out') {
//           result.td_sell_out = exports.formatNumberIndian(item['YTD VALUE']);
//           result.ltd_sell_out = lastYearDataMap[item._id] !== 'N/A' ? exports.formatNumberIndian(lastYearDataMap[item._id]) : 'N/A';
//           result.sell_out_growth = lastYearDataMap[item._id] !== 'N/A' && lastYearDataMap[item._id] !== 0
//             ? (((item['YTD VALUE'] - lastYearDataMap[item._id]) / lastYearDataMap[item._id]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         } else {
//           result.td_sell_in = exports.formatNumberIndian(item['YTD VALUE']);
//           result.ltd_sell_in = lastYearDataMap[item._id] !== 'N/A' ? exports.formatNumberIndian(lastYearDataMap[item._id]) : 'N/A';
//           result.sell_in_growth = lastYearDataMap[item._id] !== 'N/A' && lastYearDataMap[item._id] !== 0
//             ? (((item['YTD VALUE'] - lastYearDataMap[item._id]) / lastYearDataMap[item._id]) * 100).toFixed(2) + '%'
//             : 'N/A';
//         }
//       });
//     }

//     res.status(200).send(result);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send({ error: 'Internal Server Error' });
//   }
// };


// 29112024 1613 
// exports.getAllSubordinatesMTDW = async (req, res) => {
//   try {
//     let { code } = req;

//     if (!code) {
//       return res.status(400).send({ error: "Employee code is required!" });
//     }

//     const employeeCodeUpper = code.toUpperCase();

//     // Fetching employee details based on the code
//     const employee = await EmployeeCode.findOne({ Code: employeeCodeUpper });
//     if (!employee) {
//       return res.status(404).send({ error: "Employee not found with the given code" });
//     }

//     const { Name: name, Position: position } = employee;

//     // console.log("Name & Position: ", name, position);

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
//           [position]: name,
//         },
//       },
//       {
//         $group: {
//           _id: null,
//           ABM: {
//             $addToSet: {
//               $cond: [
//                 { $or: [{ $eq: ["$ABM", ""] }, { $eq: ["$ABM", "0"] }] },
//                 null,
//                 "$ABM",
//               ],
//             },
//           },
//           RSO: {
//             $addToSet: {
//               $cond: [
//                 { $or: [{ $eq: ["$RSO", ""] }, { $eq: ["$RSO", "0"] }] },
//                 null,
//                 "$RSO",
//               ],
//             },
//           },
//           ASE: {
//             $addToSet: {
//               $cond: [
//                 { $or: [{ $eq: ["$ASE", ""] }, { $eq: ["$ASE", "0"] }] },
//                 null,
//                 "$ASE",
//               ],
//             },
//           },
//           ASM: {
//             $addToSet: {
//               $cond: [
//                 { $or: [{ $eq: ["$ASM", ""] }, { $eq: ["$ASM", "0"] }] },
//                 null,
//                 "$ASM",
//               ],
//             },
//           },
//           TSE: {
//             $addToSet: {
//               $cond: [
//                 { $or: [{ $eq: ["$TSE", ""] }, { $eq: ["$TSE", "0"] }] },
//                 null,
//                 "$TSE",
//               ],
//             },
//           },
//         },
//       },
//       {
//         $project: {
//           _id: 0,
//           subordinates: positionsHierarchy[position].reduce((acc, pos) => {
//             acc[pos] = {
//               $concatArrays: [
//                 [{ $literal: "All" }], // Add "All" element at the start of the array
//                 {
//                   $filter: {
//                     input: `$${pos}`,
//                     as: "name",
//                     cond: {
//                       $and: [
//                         { $ne: ["$$name", null] },
//                         { $ne: ["$$name", ""] },
//                         { $ne: ["$$name", "0"] },
//                       ],
//                     },
//                   },
//                 },
//               ],
//             };
//             return acc;
//           }, {}),
//         },
//       },
//     ];

//     const subordinates = await SalesDataMTDW.aggregate(subordinatesPipeline);

//     if (!subordinates.length) {
//       return res.status(404).json({ error: "No subordinates found." });
//     }

//     const result = {
//       positions: positionsHierarchy[position],
//       ...subordinates[0].subordinates,
//     };

//     res.status(200).json(result);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// };









