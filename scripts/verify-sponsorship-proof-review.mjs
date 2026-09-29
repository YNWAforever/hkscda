import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const browser=await chromium.launch(), results=[];
try{
 for(const width of [390,768,1366]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],requests=[];
  let writes=0,fail=false;
  page.on("pageerror",e=>errors.push(e.message));
  await context.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=="127.0.0.1") return route.abort();
   if(!url.pathname.startsWith("/api/")) return route.continue();
   if(route.request().method()!=="GET"){writes++;return route.fulfill({status:500,json:{error:"Read only fixture"}});}
   if(url.pathname!=="/api/admin/sponsorships/pledges") return route.fulfill({status:404,json:{error:"Unexpected fixture API"}});
   requests.push(url.search);
   if(fail) return route.fulfill({status:503,json:{error:"Synthetic unavailable"}});
   const proof=url.searchParams.get("proof"),status=url.searchParams.get("status"),p=Number(url.searchParams.get("page")||1),size=Number(url.searchParams.get("pageSize")||25),total=status?33:proof?66:100;
   return route.fulfill({json:{total,pledges:Array.from({length:Math.min(size,Math.max(0,total-(p-1)*size))},(_,i)=>({
     id:`11111111-1111-4111-8111-${String((p-1)*size+i+1).padStart(12,"0")}`,supporterId:"22222222-2222-4222-8222-222222222222",supporterName:`Synthetic ${proof||"all"} ${(p-1)*size+i+1}`,supporterEmail:"synthetic@example.invalid",monthlyTier:"300",amountCents:30000,currency:"HKD",language:"zh-HK",status:status||"active",createdAt:"2026-09-01T00:00:00Z",updatedAt:"2026-09-01T00:00:00Z"
   }))}});
  });
  await page.goto("http://127.0.0.1:56565/scripts/fixtures/sponsorship-proof.html?proof=pending&page=2&pageSize=10",{waitUntil:"networkidle"});
  await page.getByRole("combobox",{name:"憑證審核篩選"}).waitFor();
  assert.match(await page.getByRole("combobox",{name:"憑證審核篩選"}).innerText(),/待核實憑證/);
  assert.ok(requests.every(q=>new URLSearchParams(q).get("proof")==="pending"));
  assert.match(await page.locator("body").innerText(),/Synthetic pending 11/);
  await page.screenshot({path:`docs/evidence/audit-remediation-20260927/ui/t23-proof-queue-entry-${width}.png`,fullPage:true});
  await page.getByRole("button",{name:"下一頁",exact:true}).focus();await page.keyboard.press("Enter");
  await page.waitForFunction(()=>new URLSearchParams(location.search).get("page")==="3");
  await page.goBack();await page.waitForFunction(()=>new URLSearchParams(location.search).get("page")==="2");
  await page.goForward();await page.waitForFunction(()=>new URLSearchParams(location.search).get("page")==="3");
  await page.reload({waitUntil:"networkidle"});assert.match(await page.locator("body").innerText(),/Synthetic pending 21/);
  await page.getByRole("combobox",{name:"狀態",exact:true}).click();await page.getByRole("option",{name:"已確認",exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get("status")==="active"&&!new URLSearchParams(location.search).has("page"));
  await page.getByRole("combobox",{name:"憑證審核篩選"}).focus();await page.keyboard.press("Enter");await page.getByRole("option",{name:"所有憑證狀態",exact:true}).click();
  await page.waitForFunction(()=>!new URLSearchParams(location.search).has("proof"));
  await page.getByRole("textbox").fill("synthetic");
  await page.waitForResponse(r=>r.url().includes("q=synthetic"));assert.ok(!new URL(page.url()).searchParams.has("q"));
  fail=true;await page.getByRole("button",{name:"重新整理",exact:true}).click();
  await page.getByRole("alert").waitFor();
  fail=false;await page.getByRole("button",{name:"重新整理",exact:true}).click();await page.getByRole("alert").waitFor({state:"hidden"});
  const axe=await new AxeBuilder({page}).analyze(),overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.screenshot({path:`docs/evidence/audit-remediation-20260927/ui/t23-proof-queue-filtered-${width}.png`,fullPage:true});
  results.push({width,urlRestore:true,keyboardPaging:true,backForwardReload:true,filterComposition:true,errorRecovery:true,searchKeptOutOfUrl:true,writes,axe:axe.violations.map(v=>v.id),overflow,errors});await context.close();
 }
 console.log(JSON.stringify(results));assert.ok(results.every(v=>v.writes===0&&v.axe.length===0&&!v.overflow&&v.errors.length===0));
}finally{await browser.close();}
