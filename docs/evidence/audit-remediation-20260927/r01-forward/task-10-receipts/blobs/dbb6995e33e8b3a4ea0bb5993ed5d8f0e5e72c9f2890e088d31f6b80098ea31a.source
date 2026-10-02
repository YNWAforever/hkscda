import hashlib,json,pathlib,subprocess
root=pathlib.Path.cwd()
scratch=root/".superpowers/sdd/r01-forward-schema-plan-20261001"
out=root/"docs/evidence/audit-remediation-20260927/r01-forward/task-9-receipts"
out.mkdir(exist_ok=True)
(out/".gitattributes").write_bytes(b"* -text\n")
blobs=out/"blobs";blobs.mkdir(exist_ok=True)
translation=out/"translation.json"
entries=json.loads(translation.read_text())["entries"] if translation.exists() else []
seen={(e["originalPath"],e["rawSha256"]) for e in entries}
for source in sorted(scratch.glob("task-9-*")):
    if source.name=="task-9-report.md":continue
    files=sorted(source.rglob("*")) if source.is_dir() else [source]
    for file in files:
        if not file.is_file():continue
        raw=file.read_bytes();sha=hashlib.sha256(raw).hexdigest()
        archive=blobs/(sha+".source")
        if not archive.exists():archive.write_bytes(raw)
        elif archive.read_bytes()!=raw:raise RuntimeError("Content address collision")
        original=str(file.relative_to(root)).replace("\\","/")
        if (original,sha) in seen:continue
        seen.add((original,sha))
        entries.append({"originalPath":str(file.relative_to(root)).replace("\\","/"),"archivePath":str(archive.relative_to(root)).replace("\\","/"),"rawSha256":sha,"canonicalSha256":hashlib.sha256(raw.replace(b"\r\n",b"\n")).hexdigest(),"bytes":len(raw),"gitBlob":subprocess.check_output(["git","hash-object","--no-filters",str(file)],text=True).strip()})
(out/"translation.json").write_text(json.dumps({"policy":"Original raw files remain immutable; content-addressed .source archives avoid Bun test discovery; translations preserve exact original path and receipt fields.","entries":entries},indent=2)+"\n",newline="\n")
print(json.dumps({"rawFiles":len(entries),"uniqueRawBlobs":len(list(blobs.glob("*.source"))),"uniqueBytes":sum(p.stat().st_size for p in blobs.glob("*.source"))}))
