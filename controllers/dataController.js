const csvParser = require("csv-parser");
const { Readable } = require("stream");
const Data = require("../models/Data");

exports.uploadData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    // Parse CSV file
    const results = [];
    // Convert buffer to Readable stream
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
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error");
  }
};
