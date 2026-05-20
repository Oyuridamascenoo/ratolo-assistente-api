require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const chatRoutes = require('./src/routes/chat');
const knowledgeRoutes = require('./src/routes/knowledge');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow frontend origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const key = process.env.CLAUDE_API_KEY || '';
  const hasRealKey = key.startsWith('sk-ant-');
  res.json({
    status: 'ok',
    aiMode: hasRealKey ? 'claude' : 'mock',
    timestamp: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const server = app.listen(PORT, () => {
  const key = process.env.CLAUDE_API_KEY || '';
  const hasRealKey = key.startsWith('sk-ant-');
  console.log(`\n🚀 Assistente Técnico API rodando em http://localhost:${PORT}`);
  console.log(`   Modo IA: ${hasRealKey ? '✅ Claude API conectada' : '⚠️  Mock (configure CLAUDE_API_KEY para ativar IA real)'}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Porta ${PORT} já está em uso. Feche o outro processo e tente novamente.\n`);
  } else {
    console.error(`\n❌ Erro ao iniciar servidor: ${err.message}\n`);
  }
  process.exit(1);
});
