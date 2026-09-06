"""Synthetic-only checks for the canonical animal membership migration."""
import json, subprocess, uuid
from pathlib import Path

CONTAINER = 'hkscda-animal-replacement-20260907'

def main():
    info = json.loads(subprocess.check_output(['docker','inspect',CONTAINER],text=True))[0]
    if info['HostConfig']['NetworkMode'] != 'none' or info['HostConfig']['PortBindings'] or info['Config']['Labels'].get('purpose') != 'hkscda-animal-replacement-local':
        raise ValueError('Requires isolated local container')
    db = 'catalog_membership_' + uuid.uuid4().hex[:12]
    subprocess.run(['docker','exec',CONTAINER,'createdb','-U','postgres',db],check=True,capture_output=True)
    cmd = ['docker','exec','-i',CONTAINER,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]
    def run(sql, expected=None):
        p = subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=20)
        if expected:
            assert p.returncode != 0 and expected in p.stderr
        else:
            assert p.returncode == 0, 'Synthetic SQL failed'
        return p.stdout.strip()
    run("""
CREATE SCHEMA private;
CREATE FUNCTION private.has_admin_role(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.app_role',true) IN ('staff','admin') $$;
CREATE TABLE animals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,name text NOT NULL DEFAULT 'synthetic',status text NOT NULL DEFAULT 'available');
CREATE TABLE sponsorship_preference(animal_type_snapshot text NOT NULL CONSTRAINT sponsorship_preference_animal_type_snapshot_check CHECK (animal_type_snapshot IN ('sponsor')));
INSERT INTO animals(type) VALUES ('cat'),('dog'),('sponsor');
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT ALL ON animals TO anon,authenticated;
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;
""")
    run("INSERT INTO sponsorship_preference VALUES ('cat');",'sponsorship_preference_animal_type_snapshot_check')
    migration = Path('supabase/migrations/20260906162436_animal_catalog_membership.sql').read_text(encoding='utf-8')
    run(migration)
    assert run("SELECT count(*) FROM animals WHERE adoption_eligible=(type IN ('cat','dog')) AND sponsorship_eligible=(type='sponsor');") == '3'
    run("INSERT INTO sponsorship_preference VALUES ('cat'),('dog'),('sponsor');")
    run("INSERT INTO sponsorship_preference VALUES ('other');",'sponsorship_preference_animal_type_snapshot_check')
    function = migration[migration.index('CREATE OR REPLACE FUNCTION'):migration.index('REVOKE ALL ON FUNCTION')]
    before = function.replace("    AND (OLD.type='sponsor' OR NEW.type='sponsor')\n",'')
    target = "'eeeeeeee-0000-4000-8000-000000000001'"
    run("INSERT INTO animals(id,type,adoption_eligible,sponsorship_eligible) VALUES ("+target+",'cat',false,true);")
    assert run('BEGIN;'+before+"UPDATE animals SET type='dog' WHERE id="+target+"; SELECT adoption_eligible||','||sponsorship_eligible FROM animals WHERE id="+target+'; ROLLBACK;') == 'true,false'
    run("UPDATE animals SET type='dog' WHERE id="+target+';')
    assert run("SELECT adoption_eligible||','||sponsorship_eligible FROM animals WHERE id="+target+';') == 'false,true'
    run("UPDATE animals SET adoption_eligible=true WHERE id="+target+"; UPDATE animals SET type='cat' WHERE id="+target+';')
    assert run("SELECT adoption_eligible||','||sponsorship_eligible FROM animals WHERE id="+target+';') == 'true,true'
    run("UPDATE animals SET type='sponsor' WHERE id="+target+';')
    assert run("SELECT adoption_eligible||','||sponsorship_eligible FROM animals WHERE id="+target+';') == 'false,true'
    run('UPDATE animals SET retired_at=now() WHERE id='+target+';')
    assert run('SET ROLE anon; SELECT count(*) FROM animals;') == '3'
    assert run("SET ROLE authenticated; SET test.app_role=''; UPDATE animals SET name='forbidden'; SELECT count(*) FROM animals WHERE name='forbidden';") == '0'
    result = dict(snapshot_cat_rejected_before=True,snapshot_all_three_types_pass_after=True,invalid_species_rejected=True,species_correction_changed_membership_before=True,species_correction_preserves_membership_after=True,dual_membership_preserved=True,legacy_type_transition_compatible=True,retired_hidden_from_anon=True,nonstaff_write_denied=True,full_migration_applied_locally=True,production_writes=0,fixture='synthetic minimal tables and simulated role helper',database=db)
    Path('docs/evidence/legacy-import-20260906/catalog-membership-rehearsal.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))

if __name__ == '__main__':
    main()
