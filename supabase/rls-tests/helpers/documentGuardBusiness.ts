import {
  assertDocumentTestTarget,
  type DocumentTestTarget,
  documentFixtureCountsEqual,
} from "./documentGuardTestTarget";
import { randomUUID } from "node:crypto";
import { SQL, type TransactionSQL } from "bun";
import { assertSafeFixtureTables } from "./productionSchemaClone";

export type DocumentReference = "site" | "primary" | "zh_hk" | "en" | "annual";
type Result = {
  name: string;
  outcome: "REFUSED" | "COMPLETED_THEN_ROLLED_BACK";
  code?: string;
  actualError?: unknown;
};
const rollback = new Error("Document guard fixture rollback");
const code = (e: unknown) =>
  e instanceof SQL.PostgresError && typeof e.errno === "string" && /^[0-9A-Z]{5}$/.test(e.errno)
    ? e.errno
    : undefined;
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(message);
}
const inverseMessage = "Unpublish public document references before unpublishing their PDF asset";
const knowledgeMessage = "Publish the PDF asset before publishing its knowledge post";
export async function fixtureAsset(
  tx: TransactionSQL,
  published: boolean,
  kind = "adoption_guide",
) {
  const id = randomUUID();
  await tx`insert into public.document_assets(id,kind,title,language,object_path,byte_size,is_published)
    values(${id}::uuid,${kind},'Isolated document guard fixture','en',${"task13/" + id + ".pdf"},1,${published})`;
  return id;
}
export async function fixtureReference(
  tx: TransactionSQL,
  kind: DocumentReference,
  asset: string,
  published: boolean,
) {
  const id = randomUUID();
  if (kind === "site")
    await tx`insert into public.site_document_slots(id,slot_key,language,document_asset_id,is_published)
    values(${id}::uuid,${"task13_" + id.replaceAll("-", "")},'en',${asset}::uuid,${published})`;
  else if (kind === "annual")
    await tx`insert into public.annual_reports(id,title,year_label,document_asset_id,is_published)
    values(${id}::uuid,'Isolated annual guard fixture',${"task13_" + id},${asset}::uuid,${published})`;
  else if (kind === "primary")
    await tx`insert into public.knowledge_posts(id,title,topic,short_intro,document_asset_id,is_published)
    values(${id}::uuid,'Isolated knowledge guard fixture','Task13','Private fixture',${asset}::uuid,${published})`;
  else {
    // The destination CHECK requires a complete translated pair, atomically.
    // Its other published asset never substitutes for the exact target being tested.
    const partner = await fixtureAsset(tx, true),
      zh = kind === "zh_hk" ? asset : partner,
      en = kind === "en" ? asset : partner;
    await tx`insert into public.knowledge_posts(id,title,topic,short_intro,zh_hk_document_asset_id,en_document_asset_id,is_published)
      values(${id}::uuid,'Isolated knowledge guard fixture','Task13','Private fixture',${zh}::uuid,${en}::uuid,${published})`;
  }
  return id;
}
export async function referenceState(
  tx: TransactionSQL,
  kind: DocumentReference,
  asset: string,
  id: string,
) {
  const table =
    kind === "site"
      ? "site_document_slots"
      : kind === "annual"
        ? "annual_reports"
        : "knowledge_posts";
  const field =
    kind === "zh_hk"
      ? "zh_hk_document_asset_id"
      : kind === "en"
        ? "en_document_asset_id"
        : "document_asset_id";
  const rows = await tx.unsafe(
    `select a.is_published asset_published,r.is_published reference_published from public.document_assets a
    join public.${table} r on r.${field}=a.id where a.id=$1::uuid and r.id=$2::uuid`,
    [asset, id],
  );
  require(rows.length === 1, "Exactly one actual joined fixture row required");
  return rows[0];
}

/** Owning DML/RPC, existing grants, constraint completion and atomic audit behavior.
 * Each case rolls back its own transaction; a genuine setup error never counts as a refusal.
 * API authentication and concurrency are separate suites, not inferred here.
 */
