const express = require('express');
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config(); // Load environment variables

const app = express();
app.use(bodyParser.json());
app.use(cors()); // Single CORS setup

app.use(cors({
    origin: ['https://jaykishanp.github.io/test-site-techunifi/AWS/form.html'], // Replace with your actual frontend domain
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));


// AWS Configuration
const dynamoDB = new DynamoDBClient({
    region: process.env.AWS_REGION, // Set in .env
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const TABLE_NAME = process.env.DYNAMO_TABLE_NAME; // Set table name in .env

// API Endpoint to Save Data
app.post('/saveData', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
        return res.status(400).json({ message: "Name and Email are required!" });
    }

    const params = {
        TableName: TABLE_NAME,
        Item: {
            id: { S: uuidv4() },
            name: { S: name },
            email: { S: email },
        },
    };

    try {
        await dynamoDB.send(new PutItemCommand(params));
        res.status(200).json({ message: 'Data saved successfully!' });
    } catch (error) {
        console.error('DynamoDB Error:', error);
        res.status(500).json({ message: 'Error saving data.' });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
