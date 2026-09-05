# Actual local authenticated admin measurements

Fixture `hkscda-admin-local-v2`:1k/10k/50k supporters and content parents;3donations per supporter and3updates per content. Every scenario used1first observation plus30warm actual authenticated HTTP requests. SourceSQL/auth/Storage target was the unique disposable553xx stack; app was Vite development server55430, so these are local development measurements, not production/staging latency.

| Records | Scenario | Warm p50 ms | Warm p95 ms | Maximum local gzip bytes | Observed SQL calls | Target |
|---:|---|---:|---:|---:|---:|---|
|1000|supporter-list-first-50|98.7|151.7|1880|284|PASS|
|1000|supporter-detail|217.0|505.1|757|1041|PASS|
|1000|content-list-first-50|133.2|761.0|3990|280|MISS|
|1000|content-detail|95.5|220.5|685|342|PASS|
|1000|content-save-atomic-audit|113.5|220.3|726|409|PASS|
|10000|supporter-list-first-50|108.2|253.9|1912|280|PASS|
|10000|supporter-detail|242.0|678.0|757|1025|PASS|
|10000|content-list-first-50|114.5|198.2|4010|280|PASS|
|10000|content-detail|97.5|279.2|688|342|PASS|
|10000|content-save-atomic-audit|124.6|207.8|731|404|PASS|
|50000|supporter-list-first-50|229.6|561.5|1904|301|PASS|
|50000|supporter-detail|198.5|516.8|761|1024|PASS|
|50000|content-list-first-50|294.9|657.0|4015|280|PASS|
|50000|content-detail|113.0|226.1|693|342|PASS|
|50000|content-save-atomic-audit|121.7|363.2|732|409|PASS|

14/15 latency targets met. The1k CMS list p95 was761.0ms versus750ms;10k198.2ms and50k657.0ms do not support a scaling regression or speculative index. The original miss remains in the evidence. All list payloads were below the150KiB compressed proposal. Mutation timing includes transactional authoring/audit and response read, excludes external delivery.

`performance.json` retains all31observations per scenario and actual EXPLAIN ANALYZE/BUFFERS JSON for CRM/CMS lists at each size. Query counts are pg_stat_statements call deltas over31HTTP requests, including authentication and possible local background work; they are not an exact per-request trace. gzip is computed from decoded responses, not observed wire transfer. First observation does not claim cleared DB/server caches.

Exact-marker cleanup verified0supporters,0content parents and0admin actors after exit0. Synthetic credentials remained only in memory; no provider activation, remote data or real-message test occurred.
