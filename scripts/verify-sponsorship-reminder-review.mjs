import assert from "node:assert/strict";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
const before=process.argv.includes('--before'),browser=await chromium.launch(),results=[];
const id='22222222-2222-4222-8222-222222222222';
try{for(const width of [390,768,1366])for(const mode of before?['cancel']:['cancel','recipient','proof','ledger','late']){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];let writes=0,release,started;
 let state={id,supporterId:id,status:'active',language:'zh-HK',followupVersion:1,followupAssigneeUserId:null,supporterName:'Synthetic supporter',supporterEmail:'synthetic@example.invalid',supporterPhone:null,amountCents:10000,monthlyTier:'100',createdAt:'2026-09-01T00:00:00Z',preferences:[],proofHistory:[],currentProof:null,assignments:[],periods:[{id,periodMonth:'2026-08-01',committedCents:10000,allocatedCents:0,outstandingCents:10000,allocations:[]}],recentAuditLog:[]};
 const draft={kind:'draft',recipient:{name:state.supporterName,email:state.supporterEmail},periodMonth:'2026-08-01',outstandingCents:10000,generatedAt:'2026-09-30T00:00:00Z',subject:'Synthetic subject',body:'Synthetic draft body — not sent'};
 const ready=new Promise(resolve=>{started=resolve;});page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  if(u.pathname.endsWith('/reminder-draft')){assert.equal(route.request().method(),'GET');if(mode==='late'){started();await new Promise(resolve=>{release=resolve;});}return route.fulfill({json:draft});}
  if(u.pathname.endsWith('/cancel')){writes++;state={...state,status:'cancelled'};return route.fulfill({json:{ok:true}});}
  if(u.pathname.endsWith('/finance'))return route.fulfill({json:{canRefund:false,canCoordinate:true,receipts:[],candidates:[],sources:[],refunds:[],deliveries:[]}});
  if(u.pathname.endsWith('/followup-assignees'))return route.fulfill({json:{assignees:[]}});
  if(u.pathname===`/api/admin/sponsorships/pledges/${id}`)return route.fulfill({json:{pledge:state}});
  return route.fulfill({status:404,json:{error:'Unexpected fixture API'}});
 });
 await page.goto('http://127.0.0.1:56569/scripts/fixtures/sponsorship-reminder.html',{waitUntil:'networkidle'});
 const generate=page.getByRole('button',{name:'核對並產生草稿',exact:true});await generate.focus();await page.keyboard.press('Enter');
 if(mode==='late')await ready;else await page.getByRole('textbox',{name:'內容草稿',exact:true}).waitFor();
 if(mode==='cancel'){
  const button=page.getByRole('button',{name:'取消助養',exact:true});await button.click();await button.waitFor({state:'hidden'});
 }else{
  if(mode==='recipient')state={...state,supporterName:'Changed supporter',supporterEmail:'changed@example.invalid'};
  if(mode==='proof')state={...state,proofHistory:[{id,revision:2,reviewStatus:'pending',storagePath:'synthetic:none',createdAt:'2026-09-30T00:00:00Z',paymentMethod:'bank_transfer',amountCents:10000,source:'supporter',fileType:'application/pdf'}]};
  if(mode==='ledger')state={...state,periods:[{...state.periods[0],outstandingCents:0,allocatedCents:10000}]};
  if(mode==='late')state={...state,status:'cancelled'};
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/admin/sponsorships/pledges/${id}`);await page.evaluate(()=>window.dispatchEvent(new Event('fixture-refresh')));await response;await page.getByRole('button',{name:'核對並產生草稿',exact:true}).waitFor();
  if(mode==='late'){release();await page.waitForLoadState('networkidle');}
 }
 const stale=await page.getByRole('textbox',{name:'內容草稿',exact:true}).count();
 const axe=await new AxeBuilder({page}).analyze(),overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(mode==='cancel')await page.screenshot({path:`docs/evidence/audit-remediation-20260927/ui/t23-reminder-${before?'before':'after'}-${width}.png`,fullPage:true});
 results.push({width,mode,stale,writes,axe:axe.violations.map(v=>v.id),overflow,errors});await context.close();
}console.log(JSON.stringify(results));assert.ok(results.every(r=>r.stale===0&&r.axe.length===0&&!r.overflow&&r.errors.length===0));}finally{await browser.close();}
