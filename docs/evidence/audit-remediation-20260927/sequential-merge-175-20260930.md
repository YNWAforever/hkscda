# PR175 sequential release preparation — 2026-09-30

## Scope, source and release state

Application `04d673b8ef64d690ed75bf47cdc0175aefed5b02`, integrated baseline bff8115f, predecessor#174 0e7e4e75f134c40a99b8842d962ce39b0a9d5ff5. Guarded exact-bank-match snapshots and explicit one-item confirmation. No blind bulk credit, refund, immediate delivery, new scheduler or checkout activation. Codecomplete:this slice; schema-ready:isolated only; deployed:no; operationally-enabled:no. ADMIN-04partial. Existing historical evidence remains contextual; this report describes current verification.

## Reproduced fixes

- Held mount GET A followed by createB thenlateA produced visibleA/storageB. Shared busy ref serializes recovery/create/read/apply; generation+mounted guards stop stale/unmounted writes. Creation afterunmount previously overwrote another mount's savedID.
- Failed mount recovery retainedID but offered no readretry. Now preserveID and show readretry; unknown apply or failed refresh disables furtherwrites until freshread succeeds.
- OperationApage2→one-rowB left an emptytable withnoaction/pager. Key review byoperationID resets page.
- Review of the first repair found a shared-tab identity lockout: actorA's global recoveryID caused actorB's403 to blocknewcreates. Required actorID comes from existing verifiedadminidentity, parentremounts onactor/role and hidesinactive/error; storagekeys are actor-specific. Legacy unownedkey stays untouched and is not auto-loaded; no PR175 productionstate exists to migrate. Server ownership rechecks unchanged.
- Browser found scrollable-region-focusable when actions were absent. NamedtabIndex0 region fixes keyboard scrolling.

Initial operation tests red3pass/3fail/8assertions→10pass/30assertions. Actor-switch red3pass/1fail/6assertions→11pass/35assertions; independentreview closedallfindings and repeated11pass35assertions. Original browser at390/768/1366 showed0rows aftersnapshotreplacement; fixed1row. Prior#172BOM/UTF8/duplicate/generation fixes retained during sourceconflictresolution.

## Executed gates

| Command | Environment / source | Result / exit |
| --- | --- | --- |
| `bun test --isolate` eight confirmation/domain/API/component/DB files | repairedsource;actualservice_role52322/audit_pr135_20260929 |19pass/86assertions/1041ms /0 |
| `bun test --isolate --timeout 30000` | repairedlogic before final focusability/counter-ref lint clarification;CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres;SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3125pass/145skip/0fail/9862assertions/578files/32.37s /0 |
| finaloperation+dryrunhooktests | finalapp aftercounterclarification |7pass/14assertions/214ms /0 |
| `npm.cmd run typecheck` | before semantics-equivalent counterref clarification |0 |
| `npm.cmd run lint` | finalapp |0;52warnings (two new false DOM-ref warnings removed by naming counterrefs) |
| `npm.cmd run build` | beforecounterclarification;synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY,SUPABASE_URL/SERVICE_ROLE_KEY,loopback54329 |0 |
| `bun test --isolate src/lib/donations/bankMatchConfirmation.database.test.ts` | actualservice_role plus2connections,localclone |2pass/23assertions/267ms /0 |
| `bun scripts/verify-bank-match-migration.ts` | full exactSQL,emptyclone,synthetic transaction |8.98msSQL;6oldrows unchanged;1000preview171.83ms;1000itemattempts3418.72ms;897success100skip3conflict;897creditaudits/jobs,900itemaudits;rollback0 /0 |
| `node scripts/verify-bank-match-review.mjs --before` | original integratedbff8115fpanel;56573;syntheticAPI |3widths reproduce invisibleone-rowoperation /1 |
| same browser without --before | repairedpanel390/768/1366×page/mount/lost/actor |12cases;1visiblerow,serializedrecovery,onePATCHafterlostreply,GETrecovery/CSV,actorAretained/Bseparate;Axe0/errors0/nooverflow /0 |

