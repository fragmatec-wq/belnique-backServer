const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB(); 

const app = express();
const http = require('http');
const { Server } = require('socket.io');

const path = require('path');
 
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/content', require('./routes/contentRoutes'));
app.use('/api/library', require('./routes/libraryRoutes'));
app.use('/api/networking', require('./routes/networkingRoutes'));
app.use('/api/gallery', require('./routes/galleryRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/blog', require('./routes/blogRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/classrooms', require('./routes/classroomRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/conference', require('./routes/conferenceRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Placeholder routes for others (to be implemented fully)
// app.use('/api/events', require('./routes/eventRoutes'));
// app.use('/api/artworks', require('./routes/artworkRoutes'));

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
 
// In-memory signaling state per conference (lessonId)
const rooms = new Map(); // lessonId -> { hostId: string | null, spectators: Set<string>, participants: Map<string, any> }

// Global online users state: userId -> Set<socketId>
const onlineUsers = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', ({ lessonId, role, name }) => {
    if (!lessonId) return;
    if (!rooms.has(lessonId)) {
      rooms.set(lessonId, { hostId: null, spectators: new Set(), participants: new Map() });
    }
    const room = rooms.get(lessonId);
    socket.join(lessonId);

    // Update participants list
    const participant = {
      id: socket.id,
      name,
      role,
      isHandRaised: false,
      isMicOn: false
    };
    room.participants.set(socket.id, participant);
    io.to(lessonId).emit('update-participants', Array.from(room.participants.values()));

    if (role === 'professor' || role === 'event-host') {
      room.hostId = socket.id;
      io.to(lessonId).emit('host-ready', { hostId: socket.id });
    } else {
      room.spectators.add(socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit('spectator-joined', { spectatorId: socket.id, name });
      }
    }

    socket.on('conference-message', (msg) => {
      io.to(lessonId).emit('receive-message', msg);
    });

    socket.on('toggle-hand', (data) => {
      if (room && room.participants.has(socket.id)) {
        const p = room.participants.get(socket.id);
        // Use provided state if available, otherwise toggle
        const newState = (data && typeof data.isHandRaised === 'boolean') 
          ? data.isHandRaised 
          : !p.isHandRaised;
        
        p.isHandRaised = newState;
        
        // Emit full list update
        io.to(lessonId).emit('update-participants', Array.from(room.participants.values()));
        // Emit specific update for optimized clients
        io.to(lessonId).emit('hand-updated', { participantId: socket.id, isHandRaised: newState });
      }
    });

    socket.on('toggle-mic-status', (status) => {
      if (room && room.participants.has(socket.id)) {
        const p = room.participants.get(socket.id);
        p.isMicOn = status;
        io.to(lessonId).emit('update-participants', Array.from(room.participants.values()));
      }
    });

    socket.on('offer', ({ targetId, sdp, lessonId: lid }) => {
      if (targetId && sdp) {
        io.to(targetId).emit('offer', { sdp, hostId: socket.id });
      }
    });

    socket.on('answer', ({ targetId, sdp }) => {
      if (targetId && sdp) {
        io.to(targetId).emit('answer', { sdp, spectatorId: socket.id });
      }
    });

    socket.on('ice-candidate', ({ targetId, candidate }) => {
      if (targetId && candidate) {
        io.to(targetId).emit('ice-candidate', { candidate, from: socket.id });
      }
    });

    // --- Chat Logic (Global) ---
    socket.on("setup", (userData) => {
      if (userData && userData._id) {
        socket.join(userData._id);
        socket.userData = userData; // Store user data on socket for disconnect handling
        
        console.log(`User setup: ${userData.name} (${userData._id}) - Socket ID: ${socket.id}`);

        // Handle Online Status
        if (!onlineUsers.has(userData._id)) {
          onlineUsers.set(userData._id, new Set());
        }
        onlineUsers.get(userData._id).add(socket.id);
        
        // Emit user online to all clients
        io.emit("user online", userData._id);
        
        // Send current online users list to this client
        const onlineList = Array.from(onlineUsers.keys());
        socket.emit("online users list", onlineList);

        socket.emit("connected");
      } else {
          console.log("Setup attempted with invalid user data", userData);
      }
    });

    socket.on("join chat", (room) => {
      socket.join(room);
      console.log("User Joined Room: " + room);
    });

    socket.on("typing", (room) => socket.in(room).emit("typing"));
    socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

    socket.on("new message", (newMessageRecieved) => {
      var conversation = newMessageRecieved.conversation;

      if (!conversation || !conversation.participants) {
          console.log("Socket: New message missing conversation or participants", newMessageRecieved);
          return;
      }
      
      console.log("Socket: Broadcasting new message to participants:", conversation.participants.length);

      conversation.participants.forEach((participant) => {
        const participantId = participant._id || participant;
        if (participantId == newMessageRecieved.author._id) return;

        console.log("Socket: Emitting to", participantId);
        socket.in(participantId).emit("message recieved", newMessageRecieved);
      });
    });
    // ------------------

    socket.on('disconnect', () => {
      // Handle Online Status Disconnect
      if (socket.userData && socket.userData._id) {
        const userId = socket.userData._id;
        if (onlineUsers.has(userId)) {
          const userSockets = onlineUsers.get(userId);
          userSockets.delete(socket.id);
          
          if (userSockets.size === 0) {
            onlineUsers.delete(userId);
            io.emit("user offline", userId);
          }
        }
      }

      rooms.forEach((room, lid) => {
        if (room.participants.has(socket.id)) {
          room.participants.delete(socket.id);
          io.to(lid).emit('update-participants', Array.from(room.participants.values()));
        }

        if (room.hostId === socket.id) {
          room.hostId = null;
          io.to(lid).emit('host-left');
        }
        if (room.spectators.has(socket.id)) {
          room.spectators.delete(socket.id);
          if (room.hostId) io.to(room.hostId).emit('spectator-left', { spectatorId: socket.id });
        }
        if (!room.hostId && room.spectators.size === 0 && room.participants.size === 0) {
          rooms.delete(lid);
        }
      });
    });
  }); 
}); 

server.listen(PORT, () => {
  console.log(`Servidor ativo com Socket.io na porta ${PORT}`);
});
