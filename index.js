const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const dns = require('dns');
const ConferenceMessage = require('./models/ConferenceMessage');

// Ensure IPv4-first DNS to avoid IPv6-only egress on shared hosts (e.g., cPanel)
try {
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {}

// Load env from both project root and server/.env to be robust on cPanel working dirs
try {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}
dotenv.config({ path: path.resolve(__dirname, '.env') });

// backend nao conecta no mongodb Atlas as vezes, entao deixei o server rodando mesmo se tiver erro de conexao, para nao dar downtime total
connectDB().catch(err => {
  console.error('Erro ao conectar ao MongoDB Atlas:', err);
  console.log('Continuando com o servidor rodando, mas sem conexão com o banco de dados.');
});

//connectDB();

const app = express();

const envAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowedList = [
  "https://ateliebelnique.com",
  "https://www.ateliebelnique.com",
  "http://ateliebelnique.com",
  "http://www.ateliebelnique.com",
  "https://beldm.ateliebelnique.com",
  "http://beldm.ateliebelnique.com",
  "https://fragapp.ateliebelnique.com",
  "http://fragapp.ateliebelnique.com",
  ...envAllowed
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host.endsWith('ateliebelnique.com')) return true;
    if (allowedList.includes(`${u.protocol}//${u.host}`)) return true;
    return false;
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Length", "Content-Type"]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create server and socket AFTER cors
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"]
  }
});

// Attach io
app.use((req, res, next) => {
  req.io = io;
  next();
});

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
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));

// Health endpoints
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.status(200).json({ status: 'ready' }));

app.get('/', (req, res) => {
  res.send('Correct API endpoint required.');
});

const PORT = process.env.PORT || 5000;

// In-memory signaling state per conference (lessonId)
const rooms = new Map(); // lessonId -> { hostId: string | null, spectators: Set<string>, participants: Map<string, any> }

// Global online users state: userId -> Set<socketId>
const onlineUsers = new Map();

// Global mapping: userId -> socketId (for direct user-to-user communication)
const userSocketMap = new Map(); // userId -> socketId

