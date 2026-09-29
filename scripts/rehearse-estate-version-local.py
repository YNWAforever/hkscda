# Rollback-only T12 rehearsal against the exact unlinked local Supabase container.
from pathlib import Path
import subprocess
import sys

CONTAINER = "supabase_db_hkscda-audit-remediation-20260927"
ROOT = Path(__file__).resolve().parents[1]
migration = (ROOT / "supabase/migrations/20260927120500_estate_versioned_commands.sql").read_text(encoding="utf-8")
tests = (ROOT / "scripts/test-estate-versioned-commands.sql").read_text(encoding="utf-8")
seed = """
insert into public.dog_friendly_estates
  (id, estate_name, district, notes, sort_order, is_published)
values
  ('f1111111-1111-4111-8111-111111111111', 'T12 existing synthetic', 'Kowloon', null, 0, true);
"""
script = "BEGIN;\n" + seed + "\n" + migration + "\n" + tests + "\nROLLBACK;\n"
result = subprocess.run(
    ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    input=script,
    text=True,
    capture_output=True,
    check=False,
)
print(result.stdout)
print(result.stderr, file=sys.stderr)
sys.exit(result.returncode)
