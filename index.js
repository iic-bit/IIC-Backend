const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const csv = require('fast-csv');
const admin = require('firebase-admin');
const dotenv=require('dotenv');
const axios=require("axios")
const { google } = require('googleapis');
const stream = require('stream');
dotenv.config()
const serviceAccount = JSON.parse(process.env.FIREBASE);

serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

// setup OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

/////

const app = express();

const port =process.env.PORT ;

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET; 

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'iic-d9d44.appspot.com'
});

const bucket = admin.storage().bucket();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB, {
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

// Define Participant model
const Participant = mongoose.model('Participant', {
    name: String,
    email: String,
    phone: String,
    college: String,
    course:String,
    branch: String,
    year: String,
    eventId: String,
    group: String,
    transactionId: String,
    groupId: String, 
    paymentImage: String  // New field for storing payment image URL
});

const SiteData = mongoose.model('SiteData', {
    notice: String,
    image:String
});

const Notices = mongoose.model('Notices', {
    note: String,
    color:String
});

// Helper function to generate a unique group ID
const generateUniqueId = () => {
    return 'G' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Set up storage for Multer to handle file uploads
const storage = multer.memoryStorage(); // Use memoryStorage to upload files to Firebase
const upload = multer({ storage: storage });

// POST route to upload content on Home
app.post('/uploadsitedata', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;

    // convert buffer to stream
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);

    // upload to drive
    const response = await drive.files.create({
      requestBody: {
        name: file.originalname,
        mimeType: file.mimetype,
      },
      media: {
        mimeType: file.mimetype,
        body: bufferStream,
      },
    });
    const fileId = response.data.id;

    // make public
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const publicUrl = `https://drive.google.com/uc?id=${fileId}`;

    // save event with URL
    const sitedata = new SiteData({
      notice:req.body.notice,
      image:publicUrl
    });

    await sitedata.save();
    res.send('Site Data added successfully');
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST route to upload Notices
app.post("/notice", async (req, res) => {
  try {
    const { note, color } = req.body;
    // Save to MongoDB here
    const notices = new Notices({ note, color });
    await notices.save();
    res.json({ message: "Notice added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/notice",async (req, res)=>{
    try{
        const notices = await Notices.find();
        res.json(notices);
    } catch (error) {
        console.error(error);
    }
})

app.delete("/notice/:id", async (req, res)=>{
    try{
        const notice = await Notices.findByIdAndDelete(req.params.id)
        res.json(notice);
    } catch (error) {
        console.error(error);
    }
})


// POST route to upload an event
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;

    // convert buffer to stream
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);

    // upload to drive
    const response = await drive.files.create({
      requestBody: {
        name: file.originalname,
        mimeType: file.mimetype,
      },
      media: {
        mimeType: file.mimetype,
        body: bufferStream,
      },
    });

    const fileId = response.data.id;

    // make public
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const publicUrl = `https://drive.google.com/uc?id=${fileId}`;

    // save event with URL
    const event = new Event({
      name: req.body.name,
      description: req.body.description,
      fee: req.body.fee,
      date: req.body.date,
      image: publicUrl,
      rule: req.body.rule,
      groupSize: parseInt(req.body.groupSize, 10),
    });

    await event.save();
    res.send('Event added successfully');
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/image/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const driveResponse = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  driveResponse.data.pipe(res);
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
        const fileId = new URL(event.image).searchParams.get('id');

        console.log(fileId)

    // Delete file from Drive
    if (fileId) {
      await drive.files.delete({ fileId });
    }
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
            eventId: req.params.id,
        }))

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
                Group_Name: '', // Adjust if needed
                Name: '',
                Email: '',
                Phone: '',
                College_Name:'',
                Course:'',
                Branch: '',
                Year: '',
                transactionId:''
            });

            // Write participant info
            members.forEach(participant => {
                csvStream.write({
                    Group_Name: participant.group,
                    Name: participant.name,
                    Email: participant.email,
                    Phone: participant.phone,
                    College_Name:participant.college,
                    Course:participant.course,
                    Branch: participant.branch,
                    Year: participant.year,
                    GroupId: participant.groupId,
                    MembersCount: '' ,// Leave blank or adjust if needed
                    transactionId:participant.transactionId
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
        const participants = await Participant.find({ eventId });
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
app.listen(port,'0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});

setInterval(()=>{
    try {
        const res=axios.get("https://iic-backend-5opn.onrender.com/empty")
    } catch (error) {
        console.log(error)
    }
},840000)


