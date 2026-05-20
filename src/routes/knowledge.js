const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();
const now = () => Date.now();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Tipo de arquivo não suportado'));
  },
});

// List all knowledge items
router.get('/', (req, res) => {
  const db = getDb();
  const items = db.prepare(
    'SELECT * FROM knowledge ORDER BY updated_at DESC'
  ).all();
  res.json(items);
});

// Get single item
router.get('/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Create text knowledge
router.post('/', (req, res) => {
  const { title, content } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  const db = getDb();
  const id = uuidv4();
  const t = now();
  db.prepare(
    'INSERT INTO knowledge (id, title, content, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title.trim(), content.trim(), 'text', t, t);

  res.status(201).json(db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id));
});

// Update knowledge item
router.put('/:id', (req, res) => {
  const { title, content } = req.body;
  const db = getDb();
  const item = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const t = now();
  db.prepare(
    'UPDATE knowledge SET title = ?, content = ?, updated_at = ? WHERE id = ?'
  ).run(
    title?.trim() ?? item.title,
    content?.trim() ?? item.content,
    t,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM knowledge WHERE id = ?').get(req.params.id));
});

// Delete knowledge item
router.delete('/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  // Remove file if it's an upload
  if (item.filename) {
    const filePath = path.join(__dirname, '../../uploads', item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM knowledge WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Upload file (PDF, TXT, MD, CSV)
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { title } = req.body;
  const db = getDb();
  const id = uuidv4();
  const t = now();
  const itemTitle = title?.trim() || path.basename(req.file.originalname, path.extname(req.file.originalname));

  // Read text content for indexing
  let content = `[Arquivo: ${req.file.originalname}]`;
  if (req.file.mimetype === 'text/plain' || ['.txt', '.md', '.csv'].includes(path.extname(req.file.originalname).toLowerCase())) {
    try {
      content = fs.readFileSync(req.file.path, 'utf-8').slice(0, 50000);
    } catch {}
  }

  db.prepare(
    'INSERT INTO knowledge (id, title, content, type, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, itemTitle, content, 'file', req.file.filename, t, t);

  res.status(201).json(db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id));
});

module.exports = router;
