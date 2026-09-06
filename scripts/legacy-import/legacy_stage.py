"""Decode phpMyAdmin literal INSERTs into local-only staging; never execute source SQL.

This is an inspection/staging tool, not a Supabase production importer.
"""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess

EXCLUDED = {'users', 'roles', 'password_resets', 'migrations', 'global_options'}
NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?')
HEADER = re.compile(r'INSERT\s+INTO\s+`([a-zA-Z_]+)`\s*\(([^)]+)\)\s*VALUES\s*', re.I)


def statements(text):
    start=0; i=0; quoted=False
    while i < len(text):
        c=text[i]
        if quoted:
            if c=='\\': i+=2; continue
            if c=="'":
                if i+1<len(text) and text[i+1]=="'": i+=2; continue
                quoted=False
        elif c=="'": quoted=True
        elif text.startswith('--',i) and (i+2==len(text) or text[i+2].isspace()):
            end=text.find('\n',i)
            if text[start:i].strip(): raise ValueError('Inline comments not supported')
            i=len(text) if end<0 else end+1; start=i; continue
        elif text.startswith('/*',i):
            end=text.find('*/',i+2)
            if end<0 or text[start:i].strip(): raise ValueError('Unsupported comment')
            body=text[i+2:end].strip()
            if body.upper().startswith('M!'): raise ValueError('Unsupported MariaDB executable comment')
            if body.startswith('!'):
                directive=re.sub(r'^!\d*\s*','',body).strip()
                allowed={
                    'SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT',
                    'SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS',
                    'SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION',
                    'SET NAMES utf8mb4',
                    'SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT',
                    'SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS',
                    'SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION',
                }
                if directive not in allowed: raise ValueError('Unsupported executable SQL comment')
            i=end+2; start=i; continue
        elif c==';':
            value=text[start:i].strip()
            if value: yield value
            start=i+1
        i+=1
    if quoted or text[start:].strip(): raise ValueError('Incomplete SQL statement')


def parse_inserts(text):
    for stmt in statements(text.lstrip('\ufeff')):
        match=HEADER.match(stmt)
        if not match:
            if re.fullmatch(r"SET SQL_MODE\s*=\s*[\"']NO_AUTO_VALUE_ON_ZERO[\"']|SET time_zone\s*=\s*[\"']\+00:00[\"']|START TRANSACTION|COMMIT",stmt,re.I): continue
            raise ValueError('Unsupported SQL statement; nothing executed')
        table=match[1]; cols=re.findall(r'`([a-zA-Z_]+)`',match[2])
        if not cols or len(set(cols))!=len(cols) or re.sub(r'`[a-zA-Z_]+`|[\s,]','',match[2]):
            raise ValueError('Invalid columns')
        rows=[]; i=match.end(); n=len(stmt)
        def whitespace(pos):
            while pos<n and stmt[pos].isspace(): pos+=1
            return pos
        while True:
            i=whitespace(i)
            if i>=n or stmt[i]!='(': raise ValueError('Expected literal row')
            i+=1; row=[]
            while True:
                i=whitespace(i)
                if i>=n: raise ValueError('Incomplete row')
                if stmt[i]=="'":
                    i+=1; value=[]
                    while i<n:
                        if stmt[i]=='\\':
                            i+=1
                            if i>=n: raise ValueError('Incomplete escape')
                            value.append({'0':'\0','n':'\n','r':'\r','t':'\t','b':'\b','Z':'\x1a'}.get(stmt[i],stmt[i])); i+=1
                        elif stmt[i]=="'":
                            if i+1<n and stmt[i+1]=="'": value.append("'"); i+=2
                            else: i+=1; break
                        else: value.append(stmt[i]); i+=1
                    else: raise ValueError('Unterminated string')
                    row.append(''.join(value))
                elif stmt[i:i+4].upper()=='NULL': row.append(None); i+=4
                else:
                    number=NUMBER.match(stmt,i)
                    if not number: raise ValueError('Only literal values supported')
                    row.append(number[0]); i=number.end()
                i=whitespace(i)
                if i<n and stmt[i]==',': i+=1; continue
                if i<n and stmt[i]==')': i+=1; break
                raise ValueError('Malformed literal row')
            if len(row)!=len(cols): raise ValueError('Column count mismatch')
            rows.append(row); i=whitespace(i)
            if i==n: break
            if stmt[i]!=',': raise ValueError('Unsupported INSERT suffix')
            i+=1
        yield table,cols,rows


