/** Exact measured Task1 control ACL composition; historical proof stays immutable. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import evidence from "./task-11-cold-prerequisites.json";

const prefix = "docs/evidence/audit-remediation-20260927/r01-forward/";
const rawPin = "5e20635599df133e0eae2ea2f4d9a0b64449cdd78ce93ca1a80689687660fd93";
const objectPin = "047cd10000a1894198bc78b1b027be7c43b1c755b89ec1d9c7d6029ceac0e3f1";
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export function assertColdEvidence(value: unknown): typeof evidence {
  // Bind the complete vectors and actual RED/cleanup provenance together.
  if (sha(JSON.stringify(value)) !== objectPin)
    throw new Error("Task11 observed control ACL evidence differs");
  return value as typeof evidence;
}

export async function verifyColdEvidence(root: string) {
  const paths = [prefix + "task-11-cold-prerequisites.json", evidence.clampSource,
    prefix + evidence.archive, prefix + evidence.manifest,
    prefix + evidence.supplementalArchive, prefix + evidence.supplementalManifest];
  const pins = [rawPin, evidence.clampSha256, evidence.archiveSha256, evidence.manifestSha256,
    evidence.supplementalArchiveSha256, evidence.supplementalManifestSha256];
  for (const [i, path] of paths.entries())
    if (sha(await readFile(resolve(root, path))) !== pins[i])
      throw new Error("Task11 observed control ACL source/archive binding differs: " + path);
  return { evidence: assertColdEvidence(evidence), paths };
}

/** Each additional catalog selects ONLY its observed helper vector. */
export function withObservedPairs(
  historical: { catalog: string; helpers: string },
  pairs: { catalog: string; helpers: string }[],
) {
  if (!pairs.length) throw new Error("Observed Task11 pairs required");
  const selection = pairs.map((p, i) => `when v_before=${p.catalog} then ${i}`).join(" ");
  const helpers = pairs.map((p, i) => `when ${i} then ${p.helpers}`).join(" ");
  return {
    catalog: ` v_observed:=case ${selection} else null end;\n if v_observed is null then\n${historical.catalog} else v_native:=false;end if;\n`,
    helpers: ` if v_observed is null then\n${historical.helpers} elsif v_actual<>(case v_observed ${helpers} end) then raise exception 'R01 finance complete helper tuples differ' using errcode='55000';end if;\n`,
  };
}
