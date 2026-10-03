/** R64 source-only metadata admission. Native NEXT and after rows remain unobserved. */
export const nativeFlags=["receiptBound","rawFilesBound","projectionBound","authorityBound","qualificationExplicit"] as const;
export function assertNativeProfile(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Native source object required");
 const r=value as Record<string,unknown>;
 if(r.receiptVersion!==1||r.receiptType!=="native-source-qualification"||r.mode!=="native-metadata-only"||r.error!==null||JSON.stringify(r.failedFinalFlags)!=="[]"||JSON.stringify(r.requiredFinalFlags)!==JSON.stringify(nativeFlags)||nativeFlags.some(k=>r[k]!==true))throw Error("Exact native source flags/version/mode required");
 const pins={rulingSha256:"94222ad1965c265acb1046d8ed364c425f5147fc07236c32798a42c94a779d06",captureSha256:"0b23f5c6b913db501de7ac90774c8279e1715e8e9feb26b8aef8b39eb133d888",originalReceiptSha256:"70451e5238d24e3be591e5841336c1eb049bd0d1b4fe8bf1fa309cdfd5228812",sourceHead:"f4e96e3484d135d179caea835d913552d96d2dcb"};
 if(Object.entries(pins).some(([k,v])=>r[k]!==v)||r.sourceAdmission!==true||r.nativeNextObserved!==false||r.domainRowsAfterObserved!==false||r.nativeLocalBunBehaviorRun!==false||r.nextProvenance!=="observed-modern-render-only"||r.migrationCount!==183||r.cleanupCount!==4||JSON.stringify(r.managedKinds)!=='["realtime","storage","auth"]')throw Error("Native source admission exceeds R64 observation");
 const v=r.vector as Record<string,unknown>|undefined;
 if(!v||Object.keys(v).sort().join(",")!=="auth,catalog,helpers,indexes,native,shapes"||!v.catalog||Object.keys(v.catalog).length!==15||!v.auth||Object.keys(v.auth).length!==11||![ ["helpers",6],["native",396],["indexes",26],["shapes",4] ].every(([k,count])=>Array.isArray(v[k])&&v[k].length===count))throw Error("Complete correlated native metadata cardinality required");
 for(const [key,body,definition]of [["oldTargets","d9d5c9d4918cab681786bd7f6def2de2","053f4dfc4ae75dd19f4c81488914ec3a"],["nextTargets","2769396f44ea208f010b60be0a8077ee","5385cdfd05d569b1bc57feaefa187ece"]]){const targets=r[key] as Record<string,unknown>[];if(!Array.isArray(targets)||targets.length!==1||targets[0].body!==body||targets[0].definition!==definition)throw Error("Exact native OLD/derived NEXT provenance required");}
 return r;
}
