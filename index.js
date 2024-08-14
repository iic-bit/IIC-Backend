const express = require('express');
const app = express();
const port = 8000;
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const fs = require('fs');

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
    rule: String,
    groupSize: Number // New field for group size
});

// POST route to upload an event
app.post('/upload', upload.single('image'), (req, res) => {
    const event = new Event({
        name: req.body.name,
        description: req.body.description,
        date: req.body.date,
        image: req.file ? req.file.filename : '', // Store the filename from multer
        rule: req.body.rule,
        groupSize: parseInt(req.body.groupSize, 10) // Parse groupSize as integer
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
    phone: String,
    branch: String,
    year: String,
    eventId: mongoose.Schema.Types.ObjectId,
    group: String // Add group field
});

// Define the maximum number of participants per group
const MAX_PARTICIPANTS_PER_GROUP = 2;

// POST route to register a group of participants for an event
app.post('/events/:id/participants', async (req, res) => {
    try {
        const { participants } = req.body; // Expecting an array of participant objects
        const eventId = req.params.id;

        // Validate that participants array length matches the group size
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).send('Event not found.');
        }

        if (participants.length !== event.groupSize) {
            return res.status(400).send(`Group size must be ${event.groupSize}.`);
        }

        // Validate that each participant object has required fields
        const validParticipants = participants.every(p => p.name && p.email && p.phone && p.branch && p.year);
        if (!validParticipants) {
            return res.status(400).send('Please fill out all participant details.');
        }

        // Check if the group is valid and not exceeding the limit
        const groupCounts = await Promise.all(participants.map(p =>
            Participant.countDocuments({ eventId, group: p.group })
        ));

        const totalCount = groupCounts.reduce((a, b) => a + b, 0);

        if (totalCount + participants.length > MAX_PARTICIPANTS_PER_GROUP) {
            return res.status(400).send('Group is full. Cannot add more participants.');
        }

        // Register all participants
        await Promise.all(participants.map(p =>
            new Participant({
                name: p.name,
                email: p.email,
                phone: p.phone,
                branch: p.branch,
                year: p.year,
                eventId,
                group: p.group
            }).save()
        ));

        res.send('Participants registered successfully');
    } catch (error) {
        res.status(500).json(error);
    }
});

// Export participants to Excel
app.get('/events/:id/participants/export', async (req, res) => {
    try {
        const participants = await Participant.find({ eventId: req.params.id });
        const worksheetData = [
            ['Name', 'Email', 'Phone', 'Branch', 'Year'], // Header row
            ...participants.map(p => [p.name, p.email, p.phone, p.branch, p.year]) // Participant data
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');

        const filePath = `./participants-${req.params.id}.xlsx`;
        XLSX.writeFile(workbook, filePath);

        // Send the file to the client
        res.download(filePath, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                res.status(500).json(err);
            }
            fs.unlinkSync(filePath); // Delete the file after sending
        });
    } catch (error) {
        res.status(500).json(error);
    }
});

// Start the server
app.listen(port, () => console.log('Server started on port 8000'));
