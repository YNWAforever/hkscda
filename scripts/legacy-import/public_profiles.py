"""Offline allowlisted legacy profile projection; no database mutations."""
from collections import Counter
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import uuid
from legacy_stage import checked_database_path
from photo_stage import atomic_manifest
from target_lookups import SOURCE_HASH

TEXT_FIELDS = {'personality': ('personality_description', 1000), 'health': ('health_description', 2000), 'story': ('story', 8000)}
REPLACEMENT_HASH = '9a45496e21a9cf264e56e8c64774825cd0ea593a783e09f048ee91181773dffa'


STAGING_HASH = '2dfbf2fdae84b2cef327e032ec3e92e6ab2b0069be8aadb768eca0af28b0300b'

def verify_staging_bytes(content):
    if hashlib.sha256(content).hexdigest() != STAGING_HASH: raise ValueError('Verified staging bytes changed')


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')


def normalized_date(value, as_of, timestamp=False):
    if not isinstance(value, str): return None
    pattern = r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}' if timestamp else r'\d{4}-\d{2}-\d{2}'
    if not re.fullmatch(pattern, value): return None
    try:
        parsed = datetime.strptime(value, '%Y-%m-%d %H:%M:%S').date() if timestamp else date.fromisoformat(value)
        return parsed.isoformat() if parsed <= date.fromisoformat(as_of) else None
    except ValueError: return None


def text_flags(value, maximum):
    flags = []
    if re.search(r'[^\s@]+@[^\s@]+|(?:\d[\s()+.-]*){8,}', value): flags.append('contact_details')
    if re.search(r'https?://|www\.|<[^>]*>|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', value, re.I): flags.append('markup_url_or_control')
    if re.search(r'義工|職員|同事|聯絡|電話|地址|晶片|籠|收費|轉帳|whatsapp|staff|volunteer', value, re.I): flags.append('internal_reference')
    if len(value) > maximum: flags.append('too_long')
    return flags


def project_profile(row, as_of, approvals=None):
    approvals = approvals or {}
    code = row.get('code')
    code = code.strip() if isinstance(code, str) else None
    profile = {'code': code if code and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,39}', code) else None,
               'birthday': normalized_date(row.get('birthday'), as_of),
               'neutered': {'1': True, '0': False}.get(row.get('is_castrated')),
               'suitability': row.get('suitable_for') if row.get('suitable_for') in ('newbie', 'experienced') else None,
               'personality': None, 'health': None, 'story': None,
               'recordDate': normalized_date(row.get('updated_at'), as_of, timestamp=True)}
    review = {}
    for field, (source, maximum) in TEXT_FIELDS.items():
        raw = row.get(source)
        if raw is None or raw == '' or (isinstance(raw, str) and raw.strip().lower() in ('', 'null')): continue
        if not isinstance(raw, str): raise ValueError('Text field is not text')
        digest = hashlib.sha256(raw.encode('utf-8')).hexdigest()
        flags = text_flags(raw, maximum)
        cleared = digest in approvals.get(field, []) and not flags
        review[field] = {'source_field': source, 'source_text_sha256': digest, 'source_text': raw,
                         'verdict': 'cleared' if cleared else 'held',
                         'reasons': [] if cleared else ['public_review_required', *flags]}
        if cleared: profile[field] = raw.strip()
    return profile, review


