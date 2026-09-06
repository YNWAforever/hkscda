"""Verify exact legacy animal-photo links and copy unchanged bytes to private local staging."""
import argparse
from collections import Counter,defaultdict
import hashlib
import io
import json
import os
from pathlib import Path,PurePosixPath
import re
import sqlite3
import tempfile
from urllib.parse import unquote
import warnings
from legacy_stage import checked_database_path
from target_lookups import SOURCE_HASH


def safe_basename(value):
    if not isinstance(value,str) or not value or '\\' in value or ':' in value or '\0' in value:
        raise ValueError('Unsupported asset path')
    decoded=unquote(value)
    path=PurePosixPath(decoded)
    if decoded!=value or path.is_absolute() or any(p in ('.','..') for p in decoded.split('/')):
        raise ValueError('Unsafe or encoded asset path')
    if not path.name: raise ValueError('Missing asset name')
    return path.name


def unique_match(name,metadata,local):
    if len(metadata.get(name,[]))!=1 or len(local.get(name,[]))!=1: return None
    return metadata[name][0],local[name][0]


def write_temporary(directory,data):
    temporary=None
    try:
        with tempfile.NamedTemporaryFile(dir=directory,prefix='.photo-import-',suffix='.tmp',delete=False) as out:
            temporary=Path(out.name)
            out.write(data); out.flush(); os.fsync(out.fileno())
        return temporary
    except BaseException:
        if temporary is not None: temporary.unlink(missing_ok=True)
        raise


def atomic_blob(directory,digest,suffix,data):
    if not re.fullmatch('[0-9a-f]{64}',digest) or suffix not in ('.jpeg','.png'):
        raise ValueError('Invalid object name')
    if hashlib.sha256(data).hexdigest()!=digest: raise ValueError('Input checksum mismatch')
    target=directory/(digest+suffix)
    if target.is_symlink() or not target.resolve().is_relative_to(directory.resolve()):
        raise ValueError('Invalid destination object')
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest()!=digest: raise ValueError('Existing object checksum mismatch')
        return False
    temporary=write_temporary(directory,data)
    try:
        if hashlib.sha256(temporary.read_bytes()).hexdigest()!=digest: raise ValueError('Temporary object checksum mismatch')
        try:
            os.link(temporary,target)  # Publish complete bytes atomically without replacing another object.
            return True
        except FileExistsError:
            if target.is_symlink() or hashlib.sha256(target.read_bytes()).hexdigest()!=digest:
                raise ValueError('Concurrent object mismatch')
            return False
    finally: temporary.unlink(missing_ok=True)


def atomic_manifest(target,data):
    if target.is_symlink() or not target.resolve().is_relative_to(target.parent.resolve()):
        raise ValueError('Invalid manifest path')
    temporary=write_temporary(target.parent,data)
    try: os.replace(temporary,target)
    finally: temporary.unlink(missing_ok=True)