Fullsuite not repeated for focusability/counterclarification; focused/browser/lint ran as shown. Final exacthead CI awaits push and will run all releasegates. Skips notpasses. DBURL guard permits only exactloopback57322/postgres or52322/audit_pr135_20260929 with noquery/hash and BANK_MATCH_CONFIRM_TEST_ALLOW_LOCAL_FIXTURES=1. Fixture mutations aspostgres, allcandidateRPCs asservice_role. No productionfinancialdata/provider/emailused.

DBtests cover currentAuthban/rolewithdrawal,owner/read/applydenial,expiry,duplicatebankref,exacthint andversion/statuschanges,competingoperations andterminalretry. Two realconnections racingonepayment yieldonesuccess/oneconflict,onepaymentaudit/onedurablejob; retrydoesnotduplicate. FullSQL rehearsal temporarily drops only candidateobjects withintransaction, keeps6syntheticbaselinepayment/donationJSONrecords identical, checks function signatures/securitydefiner/emptysearch_path/browsergrants/RLS/servicewrite-denial. Injected item-resultaudit exception occurs afteratomicsettlement and rolls payment,audit,job anditemresult back.1000rows include100initialskips and3postpreviewchanges. All897successes createonecreditaudit/job each;900newitemresults audited;terminalreplayaddsnone. Entire large rehearsal rolls back;0syntheticpayments/operationsremain. No ledgerforgery.

UIartifacts `ui/t23-bank-match-{before,after}-{390,768,1366}.png`. Actual React components with intercepted syntheticAPI; per-itemnativeconfirmation accepted for the singlelost-responsecase, neverrealsettlement. RecoveryGETdoesnotrepeatPATCH; actorBdoesnotreadA'soperation andbothIDspersist separately. CSVdownloadsynthetic. Temporaryserversstopped;standaloneimageviewerunavailable,browser/Axeverifiedartifacts. Hostedstaffprivateexports/files/provider-sandbox/realreceiptjourneys:not-run. Localtimings arecurrentrehearsal,notbefore/afterperformanceimprovement.

## Exact migration, compatibility and rollback

`20260928110000_finance_bank_match_confirmation.sql`,unchangedLFSHA256 `e573522db17514869a39a62b090573ec458e1a5553cada3b8ef153b228cc6273`. Adds2RLSsnapshot tables,3indexes,3service-onlyRPCs and inaccessibleprivateactorhelper. Snapshots expire15minutes; eachapply recheckscurrentactor/owner,itemterminalstate,expiry,payment/donationversions,status,amount,currency,provider/hint andbank-referenceuniqueness. Reuses `reconcile_manual_payment_atomic`; financialaudit/durablejob/resultaudit sharetransaction. No automaticdelivery orbackfill.

Freshproductionreadonly:6payments/6donations/0deliveryjobs,ledger95;candidate2tables/create/applyRPCabsent. Candidateappliedonlylocalclone.59-fileinventory isnotapply-allpermission. Beforeproduction: exactper-fileapproval,backup/checksum/catalog/signature/grants/RLS/predecessorcheck; applyonlyreviewedfile andpostflight withoutsettlingrealpayments. User authorization to merge isnotfinancialconfirmation/notificationauthorization.

ExistingrestrictedCurrentUserDPAPIbackup `hkscda-before-pr135-20260929T003437Z.dpapi`,1772038bytes,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Priordecryptionroundtripchecked;fullrestorenot-run,Storagebytesabsent,providerbackupsnull/PITRfalse previouslyobserved. RecheckbeforeapprovedDDL. Rollbackdisablesbankconfirmationentrypoint andretainsadditivesnapshots/results/audits/jobs/settledfacts. Useonlycompatibility-testedapp,neverdroppartialresults/reversefinancialhistory/resetattempts. No certifiedrollbackSHAinvented.

