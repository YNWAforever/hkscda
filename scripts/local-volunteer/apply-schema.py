#!/usr/bin/env python3
"""Apply repository schema and the retry draft only to the constructed local target."""
import hashlib
import json
from pathlib import Path
import subprocess
import os
import sys

docker_env = dict(os.environ)
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:
    docker_env.pop(key, None)

root = Path(sys.argv[1]).resolve()
repo = Path(__file__).resolve().parents[2]
subprocess.run([sys.executable, str(repo/'scripts/local-volunteer/provision.py'), str(root), '--check'], check=True)
m = json.loads((root/'target-construction.json').read_text())
command = ['docker','--host=unix:///var/run/docker.sock','exec','-i',m['containerId'],'psql','-X','-U',m.get('controlRole','postgres'),'-d','postgres','-v','ON_ERROR_STOP=1']
gate = "do $$ begin if (select system_identifier::text from pg_control_system()) <> '"+m['systemIdentifier']+"' or not exists(select 1 from local_acceptance.identity where fixture_id='"+m['fixtureId']+"' and project_ref='"+m['projectRef']+"') then raise exception 'Local target identity mismatch'; end if; end $$;\n"
def execute(text, transactional=True, owner=False):
    role = ("set local role postgres;\n" if transactional else "set role postgres;\n") if owner else ""
    p = subprocess.run(command + (['-1'] if transactional else []), input=gate+role+text, text=True, capture_output=True, env=docker_env)
    return p

assert m.get('controlRole') == 'supabase_admin', 'Initialize the cluster with the standard platform controller; never demote the bootstrap user'

# This bootstrap path is for an empty synthetic Auth target only.
empty = subprocess.check_output(command+['-At','-c','select count(*) from auth.users'],text=True, env=docker_env).strip()
assert empty == '0', 'Never reconfigure platform roles after fixture/user creation'
# Standard local Supabase platform ACL, supplied by its DB distribution in the CLI.
# This independent PostgreSQL distribution must set it explicitly; do not weaken
# the repository's managed-Auth admission guards or grant Auth to service_role.
p = execute("do $$ begin if not exists(select 1 from pg_roles where rolname='dashboard_user') then create role dashboard_user nologin noinherit; end if; end $$; set role supabase_auth_admin; revoke all on auth.users from postgres, dashboard_user; grant all on auth.users to dashboard_user; grant all on auth.users to postgres; grant select on auth.users to postgres with grant option; grant execute on function auth.uid() to dashboard_user; reset role;")
assert p.returncode == 0, p.stderr
# OID-relative ordering is part of the unchanged volunteer admission profile.
# A dashboard role created too early has identical rights but a different array
# order. It has no login or owned data; recreate only this test-owned role in a
# single transaction, retaining the exact logical grant set.
p = execute("""
do $$ begin
 if (select oid from pg_roles where rolname='dashboard_user') < (select oid from pg_roles where rolname='supabase_auth_admin') then
  if exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid='dashboard_user'::regrole and deptype='o') then
   raise exception 'Dashboard role owns objects; refusing local reconstruction';
  end if;
  set role supabase_auth_admin;
  revoke all on auth.users from dashboard_user;
  revoke execute on function auth.uid() from dashboard_user;
  reset role;
  drop role dashboard_user;
  create role dashboard_user nologin noinherit;
  set role supabase_auth_admin;
  revoke all on auth.users from postgres;
  grant all on auth.users to dashboard_user, postgres;
  grant select on auth.users to postgres with grant option;
  grant execute on function auth.uid() to dashboard_user;
  reset role;
 end if;
end $$;
""")
assert p.returncode == 0, p.stderr
# Complete the standard platform namespace/default templates, preserving the
# repository's narrower postgres-owned future-table grants for anon/authenticated.
p = execute("""
do $$ begin if not exists(select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin noinherit; end if; end $$;
grant supabase_auth_admin, supabase_storage_admin to postgres;
grant usage on schema auth, storage, extensions to postgres;
revoke usage on schema public from supabase_auth_admin, supabase_storage_admin;
grant usage on schema public to postgres;
alter default privileges for role postgres in schema public grant all on tables to postgres;
alter default privileges for role postgres in schema public grant all on sequences to postgres;
alter default privileges for role postgres in schema public grant all on functions to postgres;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;
""")
assert p.returncode == 0, p.stderr
p = execute('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);', owner=True)
assert p.returncode == 0, p.stderr
volunteer_only = '--volunteer-only' in sys.argv
cutoff = '20261002170945'
source_files = sorted((repo/'supabase/migrations').glob('*.sql'))
selected = [f for f in source_files if not volunteer_only or f.name < cutoff or 'volunteer' in f.name]
excluded = [f.name for f in source_files if f not in selected]
(root/'schema-scope.json').write_text(json.dumps({'mode':'volunteer-fixture' if volunteer_only else 'full','selected':[f.name for f in selected],'notApplied':excluded},indent=2)+'\n')
existing = subprocess.check_output(command + ['-At','-c','select version from supabase_migrations.schema_migrations order by version'], text=True, env=docker_env).splitlines()
applied = json.loads((root/'schema-applied.json').read_text()) if (root/'schema-applied.json').exists() else []
for f in selected:
    version = f.name.split('_')[0]
    digest = hashlib.sha256(f.read_bytes()).hexdigest()
    if version in existing:
        assert any(row['file']==f.name and row['sha256']==digest for row in applied), 'Do not trust unknown installed migration '+f.name
        continue
    text = f.read_text(encoding='utf-8-sig')
    text += "\ninsert into supabase_migrations.schema_migrations(version,name) values ('"+version+"','"+f.name+"');"
    p = execute(text, owner=True)
    if p.returncode:
        (root/'schema-failure.log').write_text('File: '+f.name+'\n'+p.stdout+'\n'+p.stderr)
        print('FAILED', f.name, p.stderr[-2000:], flush=True)
        sys.exit(p.returncode)
    applied.append({'file':f.name,'sha256':digest})
    (root/'schema-applied.json').write_text(json.dumps(applied,indent=2)+'\n')
    if len(applied)%20==0:
        print('Applied',len(applied),'source migrations',flush=True)
