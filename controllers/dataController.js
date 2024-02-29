const csvParser = require("csv-parser");
const { Readable } = require("stream");
const xlsx = require("xlsx");
const Data = require("../models/Data");

// exports.uploadData = async (req, res) => {
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
//             // Insert data into MongoDB
//             await Data.insertMany(results);
//             res.status(200).send("Data inserted into database");
//           } catch (error) {
//             console.log(error);
//             res.status(500).send("Error inserting data into database");
//           }
//         });
//     } else if (req.file.originalname.endsWith(".xlsx")) {
//       // Parse XLSX file
//       const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//       const sheetName = workbook.SheetNames[0];
//       const sheet = workbook.Sheets[sheetName];
//       results = xlsx.utils.sheet_to_json(sheet);

//       try {
//         // Insert data into MongoDB
//         await Data.insertMany(results);
//         res.status(200).send("Data inserted into database");
//       } catch (error) {
//         console.log(error);
//         res.status(500).send("Error inserting data into database");
//       }
//     } else {
//       res.status(400).send("Unsupported file format");
//     }
//   } catch (error) {
//     console.log(error);
//     res.status(500).send("Internal server error");
//   }
// };

// exports.uploadData = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).send("No file uploaded");
//     }

//     let results = [];
//     let fileType, fileName, fileDate;

//     if (req.file.originalname.endsWith(".csv")) {
//       fileType = "CSV";
//       fileName = req.file.originalname;
//       fileDate = req.file.originalname.split("_")[1]; // Assuming the date is part of the filename
//       // Parse CSV file
//       const stream = new Readable();
//       stream.push(req.file.buffer);
//       stream.push(null);
//       stream
//         .pipe(csvParser())
//         .on("data", (data) => results.push(data))
//         .on("end", async () => {
//           try {
//             // Insert data into MongoDB
//             await Data.insertMany(results);
//             res
//               .status(200)
//               .send({
//                 fileType,
//                 fileName,
//                 fileDate,
//                 message: "Data inserted into database",
//               });
//           } catch (error) {
//             console.log(error);
//             res.status(500).send("Error inserting data into database");
//           }
//         });
//     } else if (req.file.originalname.endsWith(".xlsx")) {
//       fileType = "XLSX";
//       fileName = req.file.originalname;
//       fileDate = req.file.originalname.split("_")[1]; // Assuming the date is part of the filename
//       // Parse XLSX file
//       const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//       const sheetName = workbook.SheetNames[0];
//       const sheet = workbook.Sheets[sheetName];
//       results = xlsx.utils.sheet_to_json(sheet);

//       try {
//         // Insert data into MongoDB
//         await Data.insertMany(results);
//         res
//           .status(200)
//           .send({
//             fileType,
//             fileName,
//             fileDate,
//             message: "Data inserted into database",
//           });
//       } catch (error) {
//         console.log(error);
//         res.status(500).send("Error inserting data into database");
//       }
//     } else {
//       res.status(400).send("Unsupported file format");
//     }
//   } catch (error) {
//     console.log(error);
//     res.status(500).send("Internal server error");
//   }
// };

exports.uploadData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    let results = [];
    let fileType, fileName, fileDate;

    if (req.file.originalname.endsWith(".csv")) {
      fileType = "CSV";
      fileName = req.file.originalname;
      fileDate = extractDateFromFilename(fileName); // Extract date from filename
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
            res.status(200).send({
              fileType,
              fileName,
              fileDate,
              message: "Data inserted into database",
            });
          } catch (error) {
            console.log(error);
            res.status(500).send("Error inserting data into database");
          }
        });
    } else if (req.file.originalname.endsWith(".xlsx")) {
      fileType = "XLSX";
      fileName = req.file.originalname;
      fileDate = extractDateFromFilename(fileName); // Extract date from filename
      // Parse XLSX file
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      results = xlsx.utils.sheet_to_json(sheet);

      try {
        // Insert data into MongoDB
        await Data.insertMany(results);
        res.status(200).send({
          fileType,
          fileName,
          fileDate,
          message: "Data inserted into database",
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

// function extractDateFromFilename(filename) {
//   // Assuming date format is YYYY_MM_DD
//   const regex = /(\d{4})_(\d{2})_(\d{2})/;
//   const match = filename.match(regex);
//   if (match) {
//     const year = match[1];
//     const month = match[2];
//     const day = match[3];
//     return `${year}-${month}-${day}`;
//   }
//   return null;
// }

exports.getData = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      const dataKeys = await Data.find().select("-_id").lean().exec(); // Get all keys from existing data
      const fields = dataKeys.map((obj) => Object.keys(obj)).flat(); // Flatten all keys

      // Remove duplicates from the fields array
      const uniqueFields = [...new Set(fields)].filter((data) => data != "__v");

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
