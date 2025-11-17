const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const dynamoDB = require("./aws-config");

const docClient = DynamoDBDocumentClient.from(dynamoDB);

const saveFormData = async (formData) => {
    const params = {
        TableName: process.env.DYNAMO_TABLE_NAME,
        Item: {
            id: Date.now().toString(),
            name: formData.name,
            email: formData.email,
            message: formData.message || "", // Ensure message field is optional
        },
    };

    try {
        await docClient.send(new PutCommand(params));
        console.log("Data saved successfully");
    } catch (error) {
        console.error("Error saving data:", error);
    }
};

module.exports = saveFormData;


