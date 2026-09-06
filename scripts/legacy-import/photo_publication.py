"""Prepare metadata-free originals for explicitly approved photo publication."""
import hashlib,json
from pathlib import Path
from io import BytesIO
from legacy_stage import checked_database_path

def remove_metadata(data):
    if data[:2]!=b"\xff\xd8": raise ValueError('Not JPEG')
    out=bytearray(data[:2]); pos=2; scan=False
    while pos<len(data):
        if scan:
            end=data.find(b"\xff",pos)
            if end<0: raise ValueError('Missing end marker')
            out.extend(data[pos:end]); pos=end
        start=pos
        if data[pos]!=255: raise ValueError('Invalid marker')
        while pos<len(data) and data[pos]==255: pos+=1
        if pos>=len(data): raise ValueError('Truncated marker')
        marker=data[pos]; pos+=1
        if scan and (marker==0 or 0xd0<=marker<=0xd7):
            out.extend(data[start:pos]); continue
        if marker==0xd9:
            out.extend(data[start:pos]); return bytes(out)
        scan=False
        if pos+2>len(data): raise ValueError('Truncated segment')
        size=int.from_bytes(data[pos:pos+2],'big')
        if size<2 or pos+size>len(data): raise ValueError('Invalid segment size')
        if marker not in (0xe1,0xed,0xfe): out.extend(data[start:pos+size])
        pos+=size
        if marker==0xda: scan=True
    raise ValueError('Missing end marker')

def main():
    from PIL import Image
    root=checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite').parent
    c=json.loads((root/'animal-replacement-candidate.json').read_text(encoding='utf-8'))
    targets=[r for r in c['animals'] if (r['adoption_candidate'] or r['sponsorship_candidate']) and r['photo_candidate']]
    assert len(targets)==14
    destination=root/'public-photo-candidates'; destination.mkdir(exist_ok=True)
    entries=[]
    for row in targets:
        source=root/'animal-photos'/row['photo_candidate']; original=source.read_bytes()
        assert hashlib.sha256(original).hexdigest()==source.stem
        clean=remove_metadata(original)
        with Image.open(BytesIO(original)) as a,Image.open(BytesIO(clean)) as b:
            assert a.getexif().get(274,1)==1, 'Orientation requires separate review'
            assert a.mode==b.mode and a.size==b.size and a.tobytes()==b.tobytes()
            assert not b.getexif() and 'xmp' not in b.info and 'photoshop' not in b.info
        digest=hashlib.sha256(clean).hexdigest(); path=destination/(digest+'.jpeg')
        if path.exists(): assert path.read_bytes()==clean
        else: path.write_bytes(clean)
        entries.append({'animal_id':row['canonical_candidate_id'],'original_sha256':source.stem,'public_sha256':digest,'file':str(path),'object_path':'legacy-animals/'+digest+'.jpeg','bytes':len(clean)})
    (root/'photo-publication-plan.json').write_text(json.dumps(entries,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'prepared':len(entries),'pixels_unchanged':True,'metadata_removed':True,'bytes':sum(x['bytes'] for x in entries)}))

if __name__=='__main__': main()
