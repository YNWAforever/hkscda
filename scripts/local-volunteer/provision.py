#!/usr/bin/env python3
"""Provision this task's fresh, local-only acceptance target. Never contacts a cloud DB."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time

ROOT = Path(sys.argv[1]).resolve()
META = ROOT / 'target-construction.json'
m = json.loads(META.read_text())
assert m['syntheticOnly'] is True and m['productionConnection'] is False
assert m['dbHost'] == m['apiHost'] == '127.0.0.1'
assert m['dbPort'] == 59322 and m['apiPort'] == 59321
project = m['projectRef']
assert project.startswith('hkscda-volunteer-local-') and project.replace('-', '').isalnum()
DB = project + '-db'
VOLUME = project + '-pgdata'
LABEL = 'hkscda.fixture=' + m['fixtureId']
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
docker_env = dict(os.environ)
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    docker_env.pop(key, None)

def docker(*args, data=None):
    p = subprocess.run(DOCKER + list(args), input=data, text=True, capture_output=True, env=docker_env)
    if p.returncode:
        # None of our docker errors should include an environment value or connection URL.
        raise RuntimeError('Docker command failed: ' + str(args[:2]) + ': ' + p.stderr[:600])
    return p.stdout.strip()

def inspect(kind, name):
    return json.loads(docker(kind, 'inspect', name))[0]

def sql(text):
    return docker('exec', '-i', DB, 'psql', '-X', '-U', m.get('controlRole', 'postgres'), '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', data=text)

def physical_gate():
    c = inspect('container', DB)
    n = inspect('network', m['network'])
    v = inspect('volume', VOLUME)
    assert c['Config']['Labels']['hkscda.fixture'] == m['fixtureId']
    assert v['Labels']['hkscda.fixture'] == m['fixtureId']
    assert n['Internal'] is True
    assert set(c['NetworkSettings']['Networks']) == {m['network']}
    assert c['HostConfig']['PortBindings']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '59322'}]
    assert any(x.get('Name') == VOLUME and x['Destination'] == '/var/lib/postgresql/data' for x in c['Mounts'])
    assert c['Image'] == m['images']['postgres']['id']
    if 'containerId' in m:
        assert c['Id'] == m['containerId'] and n['Id'] == m['networkId']
        assert v['Name'] == m['volumeName'] and v['CreatedAt'] == m['volumeCreatedAt']
    return c, n, v

def identity_gate():
    physical_gate()
    identity = json.loads(sql("select json_build_object('systemIdentifier',system_identifier::text,'database',current_database()) from pg_control_system();"))
    assert identity['systemIdentifier'] == m['systemIdentifier'] and identity['database'] == 'postgres'
    marker = json.loads(sql('select row_to_json(t) from local_acceptance.identity t;'))
    assert marker['fixture_id'] == m['fixtureId'] and marker['project_ref'] == project
    return identity

if '--check' in sys.argv:
    print(json.dumps({'identityVerified': identity_gate(), 'projectRef': project, 'syntheticOnly': True}))
    sys.exit(0)

assert not (ROOT / 'private.json').exists(), 'Existing target: use --check; never overwrite credentials or volumes'
images = {'postgres': 'postgres:17-bookworm', 'auth': 'supabase/gotrue:v2.179.0', 'rest': 'postgrest/postgrest:v13.0.7', 'storage': 'supabase/storage-api:v1.28.1'}
m['images'] = {}
for key, tag in images.items():
    i = inspect('image', tag)
    m['images'][key] = {'tag': tag, 'id': i['Id'], 'digest': i['RepoDigests'][0]}
META.write_text(json.dumps(m, indent=2) + '\n')
network = inspect('network', m['network'])
assert network['Internal'] is True
assert VOLUME not in docker('volume', 'ls', '--format', '{{.Name}}').splitlines()
assert DB not in docker('ps', '-a', '--format', '{{.Names}}').splitlines()
private = {'controlPassword': secrets.token_hex(24), 'dbPassword': secrets.token_hex(24), 'authPassword': secrets.token_hex(24), 'restPassword': secrets.token_hex(24), 'storagePassword': secrets.token_hex(24), 'jwtSecret': secrets.token_hex(32)}
def jwt(role):
    enc = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(',', ':')).encode()).rstrip(b'=')
    body = enc({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + enc({'role': role, 'iss': project, 'aud': 'authenticated', 'iat': int(time.time()), 'exp': int(time.time()) + 86400})
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(private['jwtSecret'].encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()
private['anonKey'] = jwt('anon')
private['serviceKey'] = jwt('service_role')
(ROOT / 'private.json').write_text(json.dumps(private))
os.chmod(ROOT / 'private.json', 0o600)

def envfile(name, values):
    path = ROOT / name
    path.write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
    os.chmod(path, 0o600)
    return str(path)

docker('volume', 'create', '--label', LABEL, VOLUME)
docker('run', '-d', '--name', DB, '--label', LABEL, '--network', m['network'], '--network-alias', 'db', '--publish', '127.0.0.1:59322:5432', '--mount', 'type=volume,src='+VOLUME+',dst=/var/lib/postgresql/data', '--env-file', envfile('postgres.env', {'POSTGRES_USER': 'supabase_admin', 'POSTGRES_DB': 'postgres', 'POSTGRES_PASSWORD': private['controlPassword'], 'POSTGRES_INITDB_ARGS': '--locale=C.UTF-8 --encoding=UTF8 --auth-host=scram-sha-256 --auth-local=trust'}), m['images']['postgres']['digest'])
for _ in range(60):
    p = subprocess.run(DOCKER + ['exec', DB, 'pg_isready', '-U', 'postgres'], capture_output=True, env=docker_env)
    if p.returncode == 0:
        break
    time.sleep(0.5)
else:
    raise RuntimeError('New local PostgreSQL did not become ready in 30 seconds')
c, n, v = physical_gate()
initial = json.loads(sql("select json_build_object('systemIdentifier',system_identifier::text,'database',current_database(),'serverVersion',current_setting('server_version'),'volunteerTable',to_regclass('public.volunteer_profile'),'authSchema',to_regnamespace('auth'),'publicTables',(select count(*) from pg_tables where schemaname='public')) from pg_control_system();"))
assert initial['volunteerTable'] is None and initial['authSchema'] is None and initial['publicTables'] == 0
m['systemIdentifier'] = initial['systemIdentifier']
m['containerId'] = c['Id']
m['volumeName'] = VOLUME
m['volumeCreatedAt'] = v['CreatedAt']
m['networkId'] = n['Id']
m['initialDatabaseState'] = initial
META.write_text(json.dumps(m, indent=2) + '\n')
# First write, only after the physical fresh-volume/empty-DB gate above.
sql("create schema local_acceptance; revoke all on schema local_acceptance from public; create table local_acceptance.identity(fixture_id uuid primary key, project_ref text not null, created_at timestamptz default clock_timestamp()); insert into local_acceptance.identity(fixture_id,project_ref) values('"+m['fixtureId']+"','"+project+"');")
identity_gate()
# Standard local platform roles/schemas. No data or credentials from another instance.
sql("""
create role postgres login nosuperuser createdb createrole inherit bypassrls password '"""+private['dbPassword']+"""';
alter database postgres owner to postgres;
create role anon nologin inherit;
create role authenticated nologin inherit;
create role service_role nologin inherit bypassrls;
create role authenticator login noinherit password '"""+private['restPassword']+"""';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login noinherit createrole password '"""+private['authPassword']+"""';
create role supabase_storage_admin login noinherit password '"""+private['storagePassword']+"""';
create role dashboard_user nologin noinherit;
grant create on database postgres to supabase_storage_admin;
create schema auth authorization supabase_auth_admin;
create schema storage authorization supabase_storage_admin;
create schema extensions;
create extension citext with schema public;
create extension pg_trgm with schema public;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant usage on schema extensions to supabase_auth_admin, supabase_storage_admin;
alter role supabase_auth_admin set search_path=auth,public,extensions;
alter role supabase_storage_admin set search_path=storage,public,extensions;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),auth.jwt()->>'role') $$;
create function auth.email() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.email',true),''),auth.jwt()->>'email') $$;
alter function auth.jwt() owner to supabase_auth_admin;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.email() owner to supabase_auth_admin;
""")

def start(name, key, variables, ports=()):
    args = ['run', '-d', '--name', project+'-'+name, '--label', LABEL, '--network', m['network'], '--network-alias', name, '--env-file', envfile(name+'.env', variables)]
    for port in ports:
        args += ['--publish', port]
    args += [m['images'][key]['digest']]
    docker(*args)

start('auth','auth', {'GOTRUE_API_HOST':'0.0.0.0','PORT':'9999','API_EXTERNAL_URL':'http://127.0.0.1:59321/auth/v1','GOTRUE_SITE_URL':'http://127.0.0.1:59330','GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgres://supabase_auth_admin:'+private['authPassword']+'@db:5432/postgres?search_path=auth','GOTRUE_JWT_SECRET':private['jwtSecret'],'GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP':'authenticated','GOTRUE_JWT_EXP':'3600','GOTRUE_DISABLE_SIGNUP':'false','GOTRUE_MAILER_AUTOCONFIRM':'true'})
start('rest','rest', {'PGRST_DB_URI':'postgres://authenticator:'+private['restPassword']+'@db:5432/postgres','PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':private['jwtSecret'],'PGRST_DB_EXTRA_SEARCH_PATH':'public,extensions'})
start('storage','storage', {'ANON_KEY':private['anonKey'],'SERVICE_KEY':private['serviceKey'],'POSTGREST_URL':'http://rest:3000','PGRST_JWT_SECRET':private['jwtSecret'],'AUTH_JWT_SECRET':private['jwtSecret'],'DATABASE_URL':'postgres://supabase_storage_admin:'+private['storagePassword']+'@db:5432/postgres','TENANT_ID':project,'REGION':'local','STORAGE_BACKEND':'file','FILE_STORAGE_BACKEND_PATH':'/var/lib/storage','GLOBAL_S3_BUCKET':'synthetic-local','ENABLE_IMAGE_TRANSFORMATION':'false'})
print(json.dumps({'projectRef': project,'systemIdentifier':m['systemIdentifier'],'database':initial,'networkInternal':True,'dbHost':'127.0.0.1','dbPort':59322,'containerId':m['containerId'],'volume':VOLUME,'syntheticOnly':True,'bootstrap':'local platform schemas only; no application fixtures yet'}))
