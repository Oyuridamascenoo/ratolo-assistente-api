const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { getAIResponse } = require('../services/ai');

const router = express.Router();
const now = () => Date.now();

// List all sessions
router.get('/sessions', (req, res) => {
  const db = getDb();
  const sessions = db.prepare(
    'SELECT * FROM chat_sessions ORDER BY updated_at DESC'
  ).all();
  res.json(sessions);
});

// Create session
router.post('/sessions', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const t = now();
  db.prepare(
    'INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, 'Nova conversa', t, t);
  res.status(201).json(db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id));
});

// Delete session
router.delete('/sessions/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Get messages for a session
router.get('/sessions/:id/messages', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const messages = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json({ session, messages });
});

// Send message
router.post('/sessions/:id/messages', async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  const db = getDb();
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Save user message
  const userMsgId = uuidv4();
  const t = now();
  db.prepare(
    'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userMsgId, req.params.id, 'user', content.trim(), t);

  // Update session title from first user message
  const msgCount = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND role = ?'
  ).get(req.params.id, 'user');
  if (msgCount.count === 1) {
    const title = content.trim().length > 40
      ? content.trim().slice(0, 40) + '…'
      : content.trim();
    db.prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, t, req.params.id);
  } else {
    db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(t, req.params.id);
  }

  // Get AI response
  let assistantText;
  try {
    assistantText = await getAIResponse(req.params.id, content.trim());
  } catch (err) {
    console.error('AI error:', err.message);
    assistantText = 'Erro ao processar resposta. Tente novamente.';
  }

  // Save assistant message
  const asstMsgId = uuidv4();
  const t2 = now();
  db.prepare(
    'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(asstMsgId, req.params.id, 'assistant', assistantText, t2);

  res.json({
    userMessage: { id: userMsgId, role: 'user', content: content.trim(), created_at: t },
    assistantMessage: { id: asstMsgId, role: 'assistant', content: assistantText, created_at: t2 },
  });
});

module.exports = router;
