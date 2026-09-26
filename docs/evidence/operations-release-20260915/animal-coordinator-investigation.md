# Animal coordinator deep-link investigation — 2026-09-15

Reported route: /admin/coordinator/animals?animalId=ff70d2e3-dbb4-5d76-b82b-1ef70cf12d42.

Observed deployment is main 0469cfbbb989ae0c01aa3b078dfd25692016513a. Vercel runtime records at 2026-09-14 18:49:34–18:49:37 UTC show both pipeline reads and the subsequent task read returning HTTP200. This does not prove successful client rendering.

Read-only investigations performed:
- Source trace: route search parameter -> initial-animal query -> profile dialog -> task panel.
- Isolated synthetic administrator with a populated animal list: deep-link dialog renders, no page exceptions.
- Same synthetic API data intercepted into the deployed production frontend: dialog renders, no page exceptions.
- Specified animal's data shape, reference rows and first page from the already retained local production restore: dialog renders; no route error boundary. No fresh production database access, auth-session issuance or business mutation occurred.
- The restored target has no internal profile and no linked followup tasks; the mapper supplies a default profile. Three positions and three arrival sources have the expected identifier and label types.
- The full-page fixture produced image HTTP400s because production Storage paths were deliberately redirected to the isolated local service, where those objects do not exist. These are harness artifacts, not evidence of production image failures or a cause of the reported route crash.

The native browser-control tool failed to start, so the user's failing signed-in browser and console could not be inspected. The actual client exception remains uncollected. No speculative code, migration or deployment fix was made. The next required evidence is whether a fresh reload still fails and the first browser Console exception/stack at the time of failure. Local private reproduction reports and scripts remain ignored in .local-policy-test; no record contents or private sessions are committed.
