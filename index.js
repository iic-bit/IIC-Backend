const express = require('express');
const app = express();
const port = 8000;
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');

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

// DELETE route to delete an event by ID
app.delete('/delete/:id', async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        res.json(event);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Start the server
app.listen(port, () => console.log('Server started on port 8000'));
