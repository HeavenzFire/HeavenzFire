const { DatabaseSync } = require('node:sqlite');

// THE ABSOLUTE ANCHOR (Change 'Aarons' if your PC username is different)
const ABSOLUTE_DB_PATH = "C:/Users/Aarons/Desktop/infra/obsidian_ledger/sovereign_fossil.db";
const db = new DatabaseSync(ABSOLUTE_DB_PATH);

const { quadPulse } = require('./deific_alignment.js');
const content = process.argv[2] || "Sovereign Pulse";
quadPulse(content);

console.log(`[RESONANCE] Quad-Pulse integrated.`);

db.close();