## Operator handoff / current queue

PreviewcanonicalUTF8CSV; onlysingleexacthint+amountcandidate canbe selected. Creatingasnapshot doesnotcredit. Confirmonebankreference/payment/amount afterexplicitreview; noapplyall. OnunknownPOST/PATCHoutcome, readexistingoperation beforeanyretry. RefreshfailurekeepstheID andblocksfinancialwrites. Eachactor'sIDisindependent; logoutorroleswitch removesoldpanel. Expired/conflictingitemsneedanexplicitnewsnapshot; priorresolveditemsretainoutcome. Deliveryjobsstayqueued; paymentsuccessdoesnotbecomependingbecauseofreceipt/email.

Latestfetchedmain/lastverifiedalias24196faf027998388eff3196a6979e23566e2443,READYdpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk;mainCI36624781016fivegreen.22/46merged#134–#155;nonewmerge. #156actualOTPconcurrencyfailure stillblocksorderedrelease;disabled-featureexceptionunanswered. #172CI36649278875,#173CI36650269702,#174CI36650929275 allfivegreen. Exact#172/#173schemaapprovalrequested;#175notyetrequested atreporttime. #157approvedwaitspredecessors;#159–#162/#164–#166/#169/#170alsoapprovalpending. Payments/newschedulesdisabled,existingwebhook/reconciliationpreserved. Hostedidentity/terms/content/provider/operational gatesremainexternal.


## Live Auth actor follow-up — 2026-09-30

Application `7be2da1a9e9dba41983542a9da777c7449afcecd` backports independently reviewed commit c5cdeed7 from PR178. Actor-specific storage alone did not guard a panel whose cached admin identity remained A while live Auth changed to B. Every bank request now checks the expected actor before selecting a bearer token and after parsing the response. A live Auth hook gates the panel immediately and cancels stale verified-identity queries even with an empty cache; separate actor/event generations preserve reset across same-actor token refresh. Real QueryClient held-response regressions first failed in178, then passed. Server roles and same-transaction financial audit remain authoritative.

Fresh commands on this backport: `npm.cmd run typecheck` exit0; `npm.cmd run lint` exit0,52warnings; `bun test --isolate --timeout 30000` with checkoutDB57322 and localAuth52321:3134pass/145skip/0fail/9896assertions/580files/49.54s,exit0; `npm.cmd run build` with synthetic loopback54329,exit0. `BANK_MATCH_CAPTURE_PREFIX=t23-bank-match-actor node scripts/verify-bank-match-review.mjs` with actor-aware synthetic bearer identity:12cases at390/768/1366 pass,exit0; keyboard/lostresponse/read-only retry/actor storage preserved,Axe0,overflow0,pageerrors0. Separate captures preserve original screenshots. Shared source matches the independently closed178 review;27focusedpasses/80assertions there. No new SQL or changed bank financial semantics; exact migration SHA e573522db17514869a39a62b090573ec458e1a5553cada3b8ef153b228cc6273 retained. Its exact approval was requested after the prior five green gates and remains pending. New-head CI pending push. Code-complete/local-schema-ready,notdeployed/notenabled;156block unchanged.

- [t23-bank-match-actor-after-1366.png](ui/t23-bank-match-actor-after-1366.png) — SHA256 `45480c029b744795d9e0aad08cc6a2b0ebed3975c624ab359bad66fafa8cc93e`
- [t23-bank-match-actor-after-390.png](ui/t23-bank-match-actor-after-390.png) — SHA256 `8d4babaab2193e9b7815f1b46152f5f087089ecf7bb5942755abf69648a5c5fb`
- [t23-bank-match-actor-after-768.png](ui/t23-bank-match-actor-after-768.png) — SHA256 `89bf2058841aeb458c2ecfcdcdc82b097f15755d08a6b52d6426aadfe8faefe4`
