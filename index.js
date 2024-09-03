const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const csv = require('fast-csv'); // Ensure fast-csv is imported

const app = express();
const port = 8000;

// JWT secret key
const JWT_SECRET = '6a5b40e021dbe2d3725296ec265434410332ca421bfc1a3f288645357f7311c5'; 

// Connect to MongoDB
mongoose.connect('mongodb+srv://amaadhav938:5rc3UFqyzvsqyEqT@cluster0.ovydhlv.mongodb.net/evnts', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Middleware to handle JSON and form-data requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Define Event model
const Event = mongoose.model('Event', {
    name: String,
    description: String,
    date: Date,
    image: String,
    rule: String,
    groupSize: Number // New field for group size
});

// Set up storage for Multer to handle file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./upload");
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

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

// GET route to retrieve a single event by ID
app.get('/events/:id', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        res.json(event);
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

// GET route to serve images
app.get("/file/:filename", (req, res) => {
    const filePath = path.join(__dirname, "upload", req.params.filename);
    res.sendFile(filePath);
});

// Define Participant model
const Participant = mongoose.model('Participant', {
    name: String,
    email: String,
    phone: String,
    branch: String,
    year: String,
    eventId: String,
    group: String
});

// POST route to register participants
app.post('/events/:id/participants', async (req, res) => {
    const  participat = new Participant({
        name:req.body.name,
        email:req.body.email,
        phone:req.body.phone,
        branch:req.body.branch,
        year:req.body.year,
        eventId:req.params.id,
        group:req.body.group
});
    
    try {
      // Assuming you have a model and DB setup to save participants
      // Save all participants in bulk
      const savedParticipants = await Participant.insertMany(participat);
  
      res.status(200).json({ message: "Participants registered successfully", data: savedParticipants });
    } catch (error) {
      console.error("Error registering participants:", error);
      res.status(500).json({ message: "Error registering participants" });
    }
  });
  // New route to download participants as CSV
app.get('/events/:id/participants/download', async (req, res) => {
    try {
        const eventId = req.params.id;
        const participants = await Participant.find({ eventId });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=participants.csv');

        const csvStream = csv.format({ headers: true });
        csvStream.pipe(res);

        participants.forEach(participant => {
            csvStream.write({
                Name: participant.name,
                Email: participant.email,
                Phone: participant.phone,
                Branch: participant.branch,
                Year: participant.year,
                Group: participant.group
            });
        });

        csvStream.end();
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/events/:id/participants', async (req, res) => {
    try {
      const eventId = req.params.id;
      const participants = await Participant.find({ eventId }); // Assuming Participant is your model
      res.json(participants);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
// Define the Idea model
const Idea = mongoose.model('Idea', {
    ideaname: String,
    name: String,
    email: String,
    phone: String,
    branch: String,
    year: String,
    no: String,
    idea: String,
    description: String,
    proto: String,
    pptUpload: String,
    date: { type: Date, default: Date.now }
});

// POST route to submit idea
app.post('/idea', upload.single('pptUpload'), async (req, res) => {
    try {
        const ideaData = {
            ideaname: req.body.ideaname,
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone,
            branch: req.body.branch,
            year: req.body.year,
            no: req.body.no,
            idea: req.body.idea,
            description: req.body.description, // Added description
            proto: req.body.proto,
            pptUpload: req.file ? req.file.filename : '', // Save the uploaded file's filename
        };

        const idea = new Idea(ideaData);
        await idea.save();
        res.status(201).json({ message: 'Idea submitted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/idea', async (req, res) => {
    try {
        const ideas = await Idea.find();
        res.json(ideas);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
        }
})

// Define User model
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    phone: String,
    branch: String,
    year: String,
    isAdmin: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// Register route
app.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, branch, year } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword, phone, branch, year });
        await newUser.save();

        const token = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({ message: 'User registered successfully', token });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware for protected routes
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        const verified = jwt.verify(token.split(' ')[1], JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid token' });
    }
};

// Protected route example
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'You are accessing a protected route!' });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
