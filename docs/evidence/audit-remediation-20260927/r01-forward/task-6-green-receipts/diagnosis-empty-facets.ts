import {readFile,writeFile} from "node:fs/promises";
import {captureProductionSchema,createProductionClone,snapshot,hash} from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
const capture=await captureProductionSchema(),clone=await createProductionClone(capture),receipt:Record<string,unknown>={sourceCatalogHash:hash(capture.catalog),clone:clone.name,schemaParity:true};
try{const db=clone.sql;for(const f of ["20261001134252_r01_adoption_upload_forward.sql","20261001154743_r01_animal_preference_record_fields.sql","20261001150925_r01_sponsorship_submission_forward.sql","20261001175310_r01_internship_upload_forward.sql","20261001193722_r01_animal_draft_archive_forward.sql"]){await db.begin(async tx=>{await tx`set local role postgres`;await tx.unsafe(await readFile("supabase/migrations/"+f,"utf8"));});}
 const catalog=await snapshot(db),text=await readFile("supabase/migrations/20261001213914_r01_crm_atomic_forward.sql","utf8"),expected=JSON.parse(await readFile("docs/evidence/audit-remediation-20260927/r01-forward/task-6-preflight-receipts/hosted.json","utf8"));
 const query=text.slice(text.indexOf("  select pg_catalog.jsonb_object_agg(k"),text.indexOf("  -- Empty facets")).replace(" into v_actual","").replaceAll("v_catalog","$1::jsonb").replaceAll("v_name","'supporter'").replaceAll("v_table","'public.supporter'::regclass");
 const [row]=await db.unsafe(query,[JSON.stringify(catalog)]);const actual=Object.values(row)[0] as Record<string,unknown>;for(const key of Object.keys(actual))if(actual[key]===null)actual[key]=[];
 const wanted=expected.domainProfiles.find((p:{name:string})=>p.name==="supporter").profile;
 const diffs=Object.keys(wanted).filter(k=>hash(wanted[k])!==hash(actual[k])).map(k=>({facet:k,expected:wanted[k],actual:actual[k]}));
 const [digest]=await db`select md5(${JSON.stringify(actual)}::jsonb::text) actual,md5(${JSON.stringify(wanted)}::jsonb::text) expected`;
 receipt.actual=actual;receipt.expected=wanted;receipt.digests=digest;receipt.diffs=diffs;receipt.dependencyDomainDrift=Object.keys(wanted).filter(k=>k!=="shape"&&hash(wanted[k])!==hash(((catalog[k]??[])as Record<string,unknown>[]).filter(x=>x.schema==="public"&&(x.table??x.name)==="supporter")));
 console.log(JSON.stringify({digests:digest,diffs,dependencyDomainDrift:receipt.dependencyDomainDrift}));
}finally{await clone.close();receipt.templatePreserved=clone.templatePreserved;receipt.cleanup="normal owned drop";await writeFile("docs/evidence/audit-remediation-20260927/r01-forward/task-6-green-receipts/profile-diagnosis.json",JSON.stringify(receipt,null,2)+"\n");}
