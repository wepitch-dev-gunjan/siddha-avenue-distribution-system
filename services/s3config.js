require('dotenv').config();
const { AWS_REGION, AWS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME } = process.env;

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner'); // No longer needed

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  }
});

exports.getObjectURL = async (key) => {
  const command = new GetObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: key,
  });

  try {
    const expiresIn = 5;
    return await getSignedUrl(s3Client, command, { expiresIn })
  } catch (err) {
    console.error("Error fetching the object:", err);
    throw err;
  }
};

exports.putObject = async (folderName, fileName, fileData, contentType) => {
  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: `${folderName}/${fileName}`,
    Body: fileData,
    ContentType: contentType,
  });

  try {
    const result = await s3Client.send(command);
    return result;
  } catch (err) {
    console.error("Error uploading the object:", err);
    throw err;
  }
};
