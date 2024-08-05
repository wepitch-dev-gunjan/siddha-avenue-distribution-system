const csvParser = require("csv-parser");
const { Readable } = require("stream");
const ModelData = require("../models/ModelData");
const SalesData = require("../models/SalesData");
const { getMonthFromDateExported } = require("../helpers/reportHelpers");
const { parseDate } = require("../helpers/salesHelpers");

exports.uploadModelData = async (req, res) => {
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
              await ModelData.insertMany(results);
              res.status(200).send("Model Data inserted into database!");
            } catch (error) {
              console.log(error);
              res.status(500).send("Error inserting model data into database!");
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
          await ModelData.insertMany(results);
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

exports.getSalesDataModelWise = async (req, res) => {
    try {
      let { start_date, end_date } = req.query;
  
      let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      let endDate = end_date ? new Date(end_date) : new Date();
  
      startDate = parseDate(startDate.toLocaleDateString('en-US'));
      endDate = parseDate(endDate.toLocaleDateString('en-US'));
  
      const currentMonth = endDate.getMonth() + 1;
      const currentYear = endDate.getFullYear();
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const daysPassed = endDate.getDate();
  
      // Fetch model data based on the first date of the month of endDate
      const targetMonth = getMonthFromDateExported(endDate.toLocaleDateString('en-US'));
      const [month, year] = targetMonth.split('/');
      const targetStartDate = `${parseInt(month)}/1/${year}`;
  
      const modelData = await ModelData.find({ 'START DATE': targetStartDate });
  
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
            parsedDate: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: "$MARKET",
            "MTD": { $sum: { $toInt: "$MTD VOLUME" } },
            "LMTD": { $sum: { $toInt: "$LMTD VOLUME" } }
          }
        }
      ]);
  
      // Fetch FTD data separately
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
            parsedDate: endDate
          }
        },
        {
          $group: {
            _id: "$MARKET",
            "FTD Vol": { $sum: { $toInt: "$MTD VOLUME" } }
          }
        }
      ]);
  
      // Combine data
      const resultData = modelData.map(model => {
        const modelName = model['MODEL NAME'];
        const salesEntry = salesData.find(entry => entry._id === modelName) || {};
        const ftdEntry = ftdData.find(entry => entry._id === modelName) || {};
  
        const mtd = salesEntry.MTD || 0;
        const lmtd = salesEntry.LMTD || 0;
        const ftdVol = ftdEntry['FTD Vol'] || 0;
  
        const averageDaySale = mtd / Math.max(daysPassed - 1, 1);
        const dos = (parseInt(model['MKT STK']) + parseInt(model['DMDD STK'])) / averageDaySale;
  
        return {
          "Price Band": model['PRICE BAND'] || '',
          "Market Name": model['MARKET NAME'] || '',
          "MODEL NAME": modelName,
          "Model Target": parseInt(model['MODEL TARGET']),
          "LMTD": lmtd,
          "MTD": mtd,
          "FTD Vol": ftdVol,
          "% Gwth": lmtd ? (((mtd - lmtd) / lmtd) * 100).toFixed(2) : "N/A",
          "ADS": averageDaySale.toFixed(2),
          "DP": model['DP'] || 0,
          "Mkt Stk": parseInt(model['MKT STK']),
          "Dmdd Stk": parseInt(model['DMDD STK']),
          "M+S": parseInt(model['MKT STK']) + parseInt(model['DMDD STK']),
          "DOS": dos.toFixed(2)
        };
      });
  
      res.status(200).json(resultData);
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
    }
  };