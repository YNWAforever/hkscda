"""Prepare private animal replacement candidates; never perform production writes."""
from collections import Counter
from datetime import date
import hashlib
import json
from pathlib import Path
import sqlite3
import uuid
from legacy_stage import checked_database_path
from photo_stage import atomic_manifest
from target_lookups import SOURCE_HASH


def project_animal(row,as_of,photos):
    key=row.get('id')
    if not isinstance(key,str) or not key.isdigit(): raise ValueError('Invalid legacy animal ID')
    today=date.fromisoformat(as_of); holds=[]
    gender={'f':'female','m':'male'}.get(row.get('gender'))
    if gender is None: holds.append('missing_or_unsupported_gender')
    if row.get('type') not in ('cat','dog'): holds.append('unsupported_species')
    name=row.get('name')
    if not name or not name.strip(): holds.append('missing_name')
    age='不詳'; birthday=row.get('birthday')
    if birthday:
        try:
            born=date.fromisoformat(birthday)
            if born>today: raise ValueError('Future birthday')
            years=today.year-born.year-((today.month,today.day)<(born.month,born.day))
            months=(today.year-born.year)*12+today.month-born.month-(today.day<born.day)
            age=str(years)+' 歲' if years else str(max(0,months))+' 個月'
        except ValueError: holds.append('invalid_birthday')
    archived=[f for f in ('deleted_at','died_at','adopted_at') if row.get(f)]
    valid=not holds and not archived
    adoption=valid and row.get('is_adoptable')=='1'
    sponsorship=valid and row.get('is_inside_support_pool')=='1'
    photo=photos.get(key)
    if photo and photo.get('also_adoption_attachment'):
        holds.append('photo_also_adoption_attachment'); photo=None
    return {'legacy_id':key,'canonical_candidate_id':str(uuid.uuid5(uuid.NAMESPACE_URL,'hkscda:legacy:v1:animals:'+key)),
        'legacy_status':row.get('status'),'adoption_candidate':adoption,'sponsorship_candidate':sponsorship,
        'lifecycle_exclusions':archived,'holds':holds,'photo_candidate':photo.get('object_name') if photo else None,
        'public_fields':{'name':name,'type':row.get('type'),'gender':gender,'age':age},
        'public_description':None,'public_notes':None,'publication_approved':False}


def main():
    root=checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite').parent
    db=sqlite3.connect((root/'verified-staging.sqlite').as_uri()+'?mode=ro',uri=True)
    try:
        if db.execute('SELECT sha256 FROM source_manifest').fetchone()[0]!=SOURCE_HASH: raise ValueError('Wrong source')
        rows=[(key,json.loads(payload)) for key,payload in db.execute("SELECT legacy_id,payload FROM legacy_rows WHERE source_table='animals' ORDER BY CAST(legacy_id AS INTEGER)")]
    finally: db.close()
    photo_bytes=(root/'animal-photo-manifest.json').read_bytes(); source_photos=json.loads(photo_bytes)
    if source_photos['source_sql_sha256']!=SOURCE_HASH: raise ValueError('Photo source mismatch')
    photos={}
    for entry in source_photos['entries']:
        if entry['status']=='staged_private':
            for key in entry['animal_ids']:
                if key in photos: raise ValueError('Multiple photo candidates')
                photos[key]=entry
    projected=[]
    for key,row in rows:
        if key!=row['id']: raise ValueError('Staged key mismatch')
        projected.append(project_animal(row,'2026-09-07',photos))
    payload={'version':1,'source_sha256':SOURCE_HASH,'photo_manifest_sha256':hashlib.sha256(photo_bytes).hexdigest(),'as_of':'2026-09-07',
        'rule':'explicit flags; exclude deleted/deceased/adopted dates and invalid required fields; unknown status codes preserved',
        'publication_approved':False,'animals':projected}
    content=(json.dumps(payload,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf-8'); digest=hashlib.sha256(content).hexdigest()
    atomic_manifest(root/('animal-replacement-'+digest+'.json'),content)
    atomic_manifest(root/'animal-replacement-candidate.json',content)
    report={'candidate_sha256':digest,'as_of':payload['as_of'],'source_animals':len(projected),'public_candidates':{},'production_writes':0,'publication_approved':False}
    for kind,field in [('adoption','adoption_candidate'),('sponsorship','sponsorship_candidate')]:
        subset=[r for r in projected if r[field]]
        report['public_candidates'][kind]={'total':len(subset),'by_species':dict(Counter(r['public_fields']['type'] for r in subset)),
            'with_photo':sum(bool(r['photo_candidate']) for r in subset),'without_photo':sum(not r['photo_candidate'] for r in subset)}
    report['shared_adoption_and_sponsor']=sum(r['adoption_candidate'] and r['sponsorship_candidate'] for r in projected)
    report['distinct_public_candidates']=sum(r['adoption_candidate'] or r['sponsorship_candidate'] for r in projected)
    report['private_history_only']=len(projected)-report['distinct_public_candidates']
    report['holds']=dict(Counter(h for r in projected for h in r['holds']))
    Path('docs/evidence/legacy-import-20260906/animal-replacement-candidate.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Replacement preparation failed: '+type(error).__name__+'; no private details displayed')
        raise SystemExit(1)
