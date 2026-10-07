import datetime, hashlib, json, subprocess, sys, time
from pathlib import Path
from PIL import Image, ImageChops
from pypdf import PdfReader

sys.stdout.reconfigure(encoding='utf-8')
d = Path(__file__).resolve().parent
out = d / 'output'
poppler = Path('C:/Users/laich/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin')
renders = []
texts = {}
for mode in ['full', 'subset']:
    data = json.loads((out / f'{mode}-result.json').read_text(encoding='utf-8'))
    for sample in data['samples']:
        label = f'{mode}-{sample["id"]}'
        pdf = out / f'{label}.pdf'
        argv = [str(poppler / 'pdftoppm.EXE'), '-png', '-r', '120', '-singlefile', str(pdf), str(out / label)]
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate(timeout=60)
        (out / f'{label}.render.stderr').write_bytes(stderr)
        text = PdfReader(pdf).pages[0].extract_text()
        texts[label] = text
        (out / f'{label}.txt').write_text(text, encoding='utf-8')
        renders.append({'label': label, 'argv': argv, 'pid': process.pid, 'exitCode': process.returncode, 'startedUtc': started, 'stderr': stderr.decode('utf-8', errors='replace'), 'missingExpectedCharacters': sorted({c for c in sample['name'] if not c.isspace() and c not in text}), 'textSha256': hashlib.sha256(text.encode()).hexdigest(), 'pngSha256': hashlib.sha256((out / f'{label}.png').read_bytes()).hexdigest()})
        if process.returncode:
            raise RuntimeError(label)
comparisons = []
for name in ['common', 'rare', 'long', 'mixed']:
    left = Image.open(out / f'full-{name}.png').convert('RGB')
    right = Image.open(out / f'subset-{name}.png').convert('RGB')
    diff = ImageChops.difference(left, right)
    nonzero = sum(1 for px in diff.getdata() if px != (0, 0, 0))
    diff.save(out / f'diff-{name}.png')
    comparisons.append({'case': name, 'imageSize': left.size, 'differingPixels': nonzero, 'boundingBox': diff.getbbox(), 'textEqual': texts[f'full-{name}'] == texts[f'subset-{name}']})
    montage = Image.new('RGB', (left.width * 2, left.height), 'white')
    montage.paste(left, (0, 0)); montage.paste(right, (left.width, 0))
    montage.save(out / f'pair-{name}.png')
receipt = {'renders': renders, 'comparisons': comparisons, 'productionOrProviderAccess': False}
(d / 'inspection.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(receipt, ensure_ascii=False))
