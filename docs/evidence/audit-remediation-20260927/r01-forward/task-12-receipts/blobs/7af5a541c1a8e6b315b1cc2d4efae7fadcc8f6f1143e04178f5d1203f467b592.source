import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {queryKind,decodeScannerRows} from "./task-12-native-codec";
const group=readFileSync(resolve(import.meta.dir,"task-12-native-expression.fixture.txt"),"utf8"),finance=readFileSync(resolve(import.meta.dir,"task-12-finance-expression.fixture.txt"),"utf8");
// Portable literal query/type validation only. Neither fixture feeds SQL or catalog generation.
test("Task12 exact group expression query is admitted",()=>expect(queryKind(group)).toBe("expressions"));

for (const kind of ["functions","operators","triggers"] as const) {
 const query=readFileSync(resolve(import.meta.dir,"task-12-native-"+kind+".fixture.txt"),"utf8");
 test("unchanged finite "+kind+" query and exact fields",()=>{
  expect(queryKind(query)).toBe(kind);
  expect(()=>queryKind(query+" ")).toThrow();
  const valid=kind==="functions"?{oid:"4294967295"}:kind==="operators"?{oid:"1",implementationOid:"2",restrictionOid:null,joinOid:"0"}:{table_name:"public.group_enquiries",function_name:"set_updated_at"};
  expect(decodeScannerRows(query,[valid])).toEqual([kind==="functions"?{oid:4294967295}:kind==="operators"?{oid:1,implementationOid:2,restrictionOid:null,joinOid:0}:valid]);
  for(const raw of [null,{},[null],[[]],[{}]])expect(()=>decodeScannerRows(query,raw)).toThrow();
  const fields=Object.keys(valid);
  for(const field of fields){const missing={...valid};delete missing[field];expect(()=>decodeScannerRows(query,[missing])).toThrow();}
  if(kind!=="triggers")for(const value of [null,-1,4294967296,"01","invalid",[]])expect(()=>decodeScannerRows(query,[{...valid,oid:value}])).toThrow();
  else for(const value of [null,1,[]])expect(()=>decodeScannerRows(query,[{...valid,table_name:value}])).toThrow();
 });
}
test("old finance and all unknown queries are rejected",()=>{expect(()=>queryKind(finance)).toThrow();expect(()=>queryKind(group+" ")).toThrow();expect(()=>queryKind("select 1")).toThrow();});
test("finite group codec preserves exact uint32 arrays and rejects malformed wire fields",()=>{
 expect(decodeScannerRows(group,[{expression:"true",operatorOids:["0","4294967295",42]}])).toEqual([{expression:"true",operatorOids:[0,4294967295,42]}]);
 for(const raw of [null,{},[null],[[]],[{}],[{expression:"true"}],[{expression:1,operatorOids:[]}],[{expression:"true",operatorOids:null}],[{expression:"true",operatorOids:["01"]}],[{expression:"true",operatorOids:[null]}],[{expression:"true",operatorOids:[4294967296]}],[{expression:"true",operatorOids:[-1]}],[{expression:"true",operatorOids:["not-an-oid"]}]])expect(()=>decodeScannerRows(group,raw)).toThrow();
});
