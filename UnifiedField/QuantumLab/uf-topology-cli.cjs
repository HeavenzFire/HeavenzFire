'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { planTopology } = require('./uf-topology.cjs');

function parseArgs(argv) {
  const args = { input: null, replicationFactor: 2 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--input' && argv[i + 1]) args.input = argv[++i];
    else if (key === '--replication-factor' && argv[i + 1]) {
      const raw = argv[++i];
      if (!/^\d+$/.test(raw)) throw new Error('--replication-factor must be an integer from 1 to 5');
      args.replicationFactor = Number(raw);
    } else if (key === '--help') args.help = true;
    else throw new Error('unknown or incomplete argument: ' + key);
  }
  return args;
}
function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('Usage: node uf-topology-cli.cjs --input <nodes.json> [--replication-factor 1..5]\n');
    process.stdout.write('Reads a node manifest and prints a deterministic PLAN_ONLY topology proposal. No network or replication actions occur.\n');
    return 0;
  }
  if (!args.input) throw new Error('--input is required');
  const file = path.resolve(args.input);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('input must be a regular file');
  if (stat.size > 1024 * 1024) throw new Error('input file exceeds 1 MiB limit');
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.nodes)) {
    throw new Error('input JSON must be an object with a nodes array');
  }
  const result = planTopology(input.nodes, { replicationFactor: args.replicationFactor });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write('topology planner error: ' + error.message + '\n');
    process.exitCode = 2;
  }
}
module.exports = { parseArgs, main };
