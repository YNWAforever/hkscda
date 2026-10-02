import {test,expect} from "bun:test";
import {captureLifecycle,captureFlagsFor} from "./task-11-capture-producer";
import {captureFlags,componentCaptureFlags} from "./task-11-receipt";

// Portable contract fixtures test the actual producer lifecycle. They are never
// catalog captures, migration inputs, or SQL execution evidence.
function fixture(failure?:string) {
 const calls:string[]=[];const clone={name:"portable",tableCount:162};
 const step=async(name:string)=>{calls.push(name);if(failure===name)throw Error(name+" failed")};
 const ops={sourceState:async()=>{await step("state");return "same"},capture:async(mode:string)=>{await step("capture:"+mode);return {catalog:{mode}}},create:async()=>{await step("create");return clone},scan:async()=>{await step("scan")},dependencies:async()=>{await step("dependencies")},component:async()=>{await step("component");return {componentSourceBound:true,componentOnlyAuthChanged:true}},metadata:async()=>{await step("metadata");return {catalogPreserved:true}},close:async()=>{await step("close")},templatePreserved:async()=>{await step("template");return true},frozenInputsPreserved:async()=>{await step("frozen");return true}};
 return {ops,calls};
}
for(const mode of ["hosted","modern","component"] as const)
 test("shared capture producer qualifies exact "+mode+" setup and flags",async()=>{
  const f=fixture();const r=await captureLifecycle(mode,f.ops);
  expect(r.eligible).toBe(true);expect(r.error).toBeNull();expect(r.failedFinalFlags).toEqual([]);
  expect(r.requiredFinalFlags).toEqual(mode==="component"?componentCaptureFlags:captureFlags);
  expect(f.calls).toEqual(["state","capture:"+mode,"create","scan","dependencies",...(mode==="component"?["component"]:[]),"scan","metadata","close","template","state","frozen"]);
 });
for(const stage of ["capture:modern","create","scan","dependencies","metadata","close","template","frozen"])
 test("shared capture producer fails closed at "+stage,async()=>{
  const f=fixture(stage),r=await captureLifecycle("modern",f.ops);
  expect(r.eligible).toBe(false);expect(r.error).toContain(stage+" failed");
  expect(r.failedFinalFlags.length).toBeGreaterThan(0);expect(f.calls).toContain("frozen");
  if(!["capture:modern","create"].includes(stage))expect(f.calls).toContain("close");
 });
test("shared capture producer rejects missing component truth and unknown modes",async()=>{
 const f=fixture();f.ops.component=async()=>({componentSourceBound:true,componentOnlyAuthChanged:false});
 const r=await captureLifecycle("component",f.ops);expect(r.eligible).toBe(false);expect(r.error).toContain("Component qualification");expect(f.calls).toContain("close");
 expect(()=>captureFlagsFor("unknown")).toThrow("Exact capture mode");
});
test("shared capture producer rejects changed source and nonliteral cleanup truth",async()=>{
 const f=fixture();let states=0;f.ops.sourceState=async()=>String(states++);f.ops.templatePreserved=async()=>false;
 const r=await captureLifecycle("modern",f.ops);expect(r.eligible).toBe(false);expect(r.failedFinalFlags).toContain("modernPreserved");expect(r.failedFinalFlags).toContain("templatePreserved");
});
