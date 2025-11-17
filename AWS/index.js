const express = require("express");
const serverless = require("aws-serverless-express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// CORS Middleware
app.use(cors({
  origin: "https://www.techunifi.com",
  methods: ["OPTIONS", "POST"],
  allowedHeaders: ["Content-Type"]
}));

// DynamoDB Init
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMO_TABLE_NAME;

// Handle Preflight
app.options('/saveData', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': 'https://www.techunifi.com',
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.status(200).send();
});

// Save Ticket
app.post("/saveData", async (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': 'https://www.techunifi.com',
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  const {
    submitTicket,
    name,
    email,
    company,
    phone,
    subject,
    services,
    modelNumber,
    description
  } = req.body;

  if (!submitTicket || !name || !email || !subject || !Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const params = new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      submitTicket,
      name,
      email,
      company: company || "",
      phone: phone || "",
      subject,
      services,
      modelNumber: modelNumber || "",
      description: description || "",
      createdAt: new Date().toISOString()
    }
  });

  try {
    await dynamoDB.send(params);
    res.status(200).json({ message: "Data saved successfully!" });
  } catch (error) {
    console.error("DynamoDB Error:", error);
    res.status(500).json({ message: "Error saving data", error: error.message });
  }
});

// Export Lambda
const server = serverless.createServer(app);
exports.handler = (event, context) => serverless.proxy(server, event, context);
