const express = require("express");
const serverless = require("aws-serverless-express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

require("dotenv").config();

const app = express();
app.use(bodyParser.json());

app.use(cors({
    origin: "https://jaykishanp.github.io",
    methods: ["OPTIONS", "POST"],
    allowedHeaders: ["Content-Type"]
}));

// Configure AWS SDK v3 for DynamoDB
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMO_TABLE_NAME;

// Handle CORS Preflight
app.options('/saveData', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.status(200).send();
});

// Save Data API
app.post("/saveData", async (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST',
        'Access-Control-Allow-Headers': 'Content-Type'
    });

    const { submitTicket, name, email } = req.body;

    // Ensure required fields are present
    if (!submitTicket || !name || !email) {
        return res.status(400).json({ message: "submitTicket, Name, and Email are required!" });
    }

    const params = new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            submitTicket,
            name,
            email,
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

// Export Handler for AWS Lambda
const server = serverless.createServer(app);
exports.handler = (event, context) => serverless.proxy(server, event, context);
