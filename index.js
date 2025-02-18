const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const csv = require('fast-csv'); // Ensure fast-csv is imported
const admin = require('firebase-admin');
const dotenv=require('dotenv');
const axios=require("axios")
dotenv.config()
const serviceAccount = JSON.parse(process.env.ADMIN); // Replace with your service account key file

serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

const app = express();

const port =process.env.PORT ;

// JWT secret key
const JWT_SECRET = '6a5b40e021dbe2d3725296ec265434410332ca421bfc1a3f288645357f7311c5'; 

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'iic-d9d44.appspot.com' // Replace with your Firebase Storage bucket
});

const bucket = admin.storage().bucket();

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
    fee: String,
    date: Date,
    image: String,
    rule: String,
    groupSize: Number // New field for group size
});

// Helper function to generate a unique group ID
const generateUniqueId = () => {
    return 'G' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Set up storage for Multer to handle file uploads
const storage = multer.memoryStorage(); // Use memoryStorage to upload files to Firebase
const upload = multer({ storage: storage });

// POST route to upload an event
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const file = req.file;
        const blob = bucket.file(file.originalname);
        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: file.mimetype
            }
        });

        blobStream.on('error', (error) => {
            console.error('Error uploading file to Firebase Storage:', error);
            res.status(500).json({ error: 'Error uploading file' });
        });

        blobStream.on('finish', async () => {
            const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.originalname)}?alt=media`;
            const event = new Event({
                name: req.body.name,
                description: req.body.description,
                fee: req.body.fee,
                date: req.body.date,
                image: publicUrl, // Store the public URL from Firebase Storage
                rule: req.body.rule,
                groupSize: parseInt(req.body.groupSize, 10) // Parse groupSize as integer
            });

            try {
                await event.save();
                res.send('Event added successfully');
            } catch (err) {
                res.status(500).json(err);
            }
        });

        blobStream.end(file.buffer); // Upload the file buffer to Firebase Storage
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
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

// GET route to serve images from Firebase Storage
app.get('/file/:filename', async (req, res) => {
    try {
        const file = bucket.file(req.params.filename);
        const [exists] = await file.exists();
        if (!exists) {
            return res.status(404).json({ error: 'File not found' });
        }

        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(req.params.filename)}?alt=media`;
        res.redirect(publicUrl); // Redirect to the Firebase Storage public URL
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Define Participant model
const Participant = mongoose.model('Participant', {
    name: String,
    email: String,
    phone: String,
    college:String,
    branch: String,
    year: String,
    eventId: String,
    group: String,
    groupId: String // Unique ID for the group
});

// POST route to register participants
app.post('/events/:id/participants', async (req, res) => {
    const { participants } = req.body;
    // console.log(req.body)

    if (!Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ message: 'Invalid participants data' });
    }

    try {
        // Generate a unique group ID for all participants in this request
        const groupId = generateUniqueId();

        // Add the groupId to each participant
        const participantsWithGroupId = participants.map(participant => ({
            ...participant,
            groupId: groupId, // Assign the same groupId to all participants
            eventId: req.params.id
        }));

        // Save all participants in bulk
        const savedParticipants = await Participant.insertMany(participantsWithGroupId);

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

        if (!participants.length) {
            return res.status(404).json({ error: 'No participants found for this event' });
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=participants.csv');

        const csvStream = csv.format({ headers: true });
        csvStream.pipe(res);

        // Group participants by groupId
        const groupedParticipants = participants.reduce((acc, participant) => {
            if (!acc[participant.groupId]) {
                acc[participant.groupId] = { members: [], count: 0 };
            }
            acc[participant.groupId].members.push(participant);
            acc[participant.groupId].count += 1;
            return acc;
        }, {});

        // Write CSV rows
        Object.entries(groupedParticipants).forEach(([groupId, { members, count }]) => {
            // Write group info
            csvStream.write({
                GroupId: groupId,
                MembersCount: count,
                GroupName: '', // Adjust if needed
                Name: '',
                Email: '',
                Phone: '',
                Branch: '',
                Year: ''
            });

            // Write participant info
            members.forEach(participant => {
                csvStream.write({
                    Group_Name: participant.group,
                    Name: participant.name,
                    Email: participant.email,
                    Phone: participant.phone,
                    Branch: participant.branch,
                    Year: participant.year,
                    GroupId: participant.groupId,
                    MembersCount: '' // Leave blank or adjust if needed
                });
            });

            // Add an empty line after each group
            csvStream.write({});
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
            pptUpload: req.file ? req.file.originalname : '', // Save the uploaded file's filename
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
        res.status(500).json({ error: 'Internal server error' });
    }
});

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

        const token = jwt.sign({ id: newUser._id, email: newUser.email, isAdmin: newUser.isAdmin }, JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({ message: 'User registered successfully', token, isAdmin: newUser.isAdmin });
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

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ message: 'Login successful', token, isAdmin: user.isAdmin });
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

app.get('/empty', (req, res) => {
    res.sendStatus(200);
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

setInterval(()=>{
    try {
        const res=axios.get("https://iic-backend-lcp6.onrender.com/empty")
    } catch (error) {
        console.log(error)
    }
},600000)

