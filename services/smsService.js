
const TeleSignSDK = require('telesignsdk');

// Replace the defaults below with your Telesign authentication credentials or pull them from environment variables.

const customerId = process.env.TELESIGN_CUSTOMER_ID || "5DE1ADDE-3CC2-451C-8170-69AC1F51277B";
const apiKey = process.env.TELESIGN_API_KEY || "3bJ7KRinEUFnN98fXZeqY2HFz+L3ijl/0fLoSp2exKCXDA7p9AM75o5fG+k9Qj//CxJ+J639hHRJYwAtDpcB/A==";

// Set the default below to your test phone number or pull it from an environment variable. 
// In your production code, update the phone number dynamically for each transaction.
const phoneNumber = process.env.PHONE_NUMBER || "917611821710";

// Set the message text and type.
const message = "Your package has shipped! Follow your delivery at https://vero-finto.com/orders/3456";
const messageType = "ARN";

// Instantiate a messaging client object.
const client = new TeleSignSDK(customerId, apiKey);

// Define the callback.
const smsCallback = (error, responseBody) => {
  // Display the response body in the console for debugging purposes. 
  // In your production code, you would likely remove this.
  if (error === null) {
    console.log("\nResponse body:\n" + JSON.stringify(responseBody));
  } else {
    console.error("Unable to send SMS. Error:\n\n" + error);
  }
}

// Make the request and capture the response.
// client.sms.message(smsCallback, phoneNumber, message, messageType);
module.exports = {
  client, messageType, smsCallback, smsCallback, phoneNumber, message
}