import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const before=process.argv.includes("--before"),browser=await chromium.launch(),results=[];
const chosen="33333333-3333-4333-8333-333333333333",other="44444444-4444-4444-8444-444444444444",id="22222222-2222-4222-8222-222222222222";
try { for(const width of [390,768,1366]) for(const mode of before?["lost"]:["lost","refresh_fail","conflict","unknown"]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],posts=[];
 let state={id,status:"needs_followup",followupVersion:1,followupAssigneeUserId:null,supporterId:id,supporterName:"Synthetic supporter",supporterEmail:"synthetic@example.invalid",supporterPhone:null,amountCents:10000,monthlyTier:"100",createdAt:"2026-09-30T00:00:00Z",preferences:[],proofHistory:[],currentProof:null,assignments:[],periods:[],recentAuditLog:[]},failGet=false;
 page.on("pageerror",e=>errors.push(e.message));
 await context.route("**/*",async route=>{
  const url=new URL(route.request().url());if(url.hostname!=="127.0.0.1")return route.abort();if(!url.pathname.startsWith("/api/"))return route.continue();
  if(url.pathname.endsWith("/finance"))return route.fulfill({json:{canRefund:false,canCoordinate:true,receipts:[],candidates:[],sources:[],refunds:[],deliveries:[]}});
  if(url.pathname.endsWith("/followup-assignees"))return route.fulfill({json:{assignees:[{authUserId:chosen,email:"staff@example.invalid",role:"staff"},{authUserId:other,email:"other@example.invalid",role:"staff"}]}});
  if(url.pathname.endsWith("/followup-assignment")){
   const body=route.request().postDataJSON();posts.push(body);
   if(mode==="lost"||mode==="refresh_fail")state={...state,followupAssigneeUserId:chosen,followupVersion:2};
   if(mode==="conflict")state={...state,followupAssigneeUserId:other,followupVersion:2};
   failGet=mode==="refresh_fail"||mode==="unknown";
   if(mode==="refresh_fail")return route.fulfill({json:{pledgeId:id,assigneeUserId:chosen,version:2,replayed:false}});
   return route.abort("failed");
  }
  if(url.pathname===`/api/admin/sponsorships/pledges/${id}`)return failGet?route.fulfill({status:503,json:{error:"Synthetic refresh unavailable"}}):route.fulfill({json:{pledge:state}});
  return route.fulfill({status:404,json:{error:"Unexpected fixture API"}});
 });
 await page.goto("http://127.0.0.1:56567/scripts/fixtures/sponsorship-followup.html",{waitUntil:"networkidle"});
 const picker=page.getByRole("combobox",{name:"跟進職員",exact:true});await picker.waitFor();await picker.focus();await page.keyboard.press("Enter");await page.getByRole("option",{name:"staff@example.invalid",exact:true}).click();
 const button=page.getByRole("button",{name:"分派跟進",exact:true});await button.focus();await page.keyboard.press("Enter");
 if(mode==="lost"&&!before)await page.getByRole("status").filter({hasText:"分派已儲存"}).waitFor();
 else if(mode==="refresh_fail")await page.getByRole("status").filter({hasText:"最新資料未能載入"}).waitFor();
 else if(mode==="unknown")await page.getByRole("alert").filter({hasText:"未能確認分派結果"}).waitFor();
 else if(mode==="conflict")await page.getByRole("alert").filter({hasText:"跟進資料已有更新"}).waitFor();
 else await page.getByRole("alert").waitFor();
 if(mode==="unknown"){
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='分派跟進'&&!b.disabled));
  failGet=false;state={...state,followupAssigneeUserId:other,followupVersion:3};
  await page.evaluate(()=>window.dispatchEvent(new Event("fixture-refresh")));await page.getByText(/目前由 other@example.invalid 跟進/).waitFor();
  await button.click({timeout:5000});await page.getByRole("alert").waitFor();
  assert.deepEqual(posts,[{assigneeUserId:chosen,expectedVersion:1},{assigneeUserId:chosen,expectedVersion:1}]);
 } else assert.equal(posts.length,1);
 if(mode==="conflict")assert.equal(await button.isDisabled(),true);
 const axe=await new AxeBuilder({page}).analyze(),overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(mode==="lost")await page.screenshot({path:`docs/evidence/audit-remediation-20260927/ui/t23-followup-${before?"before":"after"}-${width}.png`,fullPage:true});
 results.push({width,mode,before,posts,axe:axe.violations.map(v=>v.id),overflow,errors});await context.close();
 }
 console.log(JSON.stringify(results));assert.ok(results.every(v=>v.axe.length===0&&!v.overflow&&v.errors.length===0));
}finally{await browser.close();}
