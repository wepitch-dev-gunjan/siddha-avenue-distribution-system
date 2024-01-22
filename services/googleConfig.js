const { google } = require('googleapis');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_OAUTH2_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH2_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH2_REDIRECT_URI;

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
// Set the required scope for file creation
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
);

const drive = google.drive({ version: 'v3', auth: oauth2Client });

module.exports = {
  SCOPES, oauth2Client, drive
}


