"""Restore the scoped private production snapshot into offline PostgreSQL and rehearse."""
import hashlib,json,re,subprocess,uuid
from pathlib import Path
from target_lookups import literal,SOURCE_HASH
from legacy_stage import checked_database_path

CONTAINER='hkscda-animal-replacement-20260907'

def main():
    info=json.loads(subprocess.check_output(['docker','inspect',CONTAINER],text=True))[0]
    assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
    assert info['Config']['Labels'].get('purpose')=='hkscda-animal-replacement-local'
    root=checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite').parent
    raw=(root/'production-animal-before-20260907.json').read_bytes(); backup=json.loads(raw)
    candidate_raw=(root/'animal-replacement-candidate.json').read_bytes(); candidate=json.loads(candidate_raw)
    digest=hashlib.sha256(candidate_raw).hexdigest()
    assert digest=='9a45496e21a9cf264e56e8c64774825cd0ea593a783e09f048ee91181773dffa'
    assert candidate['source_sha256']==SOURCE_HASH and len(backup['animals'])==44
    records=[dict(id=r['canonical_candidate_id'],**r['public_fields'],adoption_eligible=r['adoption_candidate'],sponsorship_eligible=r['sponsorship_candidate']) for r in candidate['animals'] if r['adoption_candidate'] or r['sponsorship_candidate']]
    assert len(records)==248
    db='replacement_production_shape_'+uuid.uuid4().hex[:10]
    subprocess.run(['docker','exec',CONTAINER,'createdb','-U','postgres',db],check=True,capture_output=True)
    cmd=['docker','exec','-i',CONTAINER,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]
    def run(sql,expected=None):
        r=subprocess.run(cmd,input=sql,text=True,encoding='utf-8',capture_output=True,timeout=30)
        if expected: assert r.returncode and expected in r.stderr, 'Expected SQL rejection absent'
        else: assert r.returncode==0, 'Private SQL rehearsal failed'
        return r.stdout.strip()
    def ident(s):
        assert re.fullmatch('[a-z_]+',s)
        return '"'+s+'"'
    setup='CREATE SCHEMA auth; CREATE SCHEMA private;'+backup['auth_uid_definition']+';'
    for table in ['animals','audit_log']:
        cols=[]
        for c in backup['columns']:
            if c['table']==table: cols.append(ident(c['name'])+' '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['notnull'] else ''))
        setup+='CREATE TABLE public.'+table+'('+','.join(cols)+');'
        for c in backup['constraints']:
            if c['table']==table: setup+='ALTER TABLE public.'+table+' ADD CONSTRAINT '+ident(c['name'])+' '+c['def']+';'
    setup+='INSERT INTO animals SELECT * FROM json_populate_recordset(NULL::animals,'+literal(json.dumps(backup['animals']))+'::json);'
    setup+='INSERT INTO audit_log SELECT * FROM json_populate_recordset(NULL::audit_log,'+literal(json.dumps(backup['audit']))+'::json);'
    # Preserve complete linked records privately and reproduce every live animal FK action.
    for table,rows in backup['linked_tables'].items():
        refs=[c for c in backup['constraints'] if c['table']==table]
        cols=sorted(set(re.search(r'FOREIGN KEY \(([^)]+)\)',c['def']).group(1) for c in refs))
        setup+='CREATE TABLE public.'+ident(table)+'(snapshot jsonb NOT NULL'+''.join(','+ident(col)+' uuid' for col in cols)+');'
        for c in refs: setup+='ALTER TABLE public.'+ident(table)+' ADD CONSTRAINT '+ident(c['name'])+' '+c['def']+';'
        for row in rows:
            setup+='INSERT INTO public.'+ident(table)+' VALUES('+literal(json.dumps(row))+'::jsonb'+''.join(','+(literal(row[col])+'::uuid' if row.get(col) else 'NULL') for col in cols)+');'
    for t in backup['triggers']: setup+=t['function']+';'+t['definition']+';'
    migration=Path('supabase/migrations/20260906162436_animal_catalog_membership.sql').read_text(encoding='utf-8')
    setup+=migration[migration.index('CREATE TABLE private.animal_replacement_batch'):migration.index('-- Sponsorship snapshots')]
    run(setup)
    functions=Path('scripts/legacy-import/replacement_transaction.sql').read_text(encoding='utf-8-sig')
    batch=str(uuid.uuid5(uuid.NAMESPACE_URL,digest))
    ids='ARRAY['+','.join(literal(r['id'])+'::uuid' for r in backup['animals'])+']'
    args=','.join([literal(json.dumps(records,ensure_ascii=False))+'::jsonb',literal(batch)+'::uuid',literal(SOURCE_HASH),literal(digest),ids,literal(backup['fingerprint'])])
    apply='SELECT pg_temp.apply_animal_replacement('+args
    baseline=run("SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM animals a;")
    run(functions+apply+',true);','Forced replacement failure')
    assert run('SELECT count(*) FROM animals;')=='44'
    assert run(functions+apply+');')=='248'
    assert run(functions+apply+');')=='0'
    assert run("SELECT count(*) FROM audit_log WHERE action IN ('legacy_animal_import','legacy_animal_retire');")=='292'
    assert run(functions+'SELECT pg_temp.rollback_animal_replacement('+literal(batch)+'::uuid);')=='292'
    assert run("SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM animals a;")==baseline
    for table,rows in backup['linked_tables'].items():
        restored=json.loads(run("SELECT coalesce(jsonb_agg(snapshot),'[]'::jsonb) FROM "+ident(table)+';'))
        assert sorted(map(lambda r:json.dumps(r,sort_keys=True),restored))==sorted(map(lambda r:json.dumps(r,sort_keys=True),rows))
    # Persist exact reviewed public projection privately for the authorized execution.
    (root/'production-animal-apply.sql').write_text(functions+'\n'+apply+');',encoding='utf-8')
    result=dict(database=db,backup_sha256=hashlib.sha256(raw).hexdigest(),candidate_sha256=digest,batch_id=batch,restored_animals=44,restored_linked_records=sum(map(len,backup['linked_tables'].values())),actual_animal_audit_columns_constraints_triggers=True,all_animal_foreign_keys_reproduced=True,forced_failure_atomic=True,imported=248,retired=44,replay_added=0,audit_apply=292,rollback_original_rows_exact=True,linked_snapshots_preserved=True,scope='Scoped animal/history restore; linked tables retain snapshot payloads plus actual animal FK definitions; not full platform recovery')
    Path('docs/evidence/legacy-import-20260906/production-shaped-animal-rehearsal.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))

if __name__=='__main__': main()
