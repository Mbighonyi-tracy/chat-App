import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path, { dirname } from 'path';
import bodyParser from 'body-parser';
import multer from 'multer';
import bcrypt from 'bcrypt';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Set __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// User database (for demonstration purposes)
let users = [];

// Load users from db.json function
const loadUsers = () => {
  const dbFilePath = path.join(__dirname, 'data', 'db.json');
  if (!fs.existsSync(dbFilePath)) {
    // Create an empty db.json if it doesn't exist
    fs.writeFileSync(dbFilePath, JSON.stringify([], null, 2));
    console.log('Created empty db.json');
  }
  try {
    const data = fs.readFileSync(dbFilePath, 'utf8');
    users = JSON.parse(data);
    console.log('Loaded users from db.json');
  } catch (error) {
    console.error('Error reading db.json file: ', error);
  }
};

// Load users at startup
loadUsers();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Body parser middleware for parsing form data
app.use(bodyParser.urlencoded({ extended: false }));

// Multer setup for profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Serve signup page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Sign up route
app.post('/signup', upload.single('profileImage'), async (req, res) => {
  const { username, password } = req.body;

  // Check if username already exists
  const existingUser = users.find(user => user.username === username);
  if (existingUser) {
    return res.status(400).send('Username already exists');
  }

  // Hash the password before storing
  const hashedPassword = await bcrypt.hash(password, 10);

  // Save user to database
  const newUser = {
    username,
    password: hashedPassword,
    profileImage: req.file ? req.file.filename : null
  };
  users.push(newUser);

  // Save users to db.json
  try {
    const dbFilePath = path.join(__dirname, 'data', 'db.json');
    fs.writeFileSync(dbFilePath, JSON.stringify(users, null, 2)); // Update db.json
    console.log('User saved to db.json');
  } catch (error) {
    console.error('Error saving to db.json: ', error);
    return res.status(500).send('Error saving user data');
  }

  res.redirect('/login');
});

// Log in route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Load users from db.json before login attempt
  loadUsers();

  // Find user in database
  const user = users.find(user => user.username === username);

  if (user) {
    // Compare passwords
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (isValidPassword) {
      // Redirect to chat app
      res.redirect('/chat');
    } else {
      res.status(401).send('Invalid password');
    }
  } else {
    res.status(401).send('User not found');
  }
});

// Chat app route
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Socket.io setup for real-time messaging
io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle private messaging
  socket.on('privateMessage', ({ sender, receiver, message }) => {
    io.to(receiver).emit('privateMessage', { sender, message });
  });

  // Handle room creation
  socket.on('createRoom', (roomName) => {
    socket.join(roomName);
    io.to(roomName).emit('roomMessage', `User ${socket.id} joined the room`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});