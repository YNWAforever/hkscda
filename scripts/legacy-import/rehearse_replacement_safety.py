"""Synthetic-only regressions in a fresh, offline Docker PostgreSQL database.

Reconstructs the two reviewed pre-fix conditions in memory, then verifies the
checked-in functions. No source records, production credentials, or real photos.
"""
import json
import subprocess
import time
import uuid
from pathlib import Path

CONTAINER = 'hkscda-animal-replacement-20260907'
GATE = 709071


def main():
    info = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER], text=True))[0]
    if (info['HostConfig']['NetworkMode'] != 'none' or info['HostConfig']['PortBindings']
            or info['Config']['Labels'].get('purpose') != 'hkscda-animal-replacement-local'):
        raise ValueError('Requires isolated local container')
    db = 'replacement_safety_' + uuid.uuid4().hex[:12]
    subprocess.run(['docker', 'exec', CONTAINER, 'createdb', '-U', 'postgres', db], check=True, capture_output=True)
    command = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db]
    functions = Path('scripts/legacy-import/replacement_transaction.sql').read_text(encoding='utf-8-sig')
    before = functions.replace(
        "  IF records IS NULL OR jsonb_typeof(records) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid replacement array'; END IF;\n  IF jsonb_array_length(records)=0 THEN RAISE EXCEPTION 'Empty replacement'; END IF;",
        "  IF jsonb_typeof(records)<>'array' OR jsonb_array_length(records)=0 THEN RAISE EXCEPTION 'Empty replacement'; END IF;"
    ).replace('LOCK TABLE public.animals IN EXCLUSIVE MODE;', 'LOCK TABLE public.animals IN SHARE ROW EXCLUSIVE MODE;')
    assert before != functions

    def query(sql, must_pass=True):
        result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=20)
        if must_pass and result.returncode:
            raise RuntimeError('Synthetic SQL failed')
        return result

    def scalar(sql):
        return query(sql).stdout.strip()

    def start(sql):
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        process.stdin.write(sql + '\n')
        process.stdin.flush()
        return process

    def finish(process, sql=''):
        if sql:
            process.stdin.write(sql + '\n')
        process.stdin.close()
        process.stdin = None
        return process.communicate(timeout=20)

    def until(sql):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if scalar(sql) == 't':
                return
            time.sleep(.05)
        raise AssertionError('Expected synchronized lock state absent')

    # Minimal real constraints including a cascading history FK; no staged rows.
    query("""
CREATE SCHEMA private;
CREATE TABLE public.animals (
 id uuid PRIMARY KEY, type text NOT NULL, name text NOT NULL,
 gender text NOT NULL, age text NOT NULL, status text NOT NULL,
 adoption_eligible boolean NOT NULL, sponsorship_eligible boolean NOT NULL,
 image_url text, description text, notes text, retired_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.animal_replacement_batch (
 id uuid PRIMARY KEY, source_sha256 text NOT NULL, candidate_sha256 text NOT NULL,
 state text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE private.animal_replacement_row (
 batch_id uuid NOT NULL REFERENCES private.animal_replacement_batch(id),
 animal_id uuid NOT NULL, operation text NOT NULL, before_image jsonb,
 after_image jsonb NOT NULL, PRIMARY KEY(batch_id,animal_id)
);
CREATE TABLE public.audit_log (action text, entity text, entity_id text, detail jsonb);
CREATE TABLE private.concurrent_history (id integer PRIMARY KEY,
 animal_id uuid REFERENCES public.animals(id) ON DELETE CASCADE);
""")
    old_id = '00000000-0000-0000-0000-000000000001'
    new_id = '00000000-0000-0000-0000-000000000002'
    batch = '00000000-0000-0000-0000-000000000003'
    record = json.dumps([dict(id=new_id, type='cat', name='Synthetic', gender='female', age='1', adoption_eligible=True, sponsorship_eligible=False)])

    def reset():
        query("TRUNCATE private.concurrent_history, private.animal_replacement_row, private.animal_replacement_batch, public.audit_log, public.animals; INSERT INTO animals(id,type,name,gender,age,status,adoption_eligible,sponsorship_eligible) VALUES ('" + old_id + "','cat','Placeholder','female','1','available',true,false);")

    def apply_sql(value):
        fingerprint = scalar("SELECT md5(string_agg(id::text||':'||type||':'||status||':'||updated_at::text,'|' ORDER BY id)) FROM animals")
        return "SELECT pg_temp.apply_animal_replacement(" + value + ", '" + batch + "', 'synthetic-source', 'synthetic-candidate', ARRAY['" + old_id + "'::uuid], '" + fingerprint + "');"

    reset()
    query(before + apply_sql('NULL'))
    assert scalar('SELECT count(*) FROM animals WHERE retired_at IS NOT NULL') == '1'
    assert scalar('SELECT count(*) FROM private.animal_replacement_batch') == '1'
    reset()
    rejected = query(functions + apply_sql('NULL'), False)
    assert rejected.returncode and 'Invalid replacement array' in rejected.stderr
    assert scalar('SELECT count(*) FROM animals WHERE retired_at IS NOT NULL') == '0'
    assert scalar('SELECT count(*) FROM private.animal_replacement_batch') == '0'
    assert scalar('SELECT count(*) FROM audit_log') == '0'
    for invalid in ["'null'::jsonb", "'{}'::jsonb", "'[]'::jsonb"]:
        result = query(functions + apply_sql(invalid), False)
        assert result.returncode
        assert scalar('SELECT count(*) FROM animals WHERE retired_at IS NOT NULL') == '0'

    def race(code, fixed):
        reset()
        query(code + apply_sql("'" + record + "'::jsonb"))
        gate = start("SET application_name='replacement-gate'; SELECT pg_advisory_lock(" + str(GATE) + ');')
        until("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=" + str(GATE) + ' AND granted)')
        # A test-only pause just after all reference checks exposes the precise race.
        paused = code.replace('  DELETE FROM public.animals WHERE id=ANY(ids);',
            '  PERFORM pg_advisory_lock(' + str(GATE) + '); PERFORM pg_advisory_unlock(' + str(GATE) + ');\n  DELETE FROM public.animals WHERE id=ANY(ids);')
        rollback = start("SET application_name='replacement-rollback'; " + paused + "SELECT pg_temp.rollback_animal_replacement('" + batch + "');\n\\q")
        until("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='replacement-rollback' AND wait_event='advisory')")
        child = start("SET application_name='replacement-child'; INSERT INTO private.concurrent_history VALUES (1,'" + new_id + "');\n\\q")
        if fixed:
            until("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='replacement-child' AND wait_event_type='Lock')")
            assert child.poll() is None
        else:
            finish(child)
            assert child.returncode == 0
            assert scalar('SELECT count(*) FROM private.concurrent_history') == '1'
        finish(gate, 'SELECT pg_advisory_unlock(' + str(GATE) + ');\n\\q')
        finish(rollback)
        assert rollback.returncode == 0
        if fixed:
            _, error = finish(child)
            assert child.returncode != 0 and 'foreign key constraint' in error
        assert scalar('SELECT count(*) FROM private.concurrent_history') == '0'
        assert scalar('SELECT count(*) FROM animals') == '1'
        return True

    assert race(before, False)
    assert race(functions, True)
    report = {
        'database': db, 'network': 'none', 'synthetic_only': True,
        'before_sql_null_retired_placeholder': True,
        'after_sql_null_rejected_without_writes': True,
        'json_null_object_and_empty_array_rejected': True,
        'before_concurrent_committed_history_was_cascade_deleted': True,
        'after_concurrent_history_insert_blocked_then_fk_rejected': True,
        'production_writes': 0,
        'note': 'Before variants reconstruct the two reviewed defects; test-only advisory gate pauses rollback after FK checks. Fresh disposable database retained.'
    }
    Path('docs/evidence/legacy-import-20260906/animal-replacement-safety-regressions.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
