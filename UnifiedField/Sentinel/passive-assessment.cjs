'use strict';

const dns = require('node:dns').promises;
const tls = require('node:tls');
const https = require('node:https');
const net = require('node:net');
const crypto = require('node:crypto');
const { validateScanRequest, normalizeTarget, normalizeScope, createScopeDigest } = require('./scope-policy.cjs');
const { appendEvidence } = require('../FieldCore/evidence-ledger.cjs');

const DEFAULTS = Object.freeze({
  timeoutMs: 8000,
  maxRedirects: 3,
  maxResponseBytes: 16384,
  maxDnsAnswers: 100,
  userAgent: 'HeavenzFire-Sentinel/0.2 (+authorized passive assessment)'
});
const SECURITY_HEADERS = Object.freeze([
  'strict-transport-security', 'content-security-policy', 'x-content-type-options',
  'x-frame-options', 'referrer-policy', 'permissions-policy'
]);

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a,b,c] = address.split('.').map(Number);
    if (a===0 || a===10 || a===127 || a>=224) return false;
    if (a===100 && b>=64 && b<=127) return false;
    if (a===169 && b===254) return false;
    if (a===172 && b>=16 && b<=31) return false;
    if (a===192 && (b===0 || b===168)) return false;
    if (a===192 && b===0 && c===2) return false;
    if (a===192 && b===88 && c===99) return false;
    if (a===198 && (b===18 || b===19 || b===51 && c===100)) return false;
    if (a===203 && b===0 && c===113) return false;
    return true;
  }
  if (family === 6) {
    const a = address.toLowerCase().split('%')[0];
    if (a.startsWith('::ffff:')) return isPublicAddress(a.slice(7));
    if (!/^2[0-9a-f]{3}:/.test(a)) return false; // global unicast 2000::/3 only
    if (a.startsWith('2001:db8:') || a.startsWith('2001:10:') || a.startsWith('2001:20:')) return false;
    return true;
  }
  return false;
}

async function resolvePublic(host, resolver = dns) {
  const normalized = normalizeTarget(host);
  if (net.isIP(normalized)) {
    if (!isPublicAddress(normalized)) throw new Error('target_address_not_public');
    return [normalized];
  }
  const answers = await resolver.lookup(normalized, { all: true, verbatim: true });
  if (!Array.isArray(answers) || !answers.length || answers.length > DEFAULTS.maxDnsAnswers) {
    throw new Error('dns_answer_set_invalid');
  }
  const unique = [...new Set(answers.map(answer => answer.address))];
  if (unique.some(address => !isPublicAddress(address))) {
    throw new Error('dns_resolution_contains_non_public_address');
  }
  return unique;
}

function requestPinned(host, address, requestPath, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULTS.timeoutMs;
  const maxResponseBytes = options.maxResponseBytes || DEFAULTS.maxResponseBytes;
  const method = options.method || 'HEAD';
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(value);
    };
    const req = https.request({
      protocol: 'https:',
      hostname: host,
      port: 443,
      servername: net.isIP(host) ? undefined : host,
      path: requestPath,
      method,
      timeout: timeoutMs,
      maxHeaderSize: 32768,
      headers: {
        'user-agent': DEFAULTS.userAgent,
        ...(method === 'GET' ? { range: 'bytes=0-0' } : {})
      },
      rejectUnauthorized: true,
      lookup: (_hostname, _lookupOptions, callback) => callback(null, address, net.isIP(address))
    }, res => {
      const headers = {};
      for (const [key, value] of Object.entries(res.headers)) {
        headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
      }
      let received = 0;
      res.on('data', chunk => {
        received += chunk.length;
        if (received > maxResponseBytes) req.destroy(new Error('http_response_limit_exceeded'));
      });
      res.once('end', () => finish(null, {
        statusCode: res.statusCode,
        headers,
        location: res.headers.location || null,
        bytesObserved: received
      }));
      res.once('error', error => finish(error));
      res.resume();
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('http_timeout')));
    req.once('error', error => finish(error));
    req.end();
  });
}

async function inspectHeaders(host, resolver = dns, requester = requestPinned, options = {}) {
  const allowedTargets = new Set((options.allowedTargets || [host]).map(normalizeTarget));
  let current = new URL('https://' + normalizeTarget(host) + '/');
  const redirects = [];
  for (let hop = 0; hop <= DEFAULTS.maxRedirects; hop++) {
    if (current.protocol !== 'https:' || current.username || current.password ||
        (current.port && current.port !== '443') || current.pathname !== '/' || current.search || current.hash) {
      throw new Error('redirect_destination_not_allowed');
    }
    const normalizedHost = normalizeTarget(current.hostname);
    if (!allowedTargets.has(normalizedHost)) throw new Error('redirect_target_out_of_scope');
    const addresses = await resolvePublic(normalizedHost, resolver);
    let response = await requester(normalizedHost, addresses[0], '/', { method: 'HEAD' });
    if (response.statusCode === 405 || response.statusCode === 501) {
      response = await requester(normalizedHost, addresses[0], '/', { method: 'GET' });
    }
    if ([301,302,303,307,308].includes(response.statusCode) && response.location) {
      if (hop === DEFAULTS.maxRedirects) throw new Error('redirect_limit_exceeded');
      redirects.push({ from: current.toString(), statusCode: response.statusCode });
      current = new URL(response.location, current);
      continue;
    }
    return {
      url: current.toString(),
      statusCode: response.statusCode,
      headers: response.headers,
      bytesObserved: response.bytesObserved || 0,
      redirects,
      missingSecurityHeaders: SECURITY_HEADERS.filter(name => !Object.prototype.hasOwnProperty.call(response.headers, name))
    };
  }
  throw new Error('redirect_limit_exceeded');
}

