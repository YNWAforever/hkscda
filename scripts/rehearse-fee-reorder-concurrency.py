"""Two-connection synthetic fee reorder drill against an isolated local Supabase DB."""
import argparse
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("--container", required=True)
args = parser.parse_args()
if not args.container.startswith("supabase_db_hkscda-audit-remediation-"):
    raise SystemExit("Refusing a container outside the isolated audit-remediation stack")
base = ["docker", "exec", args.container, "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "postgres"]

def sql(statement: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(base + ["-c", statement], text=True, capture_output=True, timeout=30)

actor_result = sql("select auth_user_id from public.admin_user where role in ('staff','admin') and status='active' limit 1")
actor = actor_result.stdout.strip()
if actor_result.returncode or not actor:
    raise SystemExit("No isolated active staff/admin fixture")
first_id, second_id = str(uuid.uuid4()), str(uuid.uuid4())
base_result = sql("select coalesce(max(sort_order),0)+10 from public.adoption_fees where animal_type='dog'")
if base_result.returncode:
    raise SystemExit(base_result.stderr)
first_order = int(base_result.stdout.strip())
insert = sql(f"insert into public.adoption_fees (id,animal_type,item_name,price_hkd,sort_order,is_published) values ('{first_id}','dog','Concurrency A','HK$1',{first_order},true),('{second_id}','dog','Concurrency B','HK$2',{first_order + 1},true)")
if insert.returncode:
    raise SystemExit(insert.stderr)
try:
    call = f"select public.reorder_adoption_fees_with_audit('{actor}','{first_id}','{second_id}',1,1)"
    first = subprocess.Popen(base + ["-c",
        "begin; select pg_advisory_xact_lock(hashtext('adoption_fee_order'),hashtext('dog')); select pg_sleep(3); "
        + call + "; commit;"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    time.sleep(1)
    start = time.monotonic()
    second = sql(call)
    waited = time.monotonic() - start
    first_out, first_err = first.communicate(timeout=20)
    if first.returncode != 0:
        raise SystemExit("First swap failed: " + first_err)
    if second.returncode == 0 or "Fee version or species conflict" not in second.stderr:
        raise SystemExit("Second swap did not lose with a version conflict: " + second.stderr)
    if waited < 1:
        raise SystemExit(f"Second swap did not wait on the species lock: {waited:.2f}s")
    state = sql(f"select sort_order,version from public.adoption_fees where id in ('{first_id}','{second_id}') order by id")
    audits = sql(f"select count(*) from public.audit_log where action='adoption_fee.reorder' and entity_id='{first_id}'")
    if state.returncode or audits.returncode or audits.stdout.strip() != "1":
        raise SystemExit("Final version/audit lookup failed")
    if sorted(int(line.split("|")[0]) for line in state.stdout.strip().splitlines()) != [first_order, first_order + 1]:
        raise SystemExit("Committed order is not the two original positions")
    print(f"first=success second=P4091 wait_seconds={waited:.2f} audit_count=1")
    print("committed_rows=" + state.stdout.strip().replace("\n", ";"))
finally:
    cleanup = sql(f"delete from public.audit_log where entity='adoption_fee' and entity_id in ('{first_id}','{second_id}'); delete from public.adoption_fees where id in ('{first_id}','{second_id}')")
    if cleanup.returncode:
        raise SystemExit("Synthetic cleanup failed: " + cleanup.stderr)
