/** Task 6 preparation: schema-only reads and individually owned synthetic clones. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {captureProductionSchema,captureModernLocalSchema,createProductionClone,assertSafeFixtureTables,localSourceState,snapshot,hash} from "./productionSchemaClone";
if(process.env.R01_CRM_ALLOW_LOCAL_FIXTURES!=="1")throw new Error("Explicit Task6 clone opt-in required");
const mode=process.argv[2];if(!["red","red-actor"].includes(mode))throw new Error("Task6 RED only");
const root=resolve(import.meta.dir,"../../.."),out=resolve(root,".superpowers/sdd/r01-forward-schema-plan-20261001"),archive=resolve(root,"docs/evidence/audit-remediation-20260927/r01-forward/task-6-red-receipts");
await mkdir(archive,{recursive:true});
const paths=["src/lib/crm/atomicForward.database.test.ts","supabase/rls-tests/helpers/runR01CrmForward.ts","supabase/rls-tests/helpers/productionSchemaClone.ts","supabase/migrations/20260925103937_atomic_crm_supporter_audit.sql","supabase/migrations/20260927110000_crm_supporter_edit_version.sql"];
const blobs=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(resolve(root,p),"utf8"))])));
const frozen=await blobs();const modern="postgresql://postgres:postgres@127.0.0.1:57322/postgres",modernBefore=await localSourceState(modern);
const capture=mode==="red"?await captureProductionSchema():await captureModernLocalSchema();
const clone=await createProductionClone(capture),receipt:Record<string,unknown>={mode,sourceCommit:(await new Response(Bun.spawn(["git","rev-parse","HEAD"],{cwd:root,stdout:"pipe"}).stdout).text()).trim(),startedAt:new Date().toISOString(),clone:clone.name,schemaParity:true,zeroApplicationTables:clone.tableCount,sourceCatalogHash:hash(capture.catalog),managedPrerequisitesHash:clone.prerequisites,testedExecutableBlobs:frozen,productionActions:"schema/catalog only; no data read or actor commands",task1Applied:false,dependentSqlApplied:false};
try{
 await assertSafeFixtureTables(clone.sql,["auth.users","admin_user","supporter","supporter_role","consent","audit_log"]);
 const [auth]=await clone.sql`select has_any_column_privilege('service_role','auth.users','SELECT') sel,has_any_column_privilege('service_role','auth.users','UPDATE') upd`;
 if(auth.sel||auth.upd)throw new Error("Managed Auth effective privilege mismatch; no calibration authorized");receipt.authEffectiveAccess=auth;
 receipt.targetProfiles=await clone.sql`select n.nspname schema,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.proconfig config,p.prosecdef definer,md5(p.prosrc) sourceMd5,md5(pg_get_functiondef(p.oid)) definitionMd5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('mutate_crm_supporter_with_audit','replace_supporter_roles_atomic','append_crm_consents_with_audit','mutate_crm_supporter_if_version_with_audit','bump_supporter_edit_version','bump_supporter_edit_version_from_role') order by n.nspname,p.proname`;
 const before=hash(await snapshot(clone.sql));
 const child=Bun.spawn(["bun","test","src/lib/crm/atomicForward.database.test.ts","--timeout","30000","--test-name-pattern",mode==="red"?"missing-target":"versioned actor"],{cwd:root,env:{...process.env,R01_CRM_TEST_DATABASE_URL:clone.url},stdout:"pipe",stderr:"pipe"});
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 const log=stdout+stderr;await writeFile(resolve(archive,`task-6-${mode}.log`),log);receipt.testExit=exit;receipt.testSummary=log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);receipt.catalogPreserved=before===hash(await snapshot(clone.sql));
 if(exit===0||!(mode==="red"?log.includes("42883"):log.includes('Expected: "42501"')))throw new Error("Actual expected Task6 RED absent");
 receipt.result=mode==="red"?"actual missing atomic functions 42883":"actual versioned wrapper accepts banned Auth actor";process.exitCode=1;
}finally{await clone.close();receipt.templatePreserved=clone.templatePreserved;receipt.modernPreserved=(await localSourceState(modern))===modernBefore;receipt.frozenInputsPreserved=hash(await blobs())===hash(frozen);receipt.cleanup="normal owned clone drop only";receipt.completedAt=new Date().toISOString();await writeFile(resolve(archive,`task-6-${mode}.json`),JSON.stringify(receipt,null,2)+"\n");console.log(JSON.stringify(receipt));}