function inspectTls(host, addresses, timeoutMs = DEFAULTS.timeoutMs) {
  return new Promise((resolve, reject) => {
    const normalized = normalizeTarget(host);
    const address = addresses[0];
    if (!address || !isPublicAddress(address)) return reject(new Error('tls_address_not_public'));
    const socket = tls.connect({
      host: address,
      port: 443,
      servername: net.isIP(normalized) ? undefined : normalized,
      rejectUnauthorized: true,
      checkServerIdentity: (_ignored, cert) => tls.checkServerIdentity(normalized, cert)
    });
    const timer = setTimeout(() => socket.destroy(new Error('tls_timeout')), timeoutMs);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate(true);
      const result = {
        authorized: socket.authorized,
        authorizationError: socket.authorizationError || null,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name || null,
        subject: cert.subject || {},
        issuer: cert.issuer || {},
        subjectAltName: cert.subjectaltname || null,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint256: cert.fingerprint256 || null,
        serialNumber: cert.serialNumber || null
      };
      socket.end();
      resolve(result);
    });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function runAssessment({
  scope, target, checks, approved, now, taskId, ledgerPath,
  actor = 'sentinel-passive-adapter', resolver = dns,
  tlsInspector = inspectTls, headerInspector = inspectHeaders
} = {}) {
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > 4 ||
      new Set(checks).size !== checks.length) throw new Error('checks_invalid');
  const normalizedScope = normalizeScope(scope);
  const normalizedTarget = normalizeTarget(target);
  const scopeDigest = createScopeDigest(scope);
  const observations = [];
  for (const check of checks) {
    const receipt = validateScanRequest({ scope: normalizedScope, target: normalizedTarget, check, approved, now });
    let result;
    if (check === 'dns_records') {
      const records = {};
      for (const type of ['A','AAAA','MX','NS','TXT']) {
        try {
          const values = await resolver.resolve(normalizedTarget, type);
          records[type] = values.slice(0, DEFAULTS.maxDnsAnswers);
        } catch (error) {
          if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') records[type] = [];
          else throw error;
        }
      }
      result = { records };
    } else if (check === 'tls_certificate') {
      const addresses = await resolvePublic(normalizedTarget, resolver);
      result = await tlsInspector(normalizedTarget, addresses);
    } else if (check === 'http_security_headers' || check === 'http_metadata') {
      const inspected = await headerInspector(normalizedTarget, resolver, requestPinned, { allowedTargets: normalizedScope.targets });
      result = check === 'http_metadata'
        ? { url: inspected.url, statusCode: inspected.statusCode, server: inspected.headers.server || null, contentType: inspected.headers['content-type'] || null, redirects: inspected.redirects }
        : inspected;
    } else {
      throw new Error('unsupported_check');
    }
    const observedAt = new Date().toISOString();
    const canonicalResult = JSON.stringify(result);
    const observation = {
      receipt: { ...receipt, scopeDigest },
      check,
      target: normalizedTarget,
      observedAt,
      result,
      resultSha256: sha256(canonicalResult)
    };
    if (ledgerPath) {
      const summary = JSON.stringify({
        schema: 'heavenzfire.sentinel.observation.v1',
        scopeId: normalizedScope.scopeId,
        scopeDigest,
        authorizationRef: normalizedScope.authorizationRef,
        check,
        target: normalizedTarget,
        observedAt,
        resultSha256: observation.resultSha256,
        result
      });
      observation.evidence = appendEvidence(ledgerPath, {
        taskId, kind: 'sentinel_passive_observation', summary, actor, observedAt
      });
    }
    observations.push(observation);
  }
  return {
    schema: 'heavenzfire.sentinel.assessment.v2',
    taskId,
    scopeId: normalizedScope.scopeId,
    scopeDigest,
    target: normalizedTarget,
    checksCompleted: observations.map(item => item.check),
    observations
  };
}

module.exports = {
  DEFAULTS, SECURITY_HEADERS, runAssessment, resolvePublic,
  isPublicAddress, inspectHeaders, inspectTls, requestPinned
};
