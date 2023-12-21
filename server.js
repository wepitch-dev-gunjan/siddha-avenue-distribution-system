const express = require("express");
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const mongoose = require("mongoose");
const { readdirSync } = require("fs");
const cors = require("cors");
const cookieParser = require('cookie-parser');
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/siddha-avenue-distribution-system-db";
const NODE_ENV = process.env.NODE_ENV || "development";

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

// CORS configuration
app.use(
  cors({
    // origin: ['https://counsellor.sortmycollege.com', 'http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  })
);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on("connected", () => {
  console.log("Database is connected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

// Default route
app.get('/', (req, res) => {
  res.send('Welcome');
});
// Routes
readdirSync("./routes").map((r) => app.use("/", require("./routes/" + r)));

// app.use("/", require("./services/googleAuthentication"));

let server;

if (NODE_ENV === 'production') {
  // Production mode: HTTPS server with SSL certificate
  const serverOptions = {
    key: fs.readFileSync(path.join(__dirname, '..', 'ssl_certificates', 'private.key')),
    cert: fs.readFileSync(path.join(__dirname, '..', 'ssl_certificates', 'certificate.crt')),
    ca: fs.readFileSync(path.join(__dirname, '..', 'ssl_certificates', 'ca_bundle.crt'))
  };

  server = https.createServer(serverOptions, app);
} else {
  // Development mode: HTTP server
  server = http.createServer(app);
}

server.on('error', (err) => {
  console.error('Server encountered an error:', err);
});

server.listen(PORT, () => {
  console.log(`Server started in ${NODE_ENV} mode at port: ${PORT}`);
});
