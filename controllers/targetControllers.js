const csvParser = require("csv-parser");
const { Readable } = require("stream");
const SegmentTarget = require("../models/SegmentTarget");


// exports.uploadTargetData = async (req, res) => {
//     try {
//         if(!req.file) {
//             return res.status(400).send("No target file uploaded");
//         }

//         let targets = [];

//         if(req.file.originalname.endsWith(".csv")){
//             const stream = new Readable();
//             stream.push(req.file.buffer);
//             stream.push(null);
//             stream
//                 .pipe(csvParser())
//                 .on("data", (data) => targets.push(data))
//                 .on("end", async () => {
//                     try {
//                         // Inserting data into MongoDB 
//                         await Target.insertMany(targets);
//                         res.status(200).send("Targets inserted into the database!")
//                     } catch (error) {
//                         console.log(error);
//                         res.status(500).send("Error inserting targets into the database!")
//                     }
//                 })
//         } else {
//             res.status(400).send("Unsupported file format");
//           }

//     } catch(error) {
//         console.log(error)
//         res.status(500).send("Internal Server Error!")
//     }
// }

exports.uploadSegmentTargetData = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No target file uploaded");
        }

        let targets = [];

        if (req.file.originalname.endsWith(".csv")) {
            const stream = new Readable();
            stream.push(req.file.buffer);
            stream.push(null);
            stream
                .pipe(csvParser())
                .on("data", (data) => targets.push(data))
                .on("end", async () => {
                    try {
                        for (let target of targets) {
                            const { Name, Segment, 'Target Value': targetValue, 'Target Volume': targetVolume, 'Start Date': startDate, Category } = target;

                            const existingTarget = await SegmentTarget.findOne({ Name, Segment, 'Start Date': startDate, Category });

                            if (existingTarget) {
                                // Update the existing target if values differ
                                if (existingTarget['Target Value'] !== targetValue || existingTarget['Target Volume'] !== targetVolume) {
                                    existingTarget['Target Value'] = targetValue;
                                    existingTarget['Target Volume'] = targetVolume;
                                    await existingTarget.save();
                                }
                            } else {
                                // Create a new target entry
                                await SegmentTarget.create({ Name, Segment, 'Target Value': targetValue, 'Target Volume': targetVolume, 'Start Date': startDate, Category });
                            }
                        }
                        res.status(200).send("Targets inserted/updated in the database!");
                    } catch (error) {
                        console.log(error);
                        res.status(500).send("Error inserting targets into the database!");
                    }
                });
        } else {
            res.status(400).send("Unsupported file format");
        }

    } catch (error) {
        console.log(error);
        res.status(500).send("Internal Server Error!");
    }
};