"""Offline production-shaped profile rehearsal. Never connects to a provider."""
import hashlib
import json
import re
import subprocess
import uuid
from pathlib import Path
from legacy_stage import checked_database_path
from target_lookups import literal


def main():
    container = 'hkscda-animal-replacement-20260907'
    info = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
    assert info['HostConfig']['NetworkMode'] == 'none' and not info['HostConfig']['PortBindings']
    assert info['Config']['Labels'].get('purpose') == 'hkscda-animal-replacement-local'
    root = checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite').parent
    def read(name):
        return json.loads((root / name).read_text(encoding='utf-8-sig'))
    snapshot = read('production-animal-before-20260907.json')
    applied = read('production-animal-applied-manifest-20260907.json')
    candidate = read('profile-candidate.json')
    candidate_hash = hashlib.sha256((root / 'profile-candidate.json').read_bytes()).hexdigest()
    assert candidate['publication_approved'] is False and len(candidate['animals']) == 248
    animals = [r['after_image'] for r in applied['rows']]
    assert len(animals) == 292
    photos = {r['animal_id']: r['public_url'] for r in read('photo-publication-uploaded.json')}
    # Reconstruct the known uploaded-photo state; this is not a fresh live snapshot.
    for animal in animals:
        if animal['id'] in photos:
            animal['image_url'] = photos[animal['id']]
    db = 'profile_patch_' + uuid.uuid4().hex[:10]
    subprocess.run(['docker', 'exec', container, 'createdb', '-U', 'postgres', db], check=True, capture_output=True)
    cmd = ['docker', 'exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db]
    def run(sql, error=None):
        result = subprocess.run(cmd, input=sql, text=True, encoding='utf-8', capture_output=True, timeout=30)
        if error:
            assert result.returncode and error in result.stderr, 'Expected rejection absent'
        else:
            assert result.returncode == 0, 'Private profile rehearsal SQL failed: ' + result.stderr.splitlines()[0] if result.stderr else 'Private profile rehearsal failed'
        return result.stdout.strip()
    def ident(value):
        assert re.fullmatch('[a-z_]+', value)
        return '"' + value + '"'
    setup = 'CREATE SCHEMA auth; CREATE SCHEMA private;' + snapshot['auth_uid_definition'] + ';'
    for table in ['animals', 'audit_log']:
        columns = [ident(c['name']) + ' ' + c['type'] + (' DEFAULT ' + c['default'] if c['default'] else '') + (' NOT NULL' if c['notnull'] else '') for c in snapshot['columns'] if c['table'] == table]
        setup += 'CREATE TABLE public.' + table + '(' + ','.join(columns) + ');'
        for constraint in snapshot['constraints']:
            if constraint['table'] == table:
                setup += 'ALTER TABLE public.' + table + ' ADD CONSTRAINT ' + ident(constraint['name']) + ' ' + constraint['def'] + ';'
    setup += 'INSERT INTO animals SELECT * FROM json_populate_recordset(NULL::animals,' + literal(json.dumps(animals)) + '::json);'
    for trigger in snapshot['triggers']:
        setup += trigger['function'] + ';' + trigger['definition'] + ';'
    run(setup)
    run('SELECT public_profile FROM animals LIMIT 1;', 'does not exist')
    run(Path('supabase/migrations/20260906181657_animal_public_profile.sql').read_text(encoding='utf-8'))
    baseline = json.loads(run('SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM animals a;'))
    by_id = {r['id']: r for r in baseline}
    records = []
    for projected in candidate['animals']:
        before = by_id[projected['animal_id']]
        after = dict(before, public_profile=projected['public_profile'], updated_at='2026-09-07T04:00:00+00:00')
        records.append(dict(id=before['id'], before=before, after=after))
    functions = Path('scripts/legacy-import/profile_transaction.sql').read_text(encoding='utf-8')
    batch = str(uuid.uuid5(uuid.NAMESPACE_URL, candidate_hash))
    call = 'SELECT pg_temp.patch_animal_profiles(' + literal(json.dumps(records, ensure_ascii=False)) + '::jsonb,' + literal(batch) + '::uuid'
    def current():
        return json.loads(run('SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM animals a;'))
    run(functions + call + ',false,true);', 'Forced profile failure')
    assert current() == baseline and run('SELECT count(*) FROM audit_log;') == '0'
    assert run(functions + call + ');') == '248'
    assert run(functions + call + ');') == '0'
    assert run("SELECT count(*) FROM audit_log WHERE action='legacy_profile_publish';") == '248'
    assert run("SELECT count(*) FROM animals WHERE retired_at IS NULL AND image_url IS NOT NULL;") == '14'
    changed_id = records[0]['id']
    run('UPDATE animals SET name=name||\' edited\' WHERE id=' + literal(changed_id) + ';')
    run(functions + call + ',true);', 'Animal changed; review required')
    run(functions + call + ');', 'Animal changed; review required')
    run('UPDATE animals SET name=' + literal(records[0]['after']['name']) + ' WHERE id=' + literal(changed_id) + ';')
    assert run(functions + call + ',true);') == '248'
    assert run(functions + call + ',true);') == '0'
    assert current() == baseline
    assert run("SELECT count(*) FROM audit_log WHERE action='legacy_profile_rollback';") == '248'
    # Private local manifest is explicitly labelled, not executable production SQL.
    (root / 'profile-local-rehearsal-manifest.json').write_text(json.dumps(dict(scope='offline reconstructed state only; refresh production before approval', batch_id=batch, records=records), ensure_ascii=False, indent=2), encoding='utf-8')
    report = dict(database=db, candidate_sha256=candidate_hash, animals=292, profiles_applied=248, retired_unchanged=44, photos_preserved=14, missing_column_reproduced=True, forced_failure_atomic=True, apply_audit=248, replay_added=0, changed_row_apply_and_rollback_blocked=True, rollback_exact=True, rollback_audit=248, production_writes=0, scope='Offline reconstructed production animal schema, constraints and triggers; no fresh production parity claim. Full linked-table recovery covered separately.')
    Path('docs/evidence/legacy-import-20260906/public-profile-patch-rehearsal.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
