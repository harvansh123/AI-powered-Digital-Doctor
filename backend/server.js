// ─── SERVER.JS — Main Express Application ──────────────────────
const express       = require('express');
const http          = require('http');
const socketIo      = require('socket.io');
const mongoose      = require('mongoose');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const rateLimit     = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT']
  }
});

// Expose io object to all routes
app.set('io', io);

// Handle socket connections
io.on('connection', (socket) => {
  console.log('⚡ Client connected to socket:', socket.id);
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// ─── Security & Middleware ────────────────────────────────────
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://127.0.0.1:5500',   // Live Server
    'http://localhost:5500',
    'null',                     // file:// protocol
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ─── Database Connection ──────────────────────────────────────
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-digital-doctor');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('⚠️  Running in offline mode — some features may be limited');
  }
};
connectDB();

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/doctor',        require('./routes/doctor'));
app.use('/api',               require('./routes/symptoms'));
app.use('/api',               require('./routes/appointments'));
app.use('/api',               require('./routes/hospitals'));
app.use('/api',               require('./routes/blood'));

// ─── Health Check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏥 AI Digital Doctor API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth/register | /api/auth/login | /api/auth/me',
      symptoms: 'POST /api/symptom-analysis',
      appointments: 'GET/POST /api/appointments | GET /api/doctors',
      hospitals: 'GET /api/get-hospitals',
      blood: 'GET/POST /api/blood-donors | POST /api/blood-request',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 Handler ──────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 AI Digital Doctor Server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`📚 API Docs: http://localhost:${PORT}/\n`);
});

module.exports = { app, server };
