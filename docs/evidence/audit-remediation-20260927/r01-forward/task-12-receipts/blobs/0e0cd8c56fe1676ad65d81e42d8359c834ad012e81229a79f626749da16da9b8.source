import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {assertNativeProfile} from "./task-12-native-profile";
import {preserved,rawSha,gitBlob,type Binding} from "./task-12-binding";
import {vector} from "./task-12-vector";
export async function verifyNativeProfile(value:unknown,root:string,archive:string){
 const r=assertNativeProfile(value);
 if(!await preserved(root,archive,r.bindings as Record<string,Binding>))throw Error("Native qualification raw/canonical/Git/current/archive bindings differ");
 const directory=String(r.originalDirectory);
 if(directory!==".superpowers/sdd/r01-forward-schema-plan-20261001/task-12-native-retry-210608b8ea6c4f21bcff693bbd73a74d/")throw Error("Exact R64 observed source directory required");
 for(const [path,e]of Object.entries(r.originalFiles as Record<string,{rawSha256:string;bytes:number;rawGitBlob:string}>)){const b=await readFile(resolve(root,directory,path));if(rawSha(b)!==e.rawSha256||b.length!==e.bytes||gitBlob(b)!==e.rawGitBlob)throw Error("Native observed transport bytes differ: "+path);}
 const bytes=await readFile(resolve(root,directory,"f4-group-baseline.json"));
 if(rawSha(bytes)!==r.captureSha256)throw Error("Native observed capture differs");
 const captured=JSON.parse(bytes.toString());
 if(!isDeepStrictEqual(vector(captured),r.vector)||!isDeepStrictEqual(captured.functions.filter((f:Record<string,unknown>)=>f.name==="update_group_enquiry_with_audit"),r.oldTargets))throw Error("Whole observed native vector/OLD differs");
 return r;
}