assert all(any(row['file']==f.name for row in applied) for f in selected)
# Preserve GoTrue's native helper bodies; repository guards admit this installed version.
file = repo/'supabase/drafts/20261025000000_volunteer_runtime_retry_with_audit.sql'
p = execute(file.read_text(), transactional=False, owner=True)
assert p.returncode == 0, p.stderr
proof = subprocess.check_output(command+['-At','-c',"""select json_build_object('systemIdentifier',(select system_identifier::text from pg_control_system()),'signature',p.oid::regprocedure::text,'securityDefiner',p.prosecdef,'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),'anonExecute',has_function_privilege('anon',p.oid,'execute'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'execute'),'serviceExecute',has_function_privilege('service_role',p.oid,'execute'),'definitionMd5',md5(pg_get_functiondef(p.oid)),'authUsers',(select count(*) from auth.users),'volunteerProfiles',(select count(*) from public.volunteer_profile)) from pg_proc p where p.oid='public.retry_volunteer_runtime_job_with_audit(uuid,timestamptz,timestamptz,uuid,boolean,text)'::regprocedure;"""],text=True,env=docker_env)
result=json.loads(proof)
assert result['systemIdentifier']==m['systemIdentifier'] and result['securityDefiner'] is True
assert result['anonExecute'] is False and result['authenticatedExecute'] is False and result['serviceExecute'] is True
assert result['authUsers']==0 and result['volunteerProfiles']==0
result['draftSha256']=hashlib.sha256(file.read_bytes()).hexdigest()
result['sourceMigrationCount']=len(applied)
result['schemaMode']='volunteer-fixture' if volunteer_only else 'full'
result['notApplied']=excluded
(root/'migration-installed.json').write_text(json.dumps(result,indent=2)+'\n')
execute("notify pgrst, 'reload schema';")
print(json.dumps(result),flush=True)