def main():
    from PIL import Image
    Image.MAX_IMAGE_PIXELS=40_000_000
    warnings.simplefilter('error',Image.DecompressionBombWarning)
    args=argparse.ArgumentParser()
    args.add_argument('--photos',required=True)
    args=args.parse_args()
    source=Path(args.photos).resolve(strict=True)
    if not source.is_dir(): raise ValueError('Photo source is not a directory')
    dbpath=checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite')
    destination=dbpath.parent/'animal-photos'
    destination.mkdir(exist_ok=True)
    if not destination.resolve().is_relative_to(dbpath.parent.resolve()): raise ValueError('Invalid photo destination')
    db=sqlite3.connect(dbpath.as_uri()+'?mode=ro',uri=True)
    try:
        if db.execute('SELECT sha256 FROM source_manifest').fetchone()[0]!=SOURCE_HASH: raise ValueError('Wrong staged source')
        def records(table):
            return {key:json.loads(payload) for key,payload in db.execute('SELECT legacy_id,payload FROM legacy_rows WHERE source_table=?',(table,))}
        files=records('files'); animals=records('animals'); attachments=records('adoption_file')
    finally: db.close()
    by_name=defaultdict(list); invalid_metadata=0
    for key,row in files.items():
        try: by_name[safe_basename(row.get('path'))].append(key)
        except ValueError: invalid_metadata+=1
    by_local=defaultdict(list); ignored_links=0
    for folder,dirs,names in os.walk(source,followlinks=False):
        kept=[]
        for name in dirs:
            p=Path(folder)/name
            if p.is_symlink() or p.is_junction() or not p.resolve().is_relative_to(source): ignored_links+=1
            else: kept.append(name)
        dirs[:]=kept
        for name in names:
            p=Path(folder)/name
            if p.is_symlink() or not p.resolve().is_relative_to(source): ignored_links+=1; continue
            if p.suffix.lower() in ('.jpg','.jpeg','.png'): by_local[name].append(p)
    animal_links=defaultdict(list)
    for key,row in animals.items():
        if row.get('profile_pic_id'): animal_links[row['profile_pic_id']].append(key)
    private_ids={r['file_id'] for r in attachments.values() if r.get('file_id')}
    manifest=[]; summary=Counter(objects_created=0,objects_reused=0); hash_counts=Counter(); rejections=Counter()
    for name,paths in sorted(by_local.items()):
        match=unique_match(name,by_name,by_local)
        for path in paths:
            entry={'source_relative_path':path.relative_to(source).as_posix(),'status':'unmatched','visibility':'private'}
            summary['local_images']+=1
            try:
                if path.stat().st_size>50_000_000: raise ValueError('Image exceeds size limit')
                data=path.read_bytes(); digest=hashlib.sha256(data).hexdigest()
                with Image.open(io.BytesIO(data)) as img:
                    fmt=img.format; width,height=img.size
                    if fmt not in ('JPEG','PNG'): raise ValueError('Unsupported image format')
                    img.verify()
                with Image.open(io.BytesIO(data)) as img: img.load()
                if (fmt=='JPEG' and path.suffix.lower() not in ('.jpg','.jpeg')) or (fmt=='PNG' and path.suffix.lower()!='.png'):
                    raise ValueError('Image extension mismatch')
                entry.update(sha256=digest,byte_size=len(data),format=fmt,width=width,height=height)
                hash_counts[digest]+=1; summary['valid_images']+=1
            except Exception as error:
                reason=str(error) if str(error) in ('Image exceeds size limit','Unsupported image format','Image extension mismatch') else type(error).__name__
                rejections[reason]+=1; entry['rejection_reason']=reason
                entry['status']='invalid_image'; summary['invalid_images']+=1; manifest.append(entry); continue
            if match is None:
                entry['status']='ambiguous' if name in by_name else 'unmatched'
                summary[entry['status']]+=1; manifest.append(entry); continue
            key,_=match; row=files[key]
            entry.update(legacy_file_id=key,animal_ids=animal_links.get(key,[]),also_adoption_attachment=key in private_ids)
            summary['unique_metadata_matches']+=1
            expected=row.get('size')
            if expected not in (None,'','0'):
                if not str(expected).isdigit() or int(expected)!=len(data):
                    entry['status']='metadata_size_mismatch'; summary['metadata_size_mismatch']+=1; manifest.append(entry); continue
            else: summary['matched_without_recorded_size']+=1
            if key not in animal_links:
                entry['status']='not_animal_profile'; summary['not_animal_profile']+=1; manifest.append(entry); continue
            # Original bytes, including metadata, are retained privately. Public release needs separate review.
            suffix='.jpeg' if fmt=='JPEG' else '.png'
            target=destination/(digest+suffix)
            created=atomic_blob(destination,digest,suffix,data)
            summary['objects_created' if created else 'objects_reused']+=1
            entry.update(status='staged_private',object_name=target.name)
            summary['staged_photo_links']+=1
            if key in private_ids: summary['staged_also_attachment']+=1
            manifest.append(entry)
    linked={a for entry in manifest if entry['status']=='staged_private' for a in entry['animal_ids']}
    summary.update({'animals_with_staged_profile_photo':len(linked),'animals_without_staged_profile_photo':len(animals)-len(linked),'total_animals':len(animals),'metadata_paths_rejected':invalid_metadata,'filesystem_links_skipped':ignored_links,'duplicate_content_groups':sum(c>1 for c in hash_counts.values()),'production_uploads':0})
    payload={'source_sql_sha256':SOURCE_HASH,'photo_source':str(source),'entries':manifest}
    private_manifest=dbpath.parent/'animal-photo-manifest.json'
    manifest_bytes=(json.dumps(payload,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    history=dbpath.parent/'photo-manifests'
    history.mkdir(exist_ok=True)
    if not history.resolve().is_relative_to(dbpath.parent.resolve()): raise ValueError('Invalid manifest history path')
    atomic_manifest(history/(hashlib.sha256(manifest_bytes).hexdigest()+'.json'),manifest_bytes)
    atomic_manifest(private_manifest,manifest_bytes)
    report={'counts':dict(summary),'image_rejections':dict(rejections),'matching':'exact case-sensitive basename, unique in both source metadata and local folder; recorded nonzero byte sizes must match','privacy':'all objects private; no status mapping or public URL assigned','image_validation':'Pillow verify plus full decode, JPEG/PNG signature, extension and pixel/size limits','private_manifest_sha256':hashlib.sha256(private_manifest.read_bytes()).hexdigest()}
    Path('docs/evidence/legacy-import-20260906/animal-photo-profile.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(summary)))

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Private photo staging failed: '+type(error).__name__+'; no record details printed')
        raise SystemExit(1)
