'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { generateEd25519KeyPair, signApproval } = require('./ed25519-approval-broker.cjs');

function writeNew(file, data, mode) {
  const fd = fs.openSync(file, 'wx', mode);
  try { fs.writeFileSync(fd, data, 'utf8'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function main(argv) {
  const [command, ...args] = argv;
  if (command === 'keygen') {
    const dir = path.resolve(args[0] || '.');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const keys = generateEd25519KeyPair();
    writeNew(path.join(dir, 'approval-private.pem'), keys.privateKey, 0o600);
    writeNew(path.join(dir, 'approval-public.pem'), keys.publicKey, 0o644);
    process.stdout.write(JSON.stringify({ publicKey: path.join(dir, 'approval-public.pem'), privateKey: path.join(dir, 'approval-private.pem'), warning: 'Keep the private key outside the repository and restrict its Windows ACL to the approving operator.' }) + '\n');
    return;
  }
  if (command === 'sign') {
    const [privateKeyPath, requestPath, outputPath] = args;
    if (!privateKeyPath || !requestPath || !outputPath) throw new Error('usage: approval-cli.cjs sign <private-key.pem> <request.json> <output.json>');
    const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const evidence = signApproval({
      privateKey,
      action: request.action,
      subject: request.subject,
      approvedBy: request.approvedBy,
      reason: request.reason,
      ttlMs: request.ttlMs
    });
    writeNew(path.resolve(outputPath), JSON.stringify(evidence, null, 2) + '\n', 0o600);
    process.stdout.write('Signed approval written to ' + path.resolve(outputPath) + '\n');
    return;
  }
  throw new Error('usage: approval-cli.cjs keygen <directory> | sign <private-key.pem> <request.json> <output.json>');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; }
}
module.exports = { main };
