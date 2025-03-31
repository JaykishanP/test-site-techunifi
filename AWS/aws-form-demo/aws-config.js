const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'us-east-1', // Change to your region
  accessKeyId: 'YOUR_ACCESS_KEY', // Replace with actual key
  secretAccessKey: 'YOUR_SECRET_KEY' // Replace with actual key
});

// Create DynamoDB Document Client
const dynamoDB = new AWS.DynamoDB.DocumentClient();

module.exports = dynamoDB;
