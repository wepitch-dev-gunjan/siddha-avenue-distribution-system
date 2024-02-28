const csvParser = require("csv-parser");
const { Readable } = require("stream");
const xlsx = require("xlsx");
const Data = require("../models/Data");

exports.uploadData = async (req, res) => {
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
        await Data.insertMany(results);
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

exports.getData = async (req, res) => {
  try {
    const { search } = req.query;
    console.log(search);
    let query = {};
    if (search) {
      const dataKeys = await Data.find().select("-_id").lean().exec(); // Get all keys from existing data
      const fields = dataKeys.map((obj) => Object.keys(obj)).flat(); // Flatten all keys

      // Remove duplicates from the fields array
      const uniqueFields = [...new Set(fields)].filter((data) => data != "__v");
      console.log(uniqueFields);

      query = {
        $or: uniqueFields.map((field) => ({
          [field]: {
            $regex: search,
            $options: "i", // Case-insensitive search
          },
        })),
      };
    }
    const data = await Data.find(query);
    if (!data) return res.status(404).send({ error: "Data not found" });
    res.send(data);
  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};
