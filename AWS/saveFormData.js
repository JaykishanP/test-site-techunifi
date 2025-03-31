const dynamoDB = require('./aws-config');

const saveFormData = async (formData) => {
  const params = {
    TableName: 'FormData', // Your table name
    Item: {
      id: Date.now().toString(), // Generate a unique ID
      name: formData.name,
      email: formData.email,
      message: formData.message
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
  }
};

module.exports = saveFormData;
