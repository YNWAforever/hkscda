import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch(),results=[];
try{for(const width of [390,1366]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();let release,arrived;
 const requested=new Promise(resolve=>{arrived=resolve;});
 await context.route("**/*",async route=>{
  const u=new URL(route.request().url());if(u.hostname!=="127.0.0.1")return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  if(u.pathname.endsWith('/followup-assignees'))return route.fulfill({json:{assignees:[]}});
  if(u.pathname==='/api/admin/sponsorships/pledges'){
   if(u.searchParams.get('pageSize')==='50'){arrived();await new Promise(resolve=>{release=resolve;});}
   return route.fulfill({json:{total:25,pledges:Array.from({length:25},(_,i)=>({id:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,supporterId:'22222222-2222-4222-8222-222222222222',supporterName:'Synthetic '+i,supporterEmail:'synthetic@example.invalid',monthlyTier:'100',amountCents:10000,currency:'HKD',status:'needs_followup',createdAt:'2026-09-01T00:00:00Z'}))}});
  }
  return route.fulfill({status:503,json:{error:'Synthetic detail not needed'}});
 });
 await page.goto('http://127.0.0.1:56568/scripts/fixtures/sponsorship-bulk.html?status=needs_followup',{waitUntil:'networkidle'});
 await page.locator('input[type=checkbox]:visible').first().check();
 const opened=await page.getByRole('dialog').count();
 if(!opened&&width===390)await page.screenshot({path:'docs/evidence/audit-remediation-20260927/ui/t23-bulk-checkbox-after-390.png'});
 if(opened){await page.screenshot({path:`docs/evidence/audit-remediation-20260927/ui/t23-bulk-checkbox-before-${width}.png`});await page.keyboard.press('Escape');}
 await page.getByRole('button',{name:'清除選取',exact:true}).click();
 await page.getByRole('button',{name:'選取全部符合條件（最多 1000 筆）',exact:true}).click();await requested;
 const status=page.getByRole('combobox',{name:'狀態',exact:true});await status.click();await page.getByRole('option',{name:'全部狀態',exact:true}).click();
 await status.click();await page.getByRole('option').filter({hasText:'跟進'}).click();
 release();await page.getByText('正在固定選取範圍…',{exact:true}).waitFor({state:'hidden'});
 const selected=await page.getByRole('region',{name:'助養跟進批量分派'}).getByText(/已選 \d+ 筆/).innerText();results.push({width,opened,selected});await context.close();
}console.log(JSON.stringify(results));assert.ok(results.every(r=>r.opened===0&&r.selected.includes('已選 0 筆')));}finally{await browser.close();}