def money_cents(value):
    try:
        scaled=Decimal(value)*100
        if not scaled.is_finite() or scaled!=scaled.to_integral_value() or not 0<=scaled<=2147483647:
            raise ValueError('Unrepresentable nonnegative integer cents')
        return int(scaled)
    except (InvalidOperation, TypeError): raise ValueError('Invalid money') from None


def stage(db,text,inventory):
    db.execute('CREATE TABLE IF NOT EXISTS legacy_rows (source_table TEXT NOT NULL, legacy_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(source_table,legacy_id))')
    summary={'inserted':0,'unchanged':0,'excluded':0,'source_counts':Counter()}
    with db:
        for table,cols,rows in parse_inserts(text):
            if table not in inventory or set(cols)!=set(inventory[table]): raise ValueError('Source schema mismatch: '+table)
            summary['source_counts'][table]+=len(rows)
            if table in EXCLUDED:
                summary['excluded']+=len(rows); continue
            for row in rows:
                record=dict(zip(cols,row)); key=record.get('id',record.get('ID'))
                if key is None or not key.isdigit(): raise ValueError('Invalid legacy primary key')
                if table=='files': record.pop('token',None)
                payload=json.dumps(record,ensure_ascii=False,sort_keys=True)
                old=db.execute('SELECT payload FROM legacy_rows WHERE source_table=? AND legacy_id=?',(table,key)).fetchone()
                if old:
                    if old[0]!=payload: raise ValueError('Conflicting legacy primary key in '+table)
                    summary['unchanged']+=1
                else:
                    db.execute('INSERT INTO legacy_rows VALUES (?,?,?)',(table,key,payload)); summary['inserted']+=1
    summary['source_counts']=dict(summary['source_counts'])
    return summary


def inspect(db):
    tables={}
    for table,key,payload in db.execute('SELECT * FROM legacy_rows'):
        tables.setdefault(table,{})[key]=json.loads(payload)
    report={'staged_counts':{t:len(rows) for t,rows in tables.items()}}
    links=[('adoptions','animal_id','animals'),('adoptions','approved_animal_id','animals'),('adoptions','member_id','members'),('adoptions','adoption_status_id','adoption_statuses'),('adoption_file','adoption_id','adoptions'),('adoption_file','file_id','files'),('adoption_followups','adoption_id','adoptions'),('adoption_advertising_source','adoption_id','adoptions'),('adoption_advertising_source','advertising_source_id','advertising_sources'),('animals','profile_pic_id','files'),('animals','arrival_source_id','arrival_sources'),('animals','current_position_id','positions'),('medicals','animal_id','animals'),('medicals','medical_type_id','medical_types'),('medicals','volunteer_id','volunteers'),('donations','payment_ID','payment_method'),('sponsorships','animal_id','animals'),('rescue_images','rescue_id','rescues'),('audit_reports','file_id','files'),('members','living_area_id','living_areas'),('volunteers','living_area_id','living_areas')]
    for suffix,lookup in [('dows','dow'),('positions','position'),('timeslots','timeslot')]:
        links.extend([('volunteers_volunteer_'+suffix,'volunteer_id','volunteers'),('volunteers_volunteer_'+suffix,'volunteer_'+lookup+'_id','volunteer_'+suffix)])
    report['relationships']={}
    quarantined={}
    for source,col,target in links:
        values=[r[col] for r in tables.get(source,{}).values() if r.get(col) is not None]
        report['relationships'][source+'.'+col]={'non_null':len(values),'unresolved':sum(v not in tables.get(target,{}) for v in values)}
        for key,row in tables.get(source,{}).items():
            if row.get(col) is not None and row[col] not in tables.get(target,{}):
                quarantined.setdefault((source,key),[]).append(col+' unresolved')
    with db:
        db.execute('CREATE TABLE IF NOT EXISTS quarantine (source_table TEXT, legacy_id TEXT, reasons TEXT, PRIMARY KEY(source_table,legacy_id))')
        db.execute('DELETE FROM quarantine')
        db.executemany('INSERT INTO quarantine VALUES (?,?,?)',[(t,k,json.dumps(reasons)) for (t,k),reasons in quarantined.items()])
    report['relationship_checks_are_exhaustive']=False
    report['quarantined_rows_selected_relationships']=len(quarantined)
    report['quarantined_by_table']=dict(Counter(t for t,k in quarantined))
    report['identity']={}
    for table,col in [('members','email'),('adoptions','applicant_email'),('volunteers','email'),('donations','donor_email')]:
        values=[r.get(col) for r in tables.get(table,{}).values()]
        counts=Counter(v.strip().casefold() for v in values if v and v.strip())
        report['identity'][table]={'missing_email':sum(not v or not v.strip() for v in values),'repeated_email_groups':sum(v>1 for v in counts.values()),'rows_in_repeated_groups':sum(v for v in counts.values() if v>1)}
    report['money']={}
    for table,field in [('donations','amount'),('sponsorships','amount'),('adoption_fees','amount'),('medicals','fee')]:
        total=invalid=missing=0
        for row in tables.get(table,{}).values():
            value=row.get(field)
            if value is None or value=='': missing+=1; continue
            try: total+=money_cents(value)
            except ValueError: invalid+=1
        report['money'][table]={'valid_amount_total_cents':total,'invalid_amount_rows':invalid,'missing_amount_rows':missing,'currency_verified':False}
    report['files']={'metadata_rows':len(tables.get('files',{})),'asset_bytes_verified':0}
    return report


