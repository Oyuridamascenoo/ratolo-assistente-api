const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '../../data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
    seedUsers(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      filename TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Nova conversa',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge(type);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
}

function seedUsers(db) {
  const users = [
    { name: 'Yuri', email: 'yuri', password: 'yuri1234@' },
    { name: 'Raphael', email: 'raphael', password: 'raphael1234@' },
  ];

  for (const u of users) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (!exists) {
      const hash = bcrypt.hashSync(u.password, 10);
      db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), u.name, u.email, hash, Date.now());
      console.log(`  ✓ Usuário criado: ${u.name}`);
    }
  }
}

module.exports = { getDb };
