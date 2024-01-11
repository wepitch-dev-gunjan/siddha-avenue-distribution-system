const axios = require("axios");
const jwt = require("jsonwebtoken");

const { JWT_SECRET } = process.env;
exports.generateToken = (user, expiresIn) => {
  return jwt.sign(user, JWT_SECRET, { expiresIn });
};

exports.verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.log(error);
    return null;
  }
};

async function getLocationInfo(geonamesID) {
  try {
    // Make a GET request to the Geonames API to retrieve location information
    const response = await axios.get(
      `http://api.geonames.org/getJSON?geonameId=${geonamesID}&username=your_username`
    );

    // Extract the relevant information from the API response
    const country = response.data.countryName;
    const state = response.data.adminName1;
    const city = response.data.name;

    // Create an array with the location information
    const locationInfo = [country, state, city];

    return locationInfo;
  } catch (error) {
    console.error("Error retrieving location information:", error.message);
    return null; // Return null in case of an error
  }
}
