const csvParser = require("csv-parser");
const { Readable } = require("stream");
const ChannelTarget = require("../models/ChannelTarget");

exports.uploadChannelTargetData = async (req, res) => {
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
                            const { Name, Channel, 'Target Value': targetValue, 'Target Volume': targetVolume, 'Start Date': startDate, Category } = target;

                            const existingTarget = await ChannelTarget.findOne({ Name, Channel, 'Start Date': startDate, Category });

                            if (existingTarget) {
                                // Update the existing target if values differ
                                if (existingTarget['Target Value'] !== targetValue || existingTarget['Target Volume'] !== targetVolume) {
                                    existingTarget['Target Value'] = targetValue;
                                    existingTarget['Target Volume'] = targetVolume;
                                    await existingTarget.save();
                                }
                            } else {
                                // Create a new target entry
                                await ChannelTarget.create({ Name, Channel, 'Target Value': targetValue, 'Target Volume': targetVolume, 'Start Date': startDate, Category });
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