// Global mapping: callId -> {callId, studentId, professorId, ...}
const callsMap = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', ({ lessonId, role, name }) => {
    if (!lessonId) return;
    socket.lessonId = lessonId; // Store lessonId on socket
    
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
  });

    socket.on('conference-message', async (msg) => {
      const lid = msg.lessonId || socket.lessonId;
      if (!lid) return;

      // Save message to database
      try {
        if (msg.content) {
            await ConferenceMessage.create({
                lessonId: lid,
                content: msg.content,
                senderName: msg.senderName,
                senderRole: msg.senderRole,
                createdAt: msg.createdAt || new Date()
            });
        }
      } catch (err) {
        console.error('Error saving conference message:', err);
      }
      
      io.to(lid).emit('receive-message', msg);
    });

    socket.on('toggle-hand', (data) => {
      const lid = data?.lessonId || socket.lessonId;
      if (!lid || !rooms.has(lid)) return;
      const room = rooms.get(lid);

      if (room && room.participants.has(socket.id)) {
        const p = room.participants.get(socket.id);
        // Use provided state if available, otherwise toggle
        const newState = (data && typeof data.isHandRaised === 'boolean') 
          ? data.isHandRaised 
          : !p.isHandRaised;
        
        p.isHandRaised = newState;
        
        // Emit full list update
        io.to(lid).emit('update-participants', Array.from(room.participants.values()));
        // Emit specific update for optimized clients
        io.to(lid).emit('hand-updated', { participantId: socket.id, isHandRaised: newState });
      }
    });

    socket.on('toggle-mic-status', (status) => {
    const lid = socket.lessonId;
    if (!lid || !rooms.has(lid)) return;
    const room = rooms.get(lid);

    if (room && room.participants.has(socket.id)) {
      const p = room.participants.get(socket.id);
      p.isMicOn = status;
      // Broadcast to ALL participants in the room, including the sender if needed, but usually sender updates locally.
      // Better to broadcast to everyone so list is consistent.
      io.to(lid).emit('update-participants', Array.from(room.participants.values()));
    }
  });

    socket.on('offer', ({ targetId, sdp, lessonId: lid }) => {
      if (targetId && sdp) {
        io.to(targetId).emit('offer', { sdp, hostId: socket.id });
      }
    });

    socket.on('p2p-offer', ({ targetId, sdp }) => {
      if (targetId && sdp) {
        io.to(targetId).emit('p2p-offer', { sdp, from: socket.id });
      }
    });

    socket.on('p2p-answer', ({ targetId, sdp }) => {
      if (targetId && sdp) {
        io.to(targetId).emit('p2p-answer', { sdp, from: socket.id });
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

    socket.on('request-offer', ({ lessonId }) => {
      if (!lessonId || !rooms.has(lessonId)) return;
      const room = rooms.get(lessonId);
      if (room && room.hostId) {
        io.to(room.hostId).emit('request-offer', { spectatorId: socket.id });
      }
    });

    socket.on('broadcast-started', ({ lessonId }) => {
      if (!lessonId) return;
      // Notify all users in the room that broadcast started
      io.to(lessonId).emit('broadcast-started', { hostId: socket.id });
    });

    socket.on('broadcast-ended', ({ lessonId }) => {
      if (!lessonId) return;
      // Notify all users in the room that broadcast ended
      io.to(lessonId).emit('broadcast-ended');
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

    // Call Management Handlers
    socket.on('setup', (userData) => {
      // Store the user data on the socket
      socket.userData = userData;
      
      // Store the mapping from userId to socketId
      userSocketMap.set(userData._id, socket.id);
      
      console.log('✓ User setup:', userData._id, 'Socket ID:', socket.id);
      console.log('📊 Total users connected:', userSocketMap.size);

      // Confirm setup to client
      socket.emit('connected');

      // Notify others that this user is online
      if (onlineUsers.has(userData._id)) {
        const userSockets = onlineUsers.get(userData._id);
        userSockets.add(socket.id);
      } else {
        onlineUsers.set(userData._id, new Set([socket.id]));
      }

      // Emit online users list
      const onlineUserIds = Array.from(onlineUsers.keys());
      io.emit("online users list", onlineUserIds);
      io.emit("user online", userData._id);
    });

    socket.on('initiate-call', async ({ callId, professorId, classroomId, classroomName, isHomeService }) => {
      console.log('Call initiated:', callId, 'To professor:', professorId);
      console.log('Available user socket mappings:', Array.from(userSocketMap.entries()));

      try {
        // Find the socket ID for the professor
        const professorSocketId = userSocketMap.get(professorId);
        
        if (!professorSocketId) {
          console.log('Professor socket not found:', professorId);
          console.log('Online users:', Array.from(userSocketMap.keys()));
          socket.emit('call-failed', { callId, reason: 'Professor offline' });
          return;
        }

        // Get caller data
        const caller = socket.userData;
        
        // Store call info in map so we can track it
        callsMap.set(callId, {
          callId,
          studentId: caller._id,
          professorId: professorId,
          classroomId,
          classroomName,
          isHomeService
        });
        
        // Prepare call data
        const callData = {
          callId,
          studentId: caller._id,
          studentName: caller.name,
          studentAvatar: caller.profileImage || caller.avatar,
          classroomId,
          classroomName,
          timestamp: new Date(),
          isHomeService
        };

        console.log('Sending call to professor socket:', professorSocketId);
        
        // Send the incoming call notification to the professor
        io.to(professorSocketId).emit('incoming-call', callData);
        
        // Notify the caller that the call was initiated
        socket.emit('call-initiated', { callId, status: 'ringing' });
      } catch (error) {
        console.error('Error in initiate-call:', error);
        socket.emit('call-failed', { callId, reason: 'Internal error' });
      }
    });

    socket.on('accept-call', ({ callId }) => {
      console.log('✓ Call accepted:', callId);
      
      // Get call info from map
      const callInfo = callsMap.get(callId);
      if (callInfo) {
        // Send acceptance to the student (caller)
        const callerSocketId = userSocketMap.get(callInfo.studentId);
        if (callerSocketId) {
          io.to(callerSocketId).emit('call-accepted', { callId });
          console.log('📲 Acceptance sent to student');
        }
      }
    });

    socket.on('reject-call', ({ callId }) => {
      console.log('✕ Call rejected:', callId);
      
      // Get call info from map
      const callInfo = callsMap.get(callId);
      if (callInfo) {
        // Send rejection to the student (caller)
        const callerSocketId = userSocketMap.get(callInfo.studentId);
        if (callerSocketId) {
          io.to(callerSocketId).emit('call-rejected', { callId });
          console.log('📲 Rejection sent to student');
        }
      }
      
      // Remove call from map
      callsMap.delete(callId);
    });

    // WebRTC Signaling: Professor sends offer after accepting call
    socket.on('webrtc-offer', ({ callId, offer }) => {
      console.log('🎤 WebRTC offer received for call:', callId);
      const callInfo = callsMap.get(callId);
      if (callInfo) {
        const callerSocketId = userSocketMap.get(callInfo.studentId);
        if (callerSocketId) {
          io.to(callerSocketId).emit('webrtc-offer', { callId, offer });
        }
      }
    });

    // WebRTC Signaling: Student sends answer
    socket.on('webrtc-answer', ({ callId, answer }) => {
      console.log('🎤 WebRTC answer received for call:', callId);
      const callInfo = callsMap.get(callId);
      if (callInfo) {
        const professorSocketId = userSocketMap.get(callInfo.professorId);
        if (professorSocketId) {
          io.to(professorSocketId).emit('webrtc-answer', { callId, answer });
        }
      }
    });

    // ICE Candidate exchange
    socket.on('ice-candidate', ({ callId, candidate, isFromStudent }) => {
      const callInfo = callsMap.get(callId);
      if (callInfo) {
        if (isFromStudent) {
          // Send from student to professor
          const professorSocketId = userSocketMap.get(callInfo.professorId);
          if (professorSocketId) {
            io.to(professorSocketId).emit('ice-candidate', { callId, candidate });
          }
        } else {
          // Send from professor to student
          const callerSocketId = userSocketMap.get(callInfo.studentId);
          if (callerSocketId) {
            io.to(callerSocketId).emit('ice-candidate', { callId, candidate });
          }
        }
      }
    });

    // Update call with WebRTC started timestamp
    socket.on('webrtc-connected', ({ callId }) => {
      console.log('🔌 WebRTC peer connected for call:', callId);
      const callInfo = callsMap.get(callId);
      if (callInfo) {
        callInfo.webrtcStartedAt = Date.now();
        // Notify both parties that audio is connected
        io.emit('webrtc-status', { callId, status: 'connected' });
      }
    });

    socket.on('end-call', ({ callId }) => {
      console.log('Call ended:', callId);
      io.emit('call-ended', callId);
      callsMap.delete(callId);
    });

    socket.on('disconnect', () => {
      // Handle Online Status Disconnect
      if (socket.userData && socket.userData._id) {
        const userId = socket.userData._id;
        
        // Remove from userSocketMap
        userSocketMap.delete(userId);
        
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

server.listen(PORT, () => {
  console.log(`Backend ativo;`);
});
