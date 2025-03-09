const express = require('express');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const cors = require('cors');
app.use(cors());

app.use(cors({
    origin: '*', // Allow all origins (not recommended for production)
    methods: ['GET', 'POST'], // Allow only specific methods
    allowedHeaders: ['Content-Type'], // Allow specific headers
}));


// **Set up AWS S3 Client (v3)**
const s3 = new S3Client({ region: "us-east-1" });

async function uploadToS3(bucket, key, body) {
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body });
    await s3.send(command);
}

// **Set up AWS DynamoDB Client (v3)**
const dynamoDB = new DynamoDBClient({ region: "us-west-2" }); // Replace with your region
const TABLE_NAME = 'FormDataTable'; // Replace with your table name

// **API endpoint to save form data**
app.post('/saveData', async (req, res) => {
    const { name, email } = req.body;
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
        console.error('Error saving data:', error);
        res.status(500).json({ message: 'Error saving data.' });
    }
});

// **Start the server**
const port = 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
