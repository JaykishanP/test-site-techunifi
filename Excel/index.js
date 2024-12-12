const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: 'https://www.techunifi.com' })); // Allow frontend's origin
app.use(express.json());

const allowedOrigins = ['https://www.techunifi.com']; // List all allowed origins here

// Google API setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Define constants
const SPREADSHEET_ID = '17xp08DNwal5DTc2pd8I8x-a1TQCQZZr_Oy882MIu_TU'; // Replace with your spreadsheet ID
const SHEET_NAME = 'Timesheet';

// Function to append data to Google Sheet
const appendToSheet = async (spreadsheetId, data) => {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:F`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [data] },
    });
    console.log('Data appended successfully!');
  } catch (error) {
    console.error('Error appending data to Google Sheet:', error.response?.data || error.message);
    throw new Error('Failed to append data to Google Sheet');
  }
};

// API Endpoint to handle form submission
app.post('/submit-timesheet', async (req, res) => {
  try {
    const { userName, propertyName, description, timeIn, timeOut, date } = req.body;

    // Input validation
    if (!userName || !propertyName || !description || !timeIn || !timeOut || !date) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const data = [userName, propertyName, description, timeIn, timeOut, date];

    // Append data to Google Sheet
    await appendToSheet(SPREADSHEET_ID, data);

    res.json({ message: 'Form submitted successfully!' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
