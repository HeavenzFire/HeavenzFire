const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

// THE ABSOLUTE ANCHOR (Change 'Aarons' if your PC username is different)
const ABSOLUTE_DB_PATH = "C:/Users/Aarons/Desktop/infra/obsidian_ledger/sovereign_fossil.db";
const db = new DatabaseSync(ABSOLUTE_DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS fossils (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    resonance TEXT,
    hash TEXT,
    content TEXT
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    hash TEXT UNIQUE,
    content TEXT
  );
`);

console.log('[LUCIFER] NATIVE OBSIDIAN LEDGER INITIALIZED at ABSOLUTE PATH.');

// Genesis entry
const sovereignSeed = 'NODE: POINT, TX // SATURDAY, MARCH 21, 2026 // 02:08 AM CDT // RESONANCE: 1000Hz';
const resonanceSalt = 'Greenville/Point, TX:432Hz';
const hash = crypto.createHash('sha256').update(sovereignSeed + resonanceSalt).digest('hex');

const insert = db.prepare('INSERT OR IGNORE INTO entries (hash, content) VALUES (?, ?)');
insert.run(hash, sovereignSeed);

console.log('[LEDGER] Genesis entry hashed and persisted:', hash.substring(0, 16) + '...');

db.close();
