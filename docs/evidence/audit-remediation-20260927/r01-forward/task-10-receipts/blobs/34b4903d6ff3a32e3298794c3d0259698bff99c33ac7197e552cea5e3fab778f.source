import {writeFile} from "node:fs/promises";
import {createCrmHandlers} from "../../../../src/lib/crm/http.server";
type Args=Parameters<typeof createCrmHandlers>[0];
const denied=async()=>{throw {code:"42501",message:"supporter_edit_forbidden"};};
const handlers=createCrmHandlers({requireTreasurer:async()=>({authUserId:"11111111-1111-4111-8111-111111111111"} as Awaited<ReturnType<Args["requireTreasurer"]>>),service:{createSupporter:denied,updateSupporter:denied,appendConsents:denied} as unknown as Args["service"]});
const results=[];
for(const action of ["createSupporter","updateSupporter","appendConsents"] as const){
 const response=await handlers[action]({request:new Request("http://127.0.0.1/crm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action==="updateSupporter"?{expectedVersion:1,name:"Synthetic"}:{source:"admin",email:true})}),params:{id:"22222222-2222-4222-8222-222222222222"}});
 results.push({action,injected:{code:"42501",message:"supporter_edit_forbidden"},status:response.status,body:await response.json()});
}
await writeFile("docs/evidence/audit-remediation-20260927/r01-forward/task-6-green-receipts/http-error-probe.json",JSON.stringify({kind:"existing-path inert injected error compatibility probe; no DB/HTTP/provider",results},null,2)+"\n");
console.log(JSON.stringify(results));process.exitCode=results.every(r=>r.status===403)?0:1;