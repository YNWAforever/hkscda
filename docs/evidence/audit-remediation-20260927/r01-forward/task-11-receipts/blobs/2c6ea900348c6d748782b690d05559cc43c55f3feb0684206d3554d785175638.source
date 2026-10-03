/** One Task11 live capture pipeline. Historical executed sources stay archived. */
import {mkdir,readFile,writeFile,copyFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {captureProductionSchema,captureModernLocalSchema,createProductionClone,assertSafeFixtureTables,snapshot,hash,localSourceState} from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import {fixtureScope,dependencies,functionsQuery,authQuery,nativeQuery,indexDetailsQuery,shapesQuery} from "./task-11-profile";
import {targetDefinitions} from "./task-11-targets";
import {captureFlags,componentCaptureFlags,assertCapture} from "./task-11-receipt";
type CaptureMode="hosted"|"modern"|"component";
type RecordValue=Record<string,any>;
export function captureFlagsFor(mode:string) {
 if(!["hosted","modern","component"].includes(mode))throw Error("Exact capture mode required");
 return [...(mode==="component"?componentCaptureFlags:captureFlags)];
}
type CaptureOps<S extends {catalog:unknown},C extends {name:string;tableCount:number}>={
 sourceState():Promise<string>;capture(mode:CaptureMode):Promise<S>;create(source:S):Promise<C>;
 scan(clone:C):Promise<void>;dependencies(clone:C):Promise<void>;component(clone:C):Promise<RecordValue>;
 metadata(clone:C):Promise<RecordValue>;close(clone:C):Promise<void>;templatePreserved(clone:C):Promise<boolean>;
 frozenInputsPreserved():Promise<boolean>;
};
/** Actual stage/cleanup producer contract; portable hooks never create proof SQL. */
export async function captureLifecycle<S extends {catalog:unknown},C extends {name:string;tableCount:number}>(mode:CaptureMode,ops:CaptureOps<S,C>) {
 const requiredFinalFlags=captureFlagsFor(mode),r:RecordValue={receiptType:"capture",mode,requiredFinalFlags,error:null,failedFinalFlags:[]};
 let clone:C|undefined,modernBefore:string|undefined;
 const error=(e:unknown)=>{r.error=[r.error,String(e)].filter(Boolean).join("; ")};
 try {
  modernBefore=await ops.sourceState();r.stage="capture";
  const source=await ops.capture(mode);r.sourceCatalog=source.catalog;r.sourceCatalogHash=hash(source.catalog);
  clone=await ops.create(source);r.clone=clone.name;r.schemaParity=true;r.zeroApplicationTables=clone.tableCount;
  r.stage="scanner";await ops.scan(clone);r.fullScannerPassed=true;
  r.stage="accepted-dependency-composition";await ops.dependencies(clone);r.dependenciesBound=true;
  if(mode==="component"){
   Object.assign(r,await ops.component(clone));
   if(r.componentSourceBound!==true||r.componentOnlyAuthChanged!==true)throw Error("Component qualification requires both literal true flags");
  }
  await ops.scan(clone);r.stage="metadata";Object.assign(r,await ops.metadata(clone));
 } catch(e){error(e)} finally {
  if(clone){try{await ops.close(clone);r.normalDrop=true}catch(e){r.normalDrop=false;error(e)}
   try{r.templatePreserved=await ops.templatePreserved(clone)}catch(e){r.templatePreserved=false;error(e)}
  }
  if(modernBefore!==undefined){try{r.modernPreserved=modernBefore===await ops.sourceState()}catch(e){r.modernPreserved=false;error(e)}}
  try{r.frozenInputsPreserved=await ops.frozenInputsPreserved()}catch(e){r.frozenInputsPreserved=false;error(e)}
  r.failedFinalFlags=requiredFinalFlags.filter(flag=>r[flag]!==true);
  r.eligible=r.error===null&&r.failedFinalFlags.length===0;
 }
 return r;
}
const sourceFixture=".superpowers/sdd/r01-forward-schema-plan-20261001/task-9-fix-4-helper-comparison.json";
const vendorFixture=".superpowers/sdd/r01-forward-schema-plan-20261001/task-9-fix-4-stageb-20261002T091944Z/after-auth-catalog.json";
const prefix="docs/evidence/audit-remediation-20260927/r01-forward/";
export async function runCapture(mode:string,output:string) {
 captureFlagsFor(mode);const exactMode=mode as CaptureMode,root=resolve(import.meta.dir,"../../../.."),out=resolve(output??"");
 if(process.env.R01_FINANCE_CALLBACK_ALLOW_LOCAL_FIXTURES!=="1"||!out.startsWith(resolve(root,".superpowers/sdd/r01-forward-schema-plan-20261001/task-11-capture-")))throw Error("Exact own profile opt-in/mode/output required");
 const paths=[...(mode==="component"?[sourceFixture,vendorFixture]:[]),prefix+(mode==="component"?"task-11-component-capture.ts":"task-11-capture.ts"),prefix+"task-11-capture-producer.ts",prefix+"task-11-receipt.ts",prefix+"task-11-profile.ts",prefix+"task-11-targets.ts",prefix+"task-10-profile.ts",prefix+"task-9-profile.ts","supabase/rls-tests/helpers/productionSchemaClone.ts",...dependencies.map(([f])=>"supabase/migrations/"+f),...["20260925143941_guarded_provider_denial.sql","20260925144915_guarded_provider_refund.sql","20260926082239_atomic_receipt_void_audit.sql","20260926083940_atomic_manual_receipt_issue_audit.sql"].map(f=>"supabase/migrations/"+f)];
 await mkdir(out,{recursive:true});const bindings:RecordValue={},sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
 for(const[i,p]of paths.entries()){
  const b=await readFile(resolve(root,p)),proc=Bun.spawn(["git","hash-object","--no-filters",resolve(root,p)],{stdout:"pipe",stderr:"pipe"});
  const[blob,err,exit]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);if(exit!==0||err)throw Error("Git binding failed "+p);
  bindings[p]={rawBytes:b.length,rawSha256:sha(b),canonicalSha256:hash(b.toString().replaceAll("\r\n","\n")),rawGitBlob:blob.trim(),archive:"s"+i+".source"};await copyFile(resolve(root,p),resolve(out,"s"+i+".source"));
 }
 const r=await captureLifecycle(exactMode,{
  sourceState:()=>localSourceState("postgresql://postgres:postgres@127.0.0.1:57322/postgres"),
  capture:mode=>mode==="hosted"?captureProductionSchema():captureModernLocalSchema(),create:createProductionClone,
  scan:c=>assertSafeFixtureTables(c.sql,fixtureScope),
  dependencies:async c=>{for(const[f,h]of dependencies){const b=await readFile(resolve(root,"supabase/migrations",f));if(sha(b)!==h)throw Error("Accepted source dependency bytes differ "+f);await c.sql.begin(async tx=>{await tx`set local role postgres`;await tx.unsafe(b.toString())})}},
  component:async c=>{
   const sourceObject=JSON.parse(await readFile(resolve(root,sourceFixture),"utf8")),vendorObject=JSON.parse(await readFile(resolve(root,vendorFixture),"utf8"));
   if(hash(await readFile(resolve(root,sourceFixture),"utf8"))!=="b1afa5d56a9a5793ae7dc618479fd997b74d635093dd3f5eb2a7ea2b3af7ab77"||!vendorObject.functions.some((f:RecordValue)=>f.schema==="auth"&&f.name==="uid"&&f.definition===sourceObject.finalHelper.definition))throw Error("Actual independently bound vendor source differs");
   const originalCatalog=await snapshot(c.sql),originalFunctions=await c.sql.unsafe(functionsQuery);
   await c.sql.begin(async tx=>{await tx`set local role supabase_auth_admin`;await tx.unsafe(sourceObject.finalHelper.definition)});
   const componentFunctions=await c.sql.unsafe(functionsQuery),strip=(fs:RecordValue[])=>fs.map(f=>f.schema==="auth"&&f.name==="uid"?{...f,body:null,definition:null}:f);
   return {componentSourceBound:true,componentOnlyAuthChanged:hash(originalCatalog)===hash(await snapshot(c.sql))&&hash(strip(originalFunctions))===hash(strip(componentFunctions)),qualification:"Own PG17.6 reconstruction consumes historically actual Task9 vendorLF/afterAuth artifacts newly bound/installed/observed here; not fresh full17.11 bootstrap or vendor fetch"};
  },
  metadata:async c=>{
   const db=c.sql,before=await snapshot(db),data:RecordValue={catalog:before,functions:await db.unsafe(functionsQuery),auth:(await db.unsafe(authQuery))[0].value,native:(await db.unsafe(nativeQuery))[0].value,indexes:(await db.unsafe(indexDetailsQuery))[0].value,shapes:(await db.unsafe(shapesQuery))[0].value};
   const rollback=new Error("Task11 tuple renderer rollback"),definitions=await targetDefinitions(root);
   for(const version of ["old","next"] as const){try{await db.begin(async tx=>{await tx`set local role postgres`;for(const definition of definitions)await tx.unsafe(definition[version]);data[version+"Targets"]=(await tx.unsafe(functionsQuery)).filter(f=>definitions.some(d=>f.schema==="public"&&f.name===d.name));if(data[version+"Targets"].length!==5)throw Error("Exact five rendered target cardinality required");throw rollback})}catch(e){if(e!==rollback)throw e}}
   data.catalogPreserved=hash(before)===hash(await snapshot(db));return data;
  },close:c=>c.close(),templatePreserved:async c=>c.templatePreserved,
  frozenInputsPreserved:async()=>{for(const[p,entry]of Object.entries(bindings))if(sha(await readFile(resolve(root,p)))!==entry.rawSha256)return false;return true},
 });
 Object.assign(r,{out,at:new Date().toISOString(),sourceBase:"d45b849d300f76700efcf5450a9b426e32cc372f",fixBase:"56defe4f5eaa111ffda57848f394c395c914ffd4",bindings,fixtureScope,dependencies,task1Applied:false,task8Applied:false,productionApplied:false,deployed:false,operationallyEnabled:false});
 if(r.eligible){try{assertCapture(r,exactMode)}catch(e){r.error=String(e);r.eligible=false}}
 await writeFile(resolve(out,"receipt.json"),JSON.stringify(r,null,2)+"\n");console.log(JSON.stringify({out,mode,stage:r.stage,eligible:r.eligible,error:r.error,failedFinalFlags:r.failedFinalFlags}));process.exitCode=r.eligible?0:1;
}