def build_projection(rows, candidate, candidate_hash, applied, as_of, expected_count=248, approvals=None):
    batch = applied.get('batch', {})
    if candidate.get('source_sha256') != SOURCE_HASH or batch.get('source_sha256') != SOURCE_HASH: raise ValueError('Source hash mismatch')
    if batch.get('candidate_sha256') != candidate_hash or batch.get('state') != 'applied': raise ValueError('Applied candidate mismatch')
    source = {}
    for key, row in rows:
        if key != row.get('id') or key in source: raise ValueError('Source identity mismatch')
        source[key] = row
    selected = [r for r in candidate['animals'] if r['adoption_candidate'] or r['sponsorship_candidate']]
    if len(selected) != expected_count: raise ValueError('Unexpected profile count')
    applied_ids = {r['animal_id'] for r in applied['rows'] if r.get('after_image') and r['after_image'].get('id') == r['animal_id']}
    profiles = []; reviews = []; seen = set()
    for item in selected:
        key = item['legacy_id']
        if not isinstance(key, str) or not key.isdigit() or key in seen: raise ValueError('Invalid selected identity')
        seen.add(key)
        canonical = str(uuid.uuid5(uuid.NAMESPACE_URL, 'hkscda:legacy:v1:animals:' + key))
        if canonical != item['canonical_candidate_id'] or canonical not in applied_ids or key not in source: raise ValueError('Applied identity mismatch')
        profile, review = project_profile(source[key], as_of, approvals)
        profiles.append({'animal_id': canonical, 'legacy_id': key, 'source_row_sha256': hashlib.sha256(encode(source[key])).hexdigest(), 'public_profile': profile})
        reviews.append({'animal_id': canonical, 'legacy_id': key, 'fields': review})
    return profiles, reviews


def main():
    dbpath = checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite')
    root = dbpath.parent
    verify_staging_bytes(dbpath.read_bytes())
    candidate_bytes = (root / 'animal-replacement-candidate.json').read_bytes()
    candidate_hash = hashlib.sha256(candidate_bytes).hexdigest()
    if candidate_hash != REPLACEMENT_HASH: raise ValueError('Unrecognized replacement candidate')
    applied_bytes = (root / 'production-animal-applied-manifest-20260907.json').read_bytes()
    with sqlite3.connect(dbpath.as_uri() + '?mode=ro', uri=True) as db:
        if db.execute('SELECT sha256 FROM source_manifest').fetchall() != [(SOURCE_HASH,)]: raise ValueError('Wrong staging source')
        rows = [(key, json.loads(payload)) for key, payload in db.execute("SELECT legacy_id,payload FROM legacy_rows WHERE source_table='animals' ORDER BY CAST(legacy_id AS INTEGER)")]
    review_path = root / 'profile-text-approvals.json'
    approval_bytes = review_path.read_bytes() if review_path.exists() else encode({})
    approvals = json.loads(approval_bytes)
    as_of = '2026-09-07'
    profiles, reviews = build_projection(rows, json.loads(candidate_bytes), candidate_hash, json.loads(applied_bytes), as_of, approvals=approvals)
    provenance = {'version': 1, 'source_sha256': SOURCE_HASH, 'replacement_candidate_sha256': candidate_hash,
                  'staging_sha256': hashlib.sha256(dbpath.read_bytes()).hexdigest(), 'applied_manifest_sha256': hashlib.sha256(applied_bytes).hexdigest(),
                  'review_approvals_sha256': hashlib.sha256(approval_bytes).hexdigest(), 'as_of': as_of, 'publication_approved': False}
    payload = encode({**provenance, 'animals': profiles})
    review_payload = encode({**provenance, 'animals': reviews})
    atomic_manifest(root / 'profile-candidate.json', payload)
    atomic_manifest(root / 'profile-review-manifest.json', review_payload)
    report = {**provenance, 'candidate_sha256': hashlib.sha256(payload).hexdigest(), 'review_manifest_sha256': hashlib.sha256(review_payload).hexdigest(),
              'animals': len(profiles), 'production_writes': 0,
              'record_date_source': 'updated_at, strict source wall-clock date; historical record, not current health certification',
              'field_coverage': {field: sum(r['public_profile'][field] is not None for r in profiles) for field in profiles[0]['public_profile']},
              'neutered': dict(Counter('unknown' if r['public_profile']['neutered'] is None else 'yes' if r['public_profile']['neutered'] else 'no' for r in profiles)),
              'text_review': {field: dict(Counter(r['fields'][field]['verdict'] for r in reviews if field in r['fields'])) for field in TEXT_FIELDS},
              'hold_reasons': dict(Counter(reason for r in reviews for f in r['fields'].values() for reason in f['reasons']))}
    Path('docs/evidence/legacy-import-20260906/profile-projection.json').write_bytes(encode(report))
    print(json.dumps(report))


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('Profile preparation failed: ' + type(error).__name__ + '; no private details displayed')
        raise SystemExit(1)
