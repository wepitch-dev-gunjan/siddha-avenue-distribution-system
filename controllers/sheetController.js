const stream = require('stream');

exports.uploadSheet = async (req, res) => {
  try {
    const file = req.file;

    // Create a stream from the file buffer
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);

    // Upload the file to Google Drive
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const driveResponse = await drive.files.create({
      requestBody: {
        name: file.originalname,
        // Uncomment the following line if you want to specify the parent folder
        // parents: ['your_parent_folder_id'],
      },
      media: {
        mimeType: file.mimetype,
        body: bufferStream,
      },
    });

    console.log(driveResponse.data);
    res.status(200).send({ message: 'File uploaded successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      error: 'Internal server error',
    });
  }
}
