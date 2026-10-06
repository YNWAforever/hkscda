"""Explicit isolated-cluster regression; never changes shared Supabase roles."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import sys
import time
import uuid

sys.stdout.reconfigure(encoding="utf-8")
root = Path(__file__).resolve().parents[2]
mode = sys.argv[1]
assert mode in {"red", "green"}
output = root / ".superpowers/sdd/r01-forward-schema-plan-20261001/control-boundaries-20261006" / ("inheritance-" + mode)
output.mkdir(exist_ok=False)
name = "r01_acl_" + uuid.uuid4().hex
image = subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", "postgres:17"]).decode().strip()
assert image.startswith("sha256:")
source = (root / "supabase/migrations/20261001101333_r01_payment_idempotency_forward.sql").read_bytes()
(output / "migration.source").write_bytes(source)
receipt = {"atUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "mode": mode, "container": name, "image": image, "migrationSha256": hashlib.sha256(source).hexdigest(), "environment": "new network-none PostgreSQL cluster, tmpfs only, no ports/credentials/production data; existing Supabase clusters untouched"}
owned = False


def psql(statement):
    result = subprocess.run(["docker", "exec", "-i", name, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At"], input=statement.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return result


try:
    subprocess.run(["docker", "run", "--pull=never", "--rm", "-d", "--name", name, "--label", "hkscda-test=payment-intent-acl", "--network", "none", "--tmpfs", "/var/lib/postgresql/data:rw", "--tmpfs", "/var/run/postgresql:rw", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", image], check=True, stdout=subprocess.PIPE)
    owned = True
    state = json.loads(subprocess.check_output(["docker", "inspect", name]))[0]
    assert state["HostConfig"]["NetworkMode"] == "none" and not state["HostConfig"]["PortBindings"]
    assert all(m["Type"] == "tmpfs" for m in state["Mounts"])
    for attempt in range(60):
        result = psql("select current_setting('server_version_num');")
        if result.returncode == 0:
            receipt["serverVersionNum"] = result.stdout.decode().strip()
            break
        time.sleep(0.2)
    else:
        raise RuntimeError("Owned cluster did not become ready")
    setup = """
      create role anon; create role authenticated; create role service_role;
      grant service_role to authenticated;
      create table public.donation(id uuid primary key, amount_cents integer);
      create table public.payment(id uuid primary key, provider_ref text);
      alter table public.donation enable row level security;
      alter table public.payment enable row level security;
      grant select,insert,update on public.donation,public.payment to authenticated;
    """
    result = psql(setup)
    assert result.returncode == 0, result.stderr.decode()
    facts = """select jsonb_build_object('columns',(select jsonb_agg(row(c.relname,a.attname,a.attacl::text) order by c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.oid in ('public.donation'::regclass,'public.payment'::regclass) and a.attnum>0 and not a.attisdropped),'acl',(select jsonb_agg(row(c.relname,c.relacl::text) order by c.relname) from pg_class c where c.oid in ('public.donation'::regclass,'public.payment'::regclass)),'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid) from pg_index i where i.indrelid in ('public.donation'::regclass,'public.payment'::regclass)))::text;"""
    before = psql(facts)
    assert before.returncode == 0
    result = psql("begin;\n" + source.decode() + "\ncommit;")
    (output / "apply.stdout").write_bytes(result.stdout)
    (output / "apply.stderr").write_bytes(result.stderr)
    receipt["applyNativeExit"] = result.returncode
    if mode == "red":
        assert result.returncode == 0, result.stderr.decode()
        privilege = psql("select has_column_privilege('authenticated','public.donation','idempotency_key','INSERT'),has_column_privilege('authenticated','public.payment','checkout_url','UPDATE');")
        assert privilege.returncode == 0
        receipt["effectiveControlWrites"] = privilege.stdout.decode().strip()
        assert receipt["effectiveControlWrites"] == "t|t"
        receipt["result"] = "watched RED: inherited control writes remain authorized"
        receipt["exit"] = 1
    else:
        assert result.returncode != 0 and b"55000" in result.stderr, result.stderr.decode()
        after = psql(facts)
        assert after.returncode == 0 and before.stdout == after.stdout
        receipt["prestateRestored"] = True
        receipt["result"] = "GREEN: inherited late-grant authority rejected atomically"
        receipt["exit"] = 0
finally:
    if owned:
        result = subprocess.run(["docker", "stop", "--time", "10", name], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        receipt["cleanupNativeExit"] = result.returncode
        assert result.returncode == 0
        receipt["cleanup"] = "only exact owned --rm tmpfs container stopped; no shared DB/role mutation"
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt))
sys.exit(receipt["exit"])
