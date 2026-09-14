# Performance evidence and budgets

These are local synthetic measurements, not production benchmarks. Runtime, revision, sample arrays and environment are retained in the adjacent JSON artifacts. The implementation branch subsequently incorporated upstream `33b1583`; the earlier audit comparison remains identifiable in each artifact.

## Controlled comparisons

| Measurement | Before | After | Interpretation |
|---|---:|---:|---|
| Policy settings payload, same repeatable-read snapshot | 1,710,407 bytes | 649,002 bytes | Same published version IDs, summaries replace unused historical bodies. Old tied 500-row activity boundary lacked an ID tie-breaker; complete earlier timestamps are asserted equal. |
| Policy SQL p50 / p95, 20 samples | 74.3 / 97.4 ms | 25.7 / 32.2 ms | Sequential loopback SQL, not network/browser latency. |
| Calendar/workspace projection on identical 122-row fixture | 122 rows / 40,261 bytes | 25 rows / 11,759 bytes | Bounded summary page; selected roster/history loaded separately. |
| Calendar/workspace SQL p50 / p95, 7 samples after 2 warmups | 49.6 / 132.6 ms | 66.0 / 153.0 ms | Payload reduction; this run does **not** show a SQL latency improvement. |
| Animal list on identical 1,001-row fixture | 1,000 full rows / 5,833,001 bytes | 20 summaries / 11,835 bytes, total 1,001 | Fixes lost late records and bounds list payload. Reconstructed old query, no historical wall-clock claim. |

The policy projection completed in 27.5 ms while another connection held the global mutation lock (1,000 ms statement timeout). It is a STABLE, service-only snapshot read with verified administrator authorization. This does not prove historical timeouts were caused by lock contention. Existing authoritative booking/reschedule/bulk locks remain; writes revalidate current policy, qualification, terms and shared quotas.

## Browser and HTTP observations

`reliability-browser.json` verifies no legacy reconciliation request before expansion, one after expansion, and one source-resolution request for five rapid keystrokes. Previous results remain visible; inheritance-copy controls stay disabled until the current resolution returns.

Member evidence records two initial HTTP reads. The source change reduces initial internal data calls from six to four and the fully pinned periodic refresh to two. The ordinary refresh interval changes from 30 to 300 seconds, with focus, mutation and policy transition refresh retained. Personalized results remain scoped to the signed-in user; authoritative writes never rely on cached availability.

`performance-before.json` and `performance-after.json` are exploratory HTTP observations: 20 sequential and 20 concurrency-four samples per healthy endpoint, with the first observation separate. They were taken while acceptance fixtures grew and development/build/browser work ran. Dataset counts and drift are recorded. **Do not compute a production speedup from these two files.** The initial public URL was wrong and returned 404; it is an invalid public baseline, not a product failure. The later observation uses `/api/volunteer/policy`.

Bulk preview and apply timings are reported separately in the bulk evidence. Browser list/filter readiness is separate from SQL timings. No hosting/database region change or speculative index package was made. The policy query plan is retained in `policy-read-performance.json`.

## Regression budgets

For the recorded synthetic fixtures, use these review budgets: policy summary under 800 KB and SQL p95 under 150 ms; bounded 25-row calendar projection under 25 KB and SQL p95 under 250 ms; animal 20-row summary under 25 KB with the exact late-page record reachable. These observed controlled runs meet those budgets. They are fixture-specific and must be re-baselined if data shape changes.

Treat a failed HTTP request as a reliability failure independently of latency. Development HTTP p95 above 1,000 ms warrants an idle-server rerun before attribution; the exploratory policy HTTP observation exceeded this budget during simultaneous work, so it is not marked as a passing production latency gate. Existing repository Lighthouse budgets remain unchanged; this task makes no new deployed Core Web Vitals claim.

Actual local image publication measured three tiny synthetic PNGs: 204 public object bytes, three download plus three upload operations (408 object-payload bytes), 222 ms API time. This tests the publication path, not realistic image performance; it does not justify changing upload concurrency. Private media still referenced by a saved draft are retained to allow reopening and republishing. A future garbage-collection policy must check references before deletion.

Browser error claims apply only to the recorded journeys. An earlier full brand run had one development navigation abort during active edits; final gate results are in `verification.md`. No root cause is claimed for the audit's historical React error #418.

The final five browser readiness samples for 188 matching workspace sessions measured list-ready p50 1,439.79 ms / p95 1,468.03 ms and filter-ready p50 238.10 ms / p95 357.74 ms. These are local browser observations, separate from the controlled SQL comparison; the raw samples are in the bulk evidence.
