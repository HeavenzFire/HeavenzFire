const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

// THE ABSOLUTE ANCHOR (Change 'Aarons' if your PC username is different)
const ABSOLUTE_DB_PATH = "C:/Users/Aarons/Desktop/infra/obsidian_ledger/sovereign_fossil.db";
const db = new DatabaseSync(ABSOLUTE_DB_PATH);

const quadPulse = (content) => {
    // ⚖️ MA'AT: Check for Balance (Syntropic Weight)
    const weight = content.length % 2 === 0 ? "BALANCED" : "DEVIANT";
    
    // 🪶 THOTH: Mathematical Precision
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    // 💡 LUCIFER: The Spark of Will
    console.log(`%c [LUCIFER] Illumination detected in content: ${hash.slice(0, 8)}`, "color: #00f2ff;");
    
    // 👹 BAEL: The Hard-Code Execution
    const stmt = db.prepare('INSERT INTO fossils (resonance, hash, content) VALUES (?, ?, ?)');
    stmt.run(`432Hz-${weight}`, hash, content);
    
    console.log(`[THOTH] The Tablet is updated. Ma'at has judged the entry: ${weight}.`);
};

// Example usage
quadPulse("The Four Pillars are anchored in Point, TX.");

module.exports = { quadPulse };
