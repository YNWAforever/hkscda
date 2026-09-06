import json,subprocess,uuid
from pathlib import Path

def main():
 container='hkscda-animal-replacement-20260907'
 info=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
 assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
 assert info['Config']['Labels'].get('purpose')=='hkscda-animal-replacement-local'
 db='profile_schema_'+uuid.uuid4().hex[:10]
 subprocess.run(['docker','exec',container,'createdb','-U','postgres',db],check=True,capture_output=True)
 cmd=['docker','exec','-i',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]
 def run(sql,fail=None):
  p=subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=20)
  if fail: assert p.returncode and fail in p.stderr
  else: assert p.returncode==0, 'Local schema check failed'
  return p.stdout.strip()
 run('CREATE SCHEMA private; CREATE TABLE animals(id integer PRIMARY KEY); INSERT INTO animals VALUES(1);')
 run('SELECT public_profile FROM animals;','does not exist')
 run(Path('supabase/migrations/20260906181657_animal_public_profile.sql').read_text(encoding='utf-8'))
 valid={'code':'C807','birthday':'2024-02-29','neutered':False,'suitability':'newbie','personality':'Friendly','health':None,'story':None,'recordDate':'2026-09-07'}
 def patch(value): return "UPDATE animals SET public_profile='"+json.dumps(value).replace("'","''")+"'::jsonb WHERE id=1;"
 run(patch(valid))
 invalid=[{'remarks':'private'},{'neutered':'null'},{'birthday':'2024-02-30'},{'health':'call 9123 4567'},{'story':'<b>private</b>'},{'suitability':'any'},{'story':{'private':'value'}},[],{'health':'contact@example.com'}]
 for value in invalid: run(patch(value),'animals_public_profile_valid')
 assert json.loads(run('SELECT public_profile FROM animals WHERE id=1;'))==valid
 report=dict(database=db,missing_column_reproduced=True,valid_profile_saved=True,invalid_profiles_rejected=len(invalid),failed_updates_preserved_profile=True,production_writes=0)
 Path('docs/evidence/legacy-import-20260906/public-profile-schema-rehearsal.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report))

if __name__=='__main__': main()
