'use strict';

const dns = require('node:dns').promises;
const tls = require('node:tls');
const https = require('node:https');
const net = require('node:net');
const { validateScanRequest } = require('./scope-policy.cjs');
const { appendEvidence } = require('../FieldCore/evidence-ledger.cjs');

const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_HEADER_BYTES = 32768;

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const p = address.split('.').map(Number);
    const a=p[0], b=p[1], c=p[2];
    if (a===0 || a===10 || a===127 || a>=224) return false;
    if (a===100 && b>=64 && b<=127) return false;
    if (a===169 && b===254) return false;
    if (a===172 && b>=16 && b<=31) return false;
    if (a===192 && (b===0 || b===168)) return false;
    if (a===192 && b===0 && c===2) return false;
    if (a===198 && (b===18 || b===19 || b===51 && c===100)) return false;
    if (a===203 && b===0 && c===113) return false;
    return true;
  }
  if (family === 6) {
    const a = address.toLowerCase();
    if (a.startsWith('::ffff:')) return isPublicAddress(a.slice(7));
    // Permit only globally routable 2000::/3 unicast; exclude documentation space.
    if (!/^2[0-9a-f]{3}:/.test(a)) return false;
    if (a.startsWith('2001:db8:')) return false;
    return true;
  }
  return false;
}

async function resolvePublic(host, resolver = dns) {
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new Error('target_address_not_public');
    return [host];
  }
  const answers = await resolver.lookup(host, { all: true, verbatim: true });
  if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) {
    throw new Error('dns_resolution_contains_non_public_address');
  }
  return answers.map(answer => answer.address);
}

function requestPinned(host, address, path, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: address, servername: host, port: 443, path,
      method: 'HEAD', timeout: timeoutMs,
      headers: { 'user-agent': 'HeavenzFire-Sentinel/0.1 (+authorized passive assessment)' },
      rejectUnauthorized: true
    }, res => {
      const headers = {};
      for (const [key, value] of Object.entries(res.headers)) {
        headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
      }
      res.resume();
      resolve({ statusCode: res.statusCode, headers, location: res.headers.location || null });
    });
    req.on('timeout', () => req.destroy(new Error('http_timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function inspectHeaders(host, resolver = dns, requester = requestPinned) {
  let current = new URL('https://' + host + '/');
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'https:' || current.username || current.password || current.port && current.port !== '443') {
      throw new Error('redirect_destination_not_allowed');
    }
    const addresses = await resolvePublic(current.hostname, resolver);
    const response = await requester(current.hostname, addresses[0], current.pathname + current.search);
    if ([301,302,303,307,308].includes(response.statusCode) && response.location) {
      if (hop === MAX_REDIRECTS) throw new Error('redirect_limit_exceeded');
      current = new URL(response.location, current);
      continue;
    }
    const required = ['strict-transport-security','content-security-policy','x-content-type-options','x-frame-options','referrer-policy','permissions-policy'];
    return {
      url: current.toString(), statusCode: response.statusCode,
      headers: response.headers,
      missingSecurityHeaders: required.filter(name => !Object.prototype.hasOwnProperty.call(response.headers, name))
    };
  }
  throw new Error('redirect_limit_exceeded');
}

function inspectTls(host, addresses, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: addresses[0], port: 443, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: true });
    const timer = setTimeout(() => socket.destroy(new Error('tls_timeout')), timeoutMs);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const result = {
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        subject: cert.subject || {},
        issuer: cert.issuer || {},
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint256: cert.fingerprint256 || null
      };
      socket.end();
      resolve(result);
    });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

async function runAssessment({ scope, target, checks, approved, now, taskId, ledgerPath, actor = 'sentinel-passive-adapter', resolver = dns, tlsInspector = inspectTls, headerInspector = inspectHeaders } = {}) {
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > 4) throw new Error('checks_invalid');
  const observations = [];
  for (const check of checks) {
    const receipt = validateScanRequest({ scope, target, check, approved, now });
    let result;
    if (check === 'dns_records') {
      const records = {};
      for (const type of ['A','AAAA','MX','NS','TXT']) {
        try { records[type] = await resolver.resolve(target, type); }
        catch (error) { if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') records[type] = []; else throw error; }
      }
      result = { records };
    } else if (check === 'tls_certificate') {
      const addresses = await resolvePublic(target, resolver);
      result = await tlsInspector(target, addresses);
    } else if (check === 'http_security_headers' || check === 'http_metadata') {
      result = await headerInspector(target, resolver);
      if (check === 'http_metadata') result = { url: result.url, statusCode: result.statusCode, server: result.headers.server || null, contentType: result.headers['content-type'] || null };
    } else {
      throw new Error('unsupported_check');
    }
    const observation = { receipt, check, target: receipt.target, observedAt: new Date().toISOString(), result };
    if (ledgerPath) {
      const summary = JSON.stringify({ check, target: receipt.target, observedAt: observation.observedAt, result }).slice(0, 3900);
      observation.evidence = appendEvidence(ledgerPath, { taskId, kind: 'sentinel_passive_observation', summary, actor });
    }
    observations.push(observation);
  }
  return { schema: 'heavenzfire.sentinel.assessment.v1', taskId, scopeId: scope.scopeId, target, observations };
}

module.exports = { runAssessment, resolvePublic, isPublicAddress, inspectHeaders, inspectTls };
