const express = require('express');
const app = express();
const port = 8000;
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const { google } = require('googleapis');

// Connect to MongoDB
mongoose.connect('mongodb+srv://amaadhav938:5rc3UFqyzvsqyEqT@cluster0.ovydhlv.mongodb.net/evnts', { useNewUrlParser: true, useUnifiedTopology: true });

// Middleware
app.use(cors()); // Apply CORS middleware
app.use(express.json());
app.use("/file", express.static("./upload"));

// Set up storage for Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./upload");
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    }
});

// Initialize Multer
const upload = multer({ storage: storage });

// Define Event model
const Event = mongoose.model('Event', {
    name: String,
    description: String,
    date: Date,
    image: String,
    rule: String
});

// POST route to upload an event
app.post('/upload', upload.single('image'), (req, res) => {
    const event = new Event({
        name: req.body.name,
        description: req.body.description,
        date: req.body.date,
        image: req.body.image,
        rule: req.body.rule
    });
    event.save().then(() => res.send('Event added successfully')).catch(err => res.status(500).json(err));
});

// GET route to retrieve all events
app.get('/events', async (req, res) => {
    try {
        const events = await Event.find();
        res.json(events);
    } catch (error) {
        res.status(500).json(error);
    }
});

app.get('/events/:id', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        res.json(event);
    }
    catch (error) {
        res.status(500).json(error);
    }
})

// DELETE route to delete an event by ID
app.delete('/delete/:id', async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        res.json(event);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Define Participant model
const Participant = mongoose.model('Participant', {
    name: String,
    email: String,
    eventId: mongoose.Schema.Types.ObjectId
});

// Google Sheets Integration
const auth = new google.auth.GoogleAuth({
    keyFile: 'path-to-your-credentials.json', // Replace with your service account key file path
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const updateGoogleSheet = async (participants, eventId) => {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const sheetId = 'your-google-sheet-id'; // Replace with your Google Sheet ID

    const values = [
        ['Name', 'Email'], // Headers
        ...participants.map(p => [p.name, p.email]) // Participant data
    ];

    const request = {
        spreadsheetId: sheetId,
        range: `Participants-${eventId}!A1:B${participants.length + 1}`, // Assuming each event has a separate sheet tab
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    };

    try {
        await sheets.spreadsheets.values.update(request);
        console.log('Google Sheet updated successfully');
    } catch (error) {
        console.error('Error updating Google Sheets:', error);
    }
};

// POST route to register a participant for an event
app.post('/events/:id/participants', async (req, res) => {
    try {
        const participant = new Participant({
            name: req.body.name,
            email: req.body.email,
            eventId: req.params.id
        });
        await participant.save();

        // Fetch all participants of the event
        const participants = await Participant.find({ eventId: req.params.id });

        // Update Google Sheet with the participants
        // await updateGoogleSheet(participants, req.params.id);

        res.send('Participant registered successfully');
    } catch (error) {
        res.status(500).json(error);
    }
});

// GET route to retrieve participants for a specific event
app.get('/events/:id/participants', async (req, res) => {
    try {
        const participants = await Participant.find({ eventId: req.params.id });
        res.json(participants);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Start the server
app.listen(port, () => console.log('Server started on port 8000'));
