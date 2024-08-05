const csvParser = require("csv-parser");
const { Readable } = require("stream");
const ModelData = require("../models/ModelData");

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

