const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { readdirSync } = require("fs");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 8000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://connectsiddha_staging:TZcQRUKjTY5U99zR@cluster0.5qw8rhx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const NODE_ENV = process.env.NODE_ENV || "development";


// Parse URL-encoded form data
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

// CORS configuration
app.use(
  cors({
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

// Connect to MongoDB
mongoose.connect(MONGODB_URI);

mongoose.connection.on("connected", () => {
  console.log("Database is connected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

// Default route
app.get("/", (req, res) => {
  res.send("Welcome");
});
// Routes
readdirSync("./routes").map((r) => app.use("/", require("./routes/" + r)));

app.listen(PORT, () => {
  console.log(`Server started in ${NODE_ENV} mode at port: ${PORT}`);
});

module.exports = app;