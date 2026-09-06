"""Offline PostgreSQL replacement rehearsal. Creates a fresh synthetic database on every run."""
import hashlib,json,subprocess,uuid
from pathlib import Path
from legacy_stage import checked_database_path
from target_lookups import literal,SOURCE_HASH

CONTAINER='hkscda-animal-replacement-20260907'

def main():
    info=json.loads(subprocess.check_output(['docker','inspect',CONTAINER],encoding='utf-8'))[0]
    if info['HostConfig']['NetworkMode']!='none' or info['HostConfig']['PortBindings'] or info['Config']['Labels'].get('purpose')!='hkscda-animal-replacement-local': raise ValueError('Not isolated')
    root=checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite').parent
    raw=(root/'animal-replacement-candidate.json').read_bytes(); candidate=json.loads(raw)
    if candidate['source_sha256']!=SOURCE_HASH: raise ValueError('Wrong source')
    digest=hashlib.sha256(raw).hexdigest(); batch=str(uuid.uuid5(uuid.NAMESPACE_URL,digest))
    records=[dict(id=r['canonical_candidate_id'],**r['public_fields'],adoption_eligible=r['adoption_candidate'],sponsorship_eligible=r['sponsorship_candidate']) for r in candidate['animals'] if r['adoption_candidate'] or r['sponsorship_candidate']]
    database='replacement_full_'+uuid.uuid4().hex[:12]
    subprocess.run(['docker','exec',CONTAINER,'createdb','-U','postgres',database],check=True,capture_output=True)
    fixture="""
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon,authenticated,service_role;
CREATE FUNCTION private.has_admin_role(roles text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.app_role',true),'')=ANY(roles) $$;
CREATE TABLE public.animals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL CHECK(type IN ('cat','dog','sponsor')),
 name text NOT NULL, name_en text, gender text NOT NULL, age text NOT NULL, age_en text,
 description text, description_en text, notes text, notes_en text, image_url text, source_url text,
 status text NOT NULL DEFAULT 'available', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.animals TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.animals TO authenticated;
CREATE POLICY "public read available" ON animals FOR SELECT USING(status='available');
CREATE POLICY "admin full access" ON animals FOR ALL TO authenticated USING(true) WITH CHECK(true);
CREATE TABLE public.sponsorship_preference (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), animal_type_snapshot text,
 CONSTRAINT sponsorship_preference_animal_type_snapshot_check CHECK(animal_type_snapshot='sponsor')
);
CREATE TABLE private.linked_history (id integer PRIMARY KEY, animal_id uuid REFERENCES public.animals(id));
INSERT INTO animals(id,type,name,gender,age,status)
SELECT ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 CASE WHEN i<=28 THEN 'cat' WHEN i<=42 THEN 'dog' ELSE 'sponsor' END,
 'Synthetic placeholder '||i,'female','1',CASE WHEN i IN (27,28,42) THEN 'unavailable' ELSE 'available' END
FROM generate_series(1,44) i;
INSERT INTO private.linked_history SELECT i,('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,8) i;
"""
    migration=Path('supabase/migrations/20260906162436_animal_catalog_membership.sql').read_text(encoding='utf-8-sig')
    setup=subprocess.run(['docker','exec','-i',CONTAINER,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],input=fixture+'\n'+migration,encoding='utf-8',capture_output=True)
    if setup.returncode: raise RuntimeError('Fresh synthetic fixture or full migration failed')
    functions=Path('scripts/legacy-import/replacement_transaction.sql').read_text(encoding='utf-8-sig')
    def sql(text):
        return subprocess.run(['docker','exec','-i',CONTAINER,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],input='SET standard_conforming_strings=on;\n'+functions+'\n'+text,encoding='utf-8',capture_output=True)
    def good(text):
        p=sql(text)
        if p.returncode: raise RuntimeError('Local SQL failed; details suppressed')
        return p.stdout.strip()
    def fails(text,expected):
        p=sql(text)
        if p.returncode==0 or expected not in p.stderr: raise RuntimeError('Expected failure not reproduced')
    good("CREATE TABLE IF NOT EXISTS public.audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid,action text NOT NULL,entity text NOT NULL,entity_id text NOT NULL,timestamp timestamptz NOT NULL DEFAULT now(),detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;")
    assert good("BEGIN; INSERT INTO sponsorship_preference(animal_type_snapshot) VALUES ('cat'),('dog'),('sponsor'); SELECT count(*) FROM sponsorship_preference; ROLLBACK;")=='3'
    assert good("BEGIN; UPDATE animals SET adoption_eligible=false,sponsorship_eligible=true WHERE id='00000000-0000-0000-0000-000000000001'; UPDATE animals SET type='dog' WHERE id='00000000-0000-0000-0000-000000000001'; SELECT (NOT adoption_eligible AND sponsorship_eligible)::text FROM animals WHERE id='00000000-0000-0000-0000-000000000001'; ROLLBACK;")=='true'
    before=json.loads(good("SELECT json_build_object('ids',array_agg(id ORDER BY id),'fingerprint',md5(string_agg(id::text||':'||type||':'||status||':'||updated_at::text,'|' ORDER BY id))) FROM public.animals;"))
    if len(before['ids'])!=44: raise ValueError('Requires fresh 44-row synthetic baseline')
    array='ARRAY['+','.join(literal(x)+'::uuid' for x in before['ids'])+']'
    args=','.join([literal(json.dumps(records,ensure_ascii=False))+'::jsonb',literal(batch)+'::uuid',literal(SOURCE_HASH),literal(digest),array,literal(before['fingerprint'])])
    call='SELECT pg_temp.apply_animal_replacement('+args
    def counts():
        return json.loads(good("SELECT json_build_object('total',(SELECT count(*) FROM animals),'retired',(SELECT count(*) FROM animals WHERE retired_at IS NOT NULL),'adoption_cats',(SELECT count(*) FROM animals WHERE retired_at IS NULL AND status='available' AND adoption_eligible AND type='cat'),'adoption_dogs',(SELECT count(*) FROM animals WHERE retired_at IS NULL AND status='available' AND adoption_eligible AND type='dog'),'sponsors',(SELECT count(*) FROM animals WHERE retired_at IS NULL AND status='available' AND sponsorship_eligible),'history',(SELECT count(*) FROM private.linked_history),'audit',(SELECT count(*) FROM audit_log));"))
    baseline=counts()
    fails(call+',true);','Forced replacement failure')
    if counts()!=baseline: raise AssertionError('Forced failure did not roll back')
    assert good(call+');')=='248'
    applied=counts(); assert applied==dict(total=292,retired=44,adoption_cats=100,adoption_dogs=108,sponsors=115,history=8,audit=292)
    assert good(call+');')=='0' and counts()==applied
    assert good("SET ROLE anon; SELECT count(*) FROM public.animals;")=='248'
    assert good("SET ROLE authenticated; SET test.app_role=''; UPDATE animals SET name='unauthorized'; SELECT count(*) FROM animals WHERE name='unauthorized';")=='0'
    fails('SET ROLE anon; SELECT count(*) FROM private.animal_replacement_row;','permission denied')
    new_id=records[0]['id']
    good('INSERT INTO private.linked_history VALUES (100,'+literal(new_id)+'::uuid);')
    fails('SELECT pg_temp.rollback_animal_replacement('+literal(batch)+'::uuid);','New linked history prevents rollback')
    assert counts()['total']==292
    good('DELETE FROM private.linked_history WHERE id=100;')
    good('UPDATE animals SET age=\'changed\' WHERE id='+literal(new_id)+'::uuid;')
    fails(call+');','Imported row changed')
    fails('SELECT pg_temp.rollback_animal_replacement('+literal(batch)+'::uuid);','Imported row changed')
    good('UPDATE animals SET age='+literal(records[0]['age'])+' WHERE id='+literal(new_id)+'::uuid;')
    assert good('SELECT pg_temp.rollback_animal_replacement('+literal(batch)+'::uuid);')=='292'
    rolled=counts(); assert rolled==dict(baseline,audit=584)
    restored=good("SELECT md5(string_agg(id::text||':'||type||':'||status||':'||updated_at::text,'|' ORDER BY id)) FROM public.animals;")
    assert restored==before['fingerprint']
    result={'database':database,'fresh_synthetic_fixture':True,'full_membership_migration_applied':True,'snapshot_species_constraint_passed':True,'species_correction_preserved_memberships':True,'candidate_sha256':digest,'network':'none','ports':0,'baseline':baseline,'applied':applied,'rolled_back':rolled,'repeat_added':0,'forced_failure_atomic':True,'rollback_blocked_by_new_history':True,'replay_and_rollback_blocked_by_edits':True,'anonymous_visible_after_apply':248,'nonstaff_updates':0,'rollback_manifest_anonymous_denied':True,'baseline_fingerprint_restored':True,'production_writes':0,'parity_limit':'synthetic placeholders/history; real source candidates; role helper simulated; no photo publication'}
    Path('docs/evidence/legacy-import-20260906/animal-replacement-rehearsal.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Rehearsal failed: '+type(error).__name__+'; no private details displayed'); raise SystemExit(1)
