const express = require('express');
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');

// Set up AWS DynamoDB
AWS.config.update({
    region: 'us-west-2', // Replace with your AWS region
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const app = express();

// Middleware to parse JSON data
app.use(bodyParser.json());

// Define the DynamoDB table
const TABLE_NAME = 'FormDataTable'; // Replace with your DynamoDB table name

// API endpoint to save form data
app.post('/saveData', async (req, res) => {
    const { name, email } = req.body;

    const params = {
        TableName: TABLE_NAME,
        Item: {
            id: AWS.util.uuid.v4(),
            name: name,
            email: email,
        },
    };

    try {
        await dynamoDB.put(params).promise();
        res.status(200).json({ message: 'Data saved successfully!' });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ message: 'Error saving data.' });
    }
});

// Start the server
const port = 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