def checked_database_path(value):
    root=Path(__file__).resolve().parents[2]
    target=Path(value).resolve()
    if not target.is_relative_to(root / 'backups') or target.suffix!='.sqlite':
        raise ValueError('Staging database must be in this repository backups directory')
    check=subprocess.run(['git','check-ignore','--quiet','--',str(target)],cwd=root,capture_output=True)
    if check.returncode!=0: raise ValueError('Staging database must be Git ignored')
    return target


def bind_source(db,digest):
    db.execute('CREATE TABLE IF NOT EXISTS source_manifest (singleton INTEGER PRIMARY KEY CHECK(singleton=1), sha256 TEXT NOT NULL)')
    old=db.execute('SELECT sha256 FROM source_manifest').fetchone()
    if old and old[0]!=digest: raise ValueError('Staging database belongs to a different source')
    if not old:
        legacy=db.execute("SELECT 1 FROM sqlite_master WHERE name='legacy_rows'").fetchone()
        if legacy and db.execute('SELECT count(*) FROM legacy_rows').fetchone()[0]:
            raise ValueError('Existing unbound staging data; use a fresh destination')
        with db: db.execute('INSERT INTO source_manifest VALUES (1,?)',(digest,))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True); parser.add_argument('--inventory',required=True)
    parser.add_argument('--database',required=True); parser.add_argument('--report',required=True)
    args=parser.parse_args()
    target=checked_database_path(args.database)
    target.parent.mkdir(parents=True,exist_ok=True)
    source=Path(args.source).read_bytes()
    inventory={t['name']:[c['name'] for c in t['columns']] for t in json.loads(Path(args.inventory).read_text(encoding='utf-8-sig'))['tables']}
    db=sqlite3.connect(target)
    try:
        bind_source(db,hashlib.sha256(source).hexdigest())
        result=stage(db,source.decode('utf-8-sig'),inventory)
        repeat=stage(db,source.decode('utf-8-sig'),inventory)
        result.update({'source_sha256':hashlib.sha256(source).hexdigest(),'source_bytes':len(source),'repeat_run':repeat,'inspection':inspect(db),'production_writes':0,'target_schema_imported':False})
        Path(args.report).write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
        print(json.dumps({'inserted':result['inserted'],'excluded':result['excluded'],'repeat_inserted':repeat['inserted'],'tables_with_data':len(result['source_counts'])}))
    finally: db.close()

if __name__=='__main__':
    try: main()
    except Exception as error:
        # SQL/driver errors can embed row contents; never print their details.
        print('Local staging failed: '+type(error).__name__+'; no record contents displayed.')
        raise SystemExit(1)
