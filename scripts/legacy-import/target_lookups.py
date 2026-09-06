"""Build a local-only PostgreSQL rehearsal for three inactive reference tables."""
import json
from pathlib import Path
import sqlite3
import uuid
from legacy_stage import checked_database_path, money_cents

TABLES={'arrival_sources':'arrival_source','living_areas':'living_area','adoption_fees':'adoption_fee'}
SOURCE_HASH='7a9454278c84c797a7a75bd56bfd416db852c2758483dc999f0e344a06a64225'


def literal(value):
    if '\0' in value: raise ValueError('NUL is not valid PostgreSQL text')
    return "'"+value.replace("'","''")+"'"


def map_lookup(table,row,legacy_id=None):
    if legacy_id is not None and legacy_id!=row.get("id"): raise ValueError("Staging key differs from payload ID")
    if table not in TABLES or not str(row.get('id','')).isdigit(): raise ValueError('Invalid lookup key')
    result={'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'hkscda:legacy:v1:'+table+':'+row['id'])),'is_active':False}
    if table=='adoption_fees':
        description=row.get('description')
        if not description or not description.strip(): raise ValueError('Missing fee description')
        result.update(description=description,amount_cents=money_cents(row.get('amount')))
    else:
        label=row.get('name_zh') or row.get('name')
        if not label or not label.strip(): raise ValueError('Missing lookup label')
        result.update(name_zh=label,name_en=row.get('name_en') or None,sort_order=0)
    for value in result.values():
        if isinstance(value,str): literal(value)
    return result


SETUP="""
\\set ON_ERROR_STOP on
SET standard_conforming_strings=on;
CREATE FUNCTION pg_temp.require(ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Local import assertion failed'; END IF; END $$;
SELECT pg_temp.require(current_database()='hkscda_legacy');
CREATE SCHEMA IF NOT EXISTS import_private;
REVOKE ALL ON SCHEMA import_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.arrival_source (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name_zh text NOT NULL, name_en text, sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.living_area (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name_zh text NOT NULL, name_en text, sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.adoption_fee (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents>=0), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.arrival_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.living_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adoption_fee ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS import_private.manifest (source_hash text NOT NULL, source_table text NOT NULL, legacy_id text NOT NULL, target_table text NOT NULL, target_id uuid NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(source_table,legacy_id), UNIQUE(target_table,target_id));
CREATE TABLE IF NOT EXISTS import_private.audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source_table text NOT NULL, legacy_id text NOT NULL, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE import_private.manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_private.audit ENABLE ROW LEVEL SECURITY;
"""


def import_sql(records,fail=False):
    parts=['BEGIN;']
    for source,key,row in records:
        target=TABLES[source]
        payload=literal(json.dumps(row,ensure_ascii=False,sort_keys=True))+'::jsonb'
        source_lit=literal(source); key_lit=literal(key); ident=literal(row['id'])+'::uuid'
        manifest=f'source_table={source_lit} AND legacy_id={key_lit}'
        # Existing rows can only be reused if owned by this exact source manifest.
        parts.append(f'SELECT pg_temp.require(NOT EXISTS (SELECT 1 FROM public.{target} WHERE id={ident}) OR EXISTS (SELECT 1 FROM import_private.manifest WHERE {manifest} AND source_hash={literal(SOURCE_HASH)} AND target_id={ident} AND payload={payload}));')
        parts.append(f'SELECT pg_temp.require(NOT EXISTS (SELECT 1 FROM import_private.manifest WHERE {manifest} AND (source_hash<>{literal(SOURCE_HASH)} OR payload<>{payload})));')
        cols=list(row)
        # jsonb_populate_record performs PostgreSQL type conversion and keeps SQL data literal.
        colsql=','.join(cols)
        parts.append(f'INSERT INTO public.{target} ({colsql}) SELECT {colsql} FROM jsonb_populate_record(NULL::public.{target},{payload}) ON CONFLICT(id) DO NOTHING;')
        selected='jsonb_build_object('+','.join(literal(col)+','+col for col in cols)+')'
        parts.append(f'SELECT pg_temp.require((SELECT {selected}={payload} FROM public.{target} WHERE id={ident}));')
        parts.append(f"WITH added AS (INSERT INTO import_private.manifest VALUES ({literal(SOURCE_HASH)},{source_lit},{key_lit},{literal(target)},{ident},{payload}) ON CONFLICT(source_table,legacy_id) DO NOTHING RETURNING source_table,legacy_id) INSERT INTO import_private.audit(source_table,legacy_id,action) SELECT source_table,legacy_id,'import' FROM added;")
    if fail: parts.append('SELECT pg_temp.require(false);')
    parts.append('COMMIT;')
    return '\n'.join(parts)+'\n'


def main():
    target=checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite')
    db=sqlite3.connect(target.as_uri()+'?mode=ro',uri=True)
    try:
        if db.execute('SELECT sha256 FROM source_manifest').fetchone()[0]!=SOURCE_HASH: raise ValueError('Wrong source')
        records=[]
        for source in TABLES:
            for key,text in db.execute('SELECT legacy_id,payload FROM legacy_rows WHERE source_table=? ORDER BY CAST(legacy_id AS INTEGER)',(source,)):
                records.append((source,key,map_lookup(source,json.loads(text),legacy_id=key)))
    finally: db.close()
    output=target.parent
    (output/'lookup-setup.sql').write_text(SETUP,encoding='utf-8')
    # Each psql session needs its own temporary assertion function, without schema setup.
    prologue=SETUP.split('CREATE SCHEMA')[0]
    (output/'lookup-import.sql').write_text(prologue+import_sql(records),encoding='utf-8')
    (output/'lookup-force-failure.sql').write_text(prologue+import_sql(records,fail=True),encoding='utf-8')
    counts={TABLES[source]:sum(r[0]==source for r in records) for source in TABLES}
    report={'source_sha256':SOURCE_HASH,'proposed_local_inserts':counts,'all_inactive':True,'production_collision_checks_run':False,'source_timestamps_preserved':False,'timestamp_note':'Target timestamps represent local import time; original source timestamps stay in private staging.'}
    Path('docs/evidence/legacy-import-20260906/lookup-mapping.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(counts))

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Lookup preparation failed: '+type(error).__name__)
        raise SystemExit(1)