export async function documentGuardBusiness(clone: DocumentTestTarget): Promise<Result[]> {
  await assertDocumentTestTarget(clone);
  await assertSafeFixtureTables(clone.sql, [
    "public.document_assets",
    "public.site_document_slots",
    "public.knowledge_posts",
    "public.annual_reports",
    "public.audit_log",
  ]);
  const results: Result[] = [];
  let owningError: unknown;
  const run = async (name: string, action: (tx: TransactionSQL) => Promise<void>) => {
    owningError = undefined;
    try {
      await clone.sql.begin(async (tx) => {
        await tx`set transaction isolation level read committed`;
        await tx`set local lock_timeout='5s'`;
        await tx`set local statement_timeout='30s'`;
        await action(tx);
        throw rollback;
      });
      throw Error("Fixture unexpectedly committed");
    } catch (e) {
      if (e !== rollback)
        throw Object.assign(new Error("Document business case failed: " + name), {
          cause: e,
          failedCase: name,
          successfulPrefix: [...results],
        });
      results.push({ name, outcome: "COMPLETED_THEN_ROLLED_BACK", actualError: owningError });
    }
  };
  const refuse = async (
    tx: TransactionSQL,
    state: string,
    message: string | undefined,
    action: () => Promise<unknown>,
  ) => {
    await tx`savepoint owning_operation`;
    let actual: unknown;
    try {
      await action();
    } catch (e) {
      actual = e;
    }
    await tx`rollback to savepoint owning_operation`;
    await tx`release savepoint owning_operation`;
    if (
      !(actual instanceof SQL.PostgresError) ||
      code(actual) !== state ||
      (message !== undefined && actual.message !== message)
    )
      throw Object.assign(new Error("Expected actual owning refusal was not observed"), {
        cause: actual,
        owningInvoked: true,
      });
    const native = actual;
    owningError = {
      type: native.constructor.name,
      message: native.message,
      code: native.code,
      errno: native.errno,
      severity: native.severity,
      detail: native.detail,
      hint: native.hint,
      routine: native.routine,
      stack: native.stack,
    };
  };
  await run("site publication requires published asset", async (tx) => {
    const asset = await fixtureAsset(tx, false);
    await refuse(
      tx,
      "23514",
      "Publish the PDF asset before publishing its site document slot",
      () => fixtureReference(tx, "site", asset, true),
    );
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "site publication requires published asset",
    outcome: "REFUSED",
    code: "23514",
  };
  await run("site inverse publication protection", async (tx) => {
    const asset = await fixtureAsset(tx, true),
      id = await fixtureReference(tx, "site", asset, true);
    await refuse(
      tx,
      "23514",
      inverseMessage,
      () => tx`update public.document_assets set is_published=false where id=${asset}::uuid`,
    );
    const state = await referenceState(tx, "site", asset, id);
    require(state.asset_published === true &&
      state.reference_published === true, "Site refusal changed fixture");
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "site inverse publication protection",
    outcome: "REFUSED",
    code: "23514",
  };
  await run("site existing delete restrict", async (tx) => {
    const asset = await fixtureAsset(tx, false);
    await fixtureReference(tx, "site", asset, false);
    await refuse(
      tx,
      "23503",
      undefined,
      () => tx`delete from public.document_assets where id=${asset}::uuid`,
    );
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "site existing delete restrict",
    outcome: "REFUSED",
    code: "23503",
  };
  await run("deferred valid site publication completes", async (tx) => {
    const asset = await fixtureAsset(tx, false);
    await tx`set constraints public.enforce_published_site_document_slot_asset deferred`;
    const id = await fixtureReference(tx, "site", asset, true);
    await tx`update public.document_assets set is_published=true where id=${asset}::uuid`;
    await tx`set constraints public.enforce_published_site_document_slot_asset immediate`;
    const state = await referenceState(tx, "site", asset, id);
    require(state.asset_published === true &&
      state.reference_published === true, "Deferred site completion missing");
  });
  await run("deferred invalid site publication refuses", async (tx) => {
    const asset = await fixtureAsset(tx, false);
    await tx`set constraints public.enforce_published_site_document_slot_asset deferred`;
    await fixtureReference(tx, "site", asset, true);
    await refuse(
      tx,
      "23514",
      "Publish the PDF asset before publishing its site document slot",
      () => tx`set constraints public.enforce_published_site_document_slot_asset immediate`,
    );
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "deferred invalid site publication refuses",
    outcome: "REFUSED",
    code: "23514",
  };
  for (const kind of ["primary", "zh_hk", "en"] as const) {
    await run(kind + " publication requires published asset", async (tx) => {
      const asset = await fixtureAsset(tx, false);
      await refuse(tx, "23514", knowledgeMessage, () => fixtureReference(tx, kind, asset, true));
    });
    results[results.length - 1] = {
      ...results[results.length - 1],
      name: kind + " publication requires published asset",
      outcome: "REFUSED",
      code: "23514",
    };
    await run(kind + " inverse publication protection", async (tx) => {
      const asset = await fixtureAsset(tx, true),
        id = await fixtureReference(tx, kind, asset, true);
      await refuse(
        tx,
        "23514",
        inverseMessage,
        () => tx`update public.document_assets set is_published=false where id=${asset}::uuid`,
      );
      const state = await referenceState(tx, kind, asset, id);
      require(state.asset_published === true &&
        state.reference_published === true, "Refusal changed owning fixture");
    });
    results[results.length - 1] = {
      ...results[results.length - 1],
      name: kind + " inverse publication protection",
      outcome: "REFUSED",
      code: "23514",
    };
    await run(kind + " existing delete restrict", async (tx) => {
      const asset = await fixtureAsset(tx, false);
      await fixtureReference(tx, kind, asset, false);
      await refuse(
        tx,
        "23503",
        undefined,
        () => tx`delete from public.document_assets where id=${asset}::uuid`,
      );
    });
    results[results.length - 1] = {
      ...results[results.length - 1],
      name: kind + " existing delete restrict",
      outcome: "REFUSED",
      code: "23503",
    };
  }
  await run("existing annual publication protection", async (tx) => {
    const asset = await fixtureAsset(tx, false, "annual_report");
    await refuse(tx, "23514", "Publish the annual report PDF first", () =>
      fixtureReference(tx, "annual", asset, true),
    );
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "existing annual publication protection",
    outcome: "REFUSED",
    code: "23514",
  };
  await run("existing annual inverse protection", async (tx) => {
    const asset = await fixtureAsset(tx, true, "annual_report"),
      id = await fixtureReference(tx, "annual", asset, true);
    await refuse(
      tx,
      "23514",
      "Unpublish the annual report before changing its PDF asset",
      () => tx`update public.document_assets set is_published=false where id=${asset}::uuid`,
    );
    const state = await referenceState(tx, "annual", asset, id);
    require(state.asset_published === true &&
      state.reference_published === true, "Annual refusal changed fixture");
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "existing annual inverse protection",
    outcome: "REFUSED",
    code: "23514",
  };
  await run("existing annual delete restrict", async (tx) => {
    const asset = await fixtureAsset(tx, false, "annual_report");
    await fixtureReference(tx, "annual", asset, false);
    await refuse(
      tx,
      "23503",
      undefined,
      () => tx`delete from public.document_assets where id=${asset}::uuid`,
    );
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "existing annual delete restrict",
    outcome: "REFUSED",
    code: "23503",
  };
  await run("deferred translated publication completes", async (tx) => {
    const asset = await fixtureAsset(tx, false);
    await tx`set constraints public.enforce_published_knowledge_document_assets deferred`;
    const id = await fixtureReference(tx, "en", asset, true);
    await tx`update public.document_assets set is_published=true where id=${asset}::uuid`;
    await tx`set constraints public.enforce_published_knowledge_document_assets immediate`;
    const state = await referenceState(tx, "en", asset, id);
    require(state.asset_published === true &&
      state.reference_published === true, "Deferred translated fixture did not complete");
  });
  await run("deferred translated invalid completion refuses", async (tx) => {
    const asset = await fixtureAsset(tx, false);
    await tx`set constraints public.enforce_published_knowledge_document_assets deferred`;
    await fixtureReference(tx, "zh_hk", asset, true);
    await refuse(
      tx,
      "23514",
      knowledgeMessage,
      () => tx`set constraints public.enforce_published_knowledge_document_assets immediate`,
    );
  });
  results[results.length - 1] = {
    ...results[results.length - 1],
    name: "deferred translated invalid completion refuses",
    outcome: "REFUSED",
    code: "23514",
  };
  for (const kind of ["site", "primary", "zh_hk", "en"] as const) {
    await run(kind + " service role RPC refusal rolls back audit", async (tx) => {
      const asset = await fixtureAsset(tx, true),
        id = await fixtureReference(tx, kind, asset, true),
        actor = randomUUID();
      await tx`set local role service_role`;
      await refuse(
        tx,
        "23514",
        inverseMessage,
        () =>
          tx`select public.mutate_document_asset_with_audit(${actor}::uuid,'unpublish',${asset}::uuid,'{}'::jsonb)`,
      );
      const audit =
        await tx`select count(*)::text count from public.audit_log where actor_user_id=${actor}::uuid and entity_id=${asset}::text`;
      require(audit.length === 1 &&
        audit[0].count === "0", "Refused atomic RPC leaked an audit row");
      const state = await referenceState(tx, kind, asset, id);
      require(state.asset_published === true &&
        state.reference_published === true, "Refused atomic RPC changed publication state");
    });
    results[results.length - 1] = {
      ...results[results.length - 1],
      name: kind + " service role RPC refusal rolls back audit",
      outcome: "REFUSED",
      code: "23514",
    };
  }
  let successfulActor = "",
    successfulAsset = "";
  await run("service role allowed RPC writes one matching audit atomically", async (tx) => {
    const asset = await fixtureAsset(tx, true),
      id = await fixtureReference(tx, "site", asset, true),
      actor = randomUUID();
    successfulActor = actor;
    successfulAsset = asset;
    const published = await referenceState(tx, "site", asset, id);
    require(published.asset_published === true &&
      published.reference_published === true, "Published reference setup missing");
    await tx`update public.site_document_slots set is_published=false where id=${id}::uuid`;
    const draft = await referenceState(tx, "site", asset, id);
    require(draft.asset_published === true &&
      draft.reference_published === false, "Reference unpublish transition missing");
    await tx`set local role service_role`;
    const returned =
      await tx`select public.mutate_document_asset_with_audit(${actor}::uuid,'unpublish',${asset}::uuid,'{}'::jsonb)::text id`;
    const audit =
      await tx`select actor_user_id::text actor,action,entity,entity_id,detail from public.audit_log where actor_user_id=${actor}::uuid and entity_id=${asset}::text`;
    const state = await referenceState(tx, "site", asset, id);
    require(returned.length === 1 &&
      returned[0].id === asset &&
      state.asset_published === false &&
      state.reference_published === false, "Allowed RPC failed to mutate exactly one fixture");
    require(audit.length === 1 &&
      audit[0].actor === actor &&
      audit[0].action === "document.unpublish" &&
      audit[0].entity === "document_asset" &&
      audit[0].entity_id === asset &&
      JSON.stringify(audit[0].detail) === "{}", "Allowed atomic RPC audit mismatch");
  });
  const rolledAudit =
    await clone.sql`select count(*)::text count from public.audit_log where actor_user_id=${successfulActor}::uuid and entity_id=${successfulAsset}::text`;
  require(rolledAudit.length === 1 &&
    rolledAudit[0].count === "0", "Outer rollback retained successful RPC audit");
  for (const role of ["anon", "authenticated"] as const) {
    await run(role + " existing RPC execution denial", async (tx) => {
      const asset = await fixtureAsset(tx, true),
        actor = randomUUID();
      await tx.unsafe("set local role " + role);
      const privilege =
        await tx`select current_user actor,has_function_privilege(current_user,'public.mutate_document_asset_with_audit(uuid,text,uuid,jsonb)','EXECUTE') allowed`;
      require(privilege.length === 1 &&
        privilege[0].actor === role &&
        privilege[0].allowed === false, "Existing RPC denial grant profile differs");
      await refuse(
        tx,
        "42501",
        undefined,
        () =>
          tx`select public.mutate_document_asset_with_audit(${actor}::uuid,'unpublish',${asset}::uuid,'{}'::jsonb)`,
      );
    });
    results[results.length - 1] = {
      ...results[results.length - 1],
      name: role + " existing RPC execution denial",
      outcome: "REFUSED",
      code: "42501",
    };
  }
  const counts =
    await clone.sql`select (select count(*)::text from public.document_assets) assets,(select count(*)::text from public.site_document_slots) slots,
    (select count(*)::text from public.knowledge_posts) knowledge,(select count(*)::text from public.annual_reports) annual,(select count(*)::text from public.audit_log) audit`;
  require(counts.length === 1 &&
    documentFixtureCountsEqual(clone, counts[0]), "Business fixture rollback incomplete");
  return results;
}
