import { chromium } from "playwright";
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.addInitScript(()=>{window.__shifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries()){if(!e.hadRecentInput) window.__shifts.push({value:e.value,sources:(e.sources||[]).map(s=>({node:s.node?.outerHTML?.slice(0,300),previousRect:s.previousRect,currentRect:s.currentRect}))})}}).observe({type:'layout-shift',buffered:true})});
await page.goto('http://127.0.0.1:4173/adoption/apply',{waitUntil:'networkidle'}); await page.waitForTimeout(2000);
console.log(JSON.stringify(await page.evaluate(()=>window.__shifts),null,2)); await browser.close();
