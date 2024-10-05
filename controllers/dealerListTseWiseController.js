const DealerListTseWise = require("../models/DealerListTseWise");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");

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