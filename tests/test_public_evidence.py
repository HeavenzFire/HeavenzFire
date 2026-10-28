import hashlib
import tempfile
import unittest
from pathlib import Path

from unified_field.public_evidence import EvidenceError, PublicEvidenceCache


class PublicEvidenceCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'evidence.sqlite3'
        self.cache = PublicEvidenceCache(self.path, clock=lambda: 123.0)

    def tearDown(self):
        self.cache.close()
        self.tmp.cleanup()

    def test_only_allowlisted_https_urls_are_accepted(self):
        for url in (
            'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
            'https://example.com/data',
            'https://api.github.com.evil.invalid/repos',
            'https://user:password@api.github.com/repos',
            'https://api.github.com:8443/repos',
        ):
            with self.subTest(url=url), self.assertRaises(EvidenceError):
                self.cache.get(url, offline=True)

    def test_offline_cache_hit_checks_sha256(self):
        url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=cancer'
        body = b'{"result":"cached evidence"}'
        digest = hashlib.sha256(body).hexdigest()
        self.cache.db.execute('INSERT INTO evidence VALUES(?,?,?,?,?,?,?)',
                              (url, body, digest, 120.0, 200, 'application/json', '"v1"'))
        result = self.cache.get(url, offline=True)
        self.assertTrue(result.from_cache)
        self.assertEqual(result.body, body)
        self.assertEqual(result.sha256, digest)

    def test_offline_cache_miss_never_requires_network(self):
        with self.assertRaisesRegex(EvidenceError, 'offline cache miss'):
            self.cache.get('https://api.github.com/repos/HeavenzFire/HeavenzFire', offline=True)

    def test_corrupt_cached_body_is_rejected(self):
        url = 'https://api.github.com/repos/HeavenzFire/HeavenzFire'
        self.cache.db.execute('INSERT INTO evidence VALUES(?,?,?,?,?,?,?)',
                              (url, b'changed', '0' * 64, 120.0, 200, 'application/json', None))
        with self.assertRaisesRegex(EvidenceError, 'digest mismatch'):
            self.cache.get(url, offline=True)

    def test_inventory_exposes_digest_and_size_not_body(self):
        url = 'https://www.ebi.ac.uk/ena/portal/api/search'
        body = b'public-data'
        self.cache.db.execute('INSERT INTO evidence VALUES(?,?,?,?,?,?,?)',
                              (url, body, hashlib.sha256(body).hexdigest(), 120.0, 200, 'text/plain', None))
        item = self.cache.inventory()[0]
        self.assertEqual(item['bytes'], len(body))
        self.assertEqual(item['sha256'], hashlib.sha256(body).hexdigest())
        self.assertNotIn('body', item)


if __name__ == '__main__':
    unittest.main()
