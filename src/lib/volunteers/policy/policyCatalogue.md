# Initial volunteer policy catalogue

Source: client implementation master instruction v3, 2026-09-13, sections 4–5. These are candidate configuration data, not a record of database activation. JSON contracts use snake_case. Template identity is explicit, never inferred from event names.

| Template key | Initial values | Activation decisions outstanding |
|---|---|---|
| cat-afternoon-chores | 13:00–17:00; 5 regular/senior volunteers | None within policy; bind real applicable terms/session |
| dog-cleaning-a | 09:30–12:30; total 10; no newcomers | Group counting/window; experienced allocation; group size |
| dog-cleaning-b | 09:30–12:30; 10 total; 5 newcomers per dog-shelter day; Mon/Wed/Sun | Group window; daily counting unit; late experienced threshold, weekday handling, daily/session scope |
| cat-cleaning-a | Group 10–15; senior leader 1; assistants 8–10; newcomer maximum 5; shared total 25 | Morning times; T−7 mode; leader inclusion model; late release details |
| cat-cleaning-b | 20 total; experienced minimum/reserved 10; newcomers maximum 10; no separate experienced cap | Morning times; T−7 mode; late release details |
| cat-afternoon-visit | 15:00–16:30; visitors 20; volunteers 3; senior leader 1; assistants 1–2 | T−7 hour/calendar mode |
| cat-evening-socialisation | Mon/Wed/Fri 19:00–21:00; 8 total; trained senior duty 1; other trained volunteers maximum 7 | Opening T−7/T−48 and mode |
| adoption-dog-handler | Regular/senior AND verified experienced dog handling | Site, date/time, capacity |
| adoption-driver | Regular/senior AND valid driving licence AND verified transport experience at session date | Site, date/time, capacity |

`unresolved`, `inherit`, `value: 0`, and `unlimited` are distinct states. Saving validates structure and arithmetic; readiness independently rejects unresolved/inherited values. Each template is checked individually, so an unresolved dog draft cannot block a complete cat afternoon policy. Rollback is the parent's versioning command, not edits to these seed objects.

The old overall daily 20 is exported separately as unresolved, never installed as an active daily lock. Monthly policy preserves 10 verified attendances, 2 years, monthly minima 1/2, reminder zero-month periods 1/2, assessment day 1, no senior automatic demotion. Attendance unit, scope, trigger, senior observation period and execution time remain unresolved. Notification channels start empty and sending disabled/dry-run until real channels are configured.

Operational defaults for the initial individual slice: existing minimum age 21, all weekdays unless specified, manual approval, no waitlist, unrestricted opening and closure at session start, optional Remark. These are editable proposed defaults, not additional client-specified values. No external notification, database seeding or live activation has been performed by this catalogue work.

The schema supports hours-before and calendar-days-before windows; unknown fields/operators/scripts fail strict validation. Release actions are either a bounded reservation release with an existing pool or a quota relaxation referencing a real quota/scope. The dog B model deliberately has no experienced reservation pool. The only TypeScript arithmetic helper counts configuration seats; admission remains authoritative in the parent's atomic database command.

Daily quota release has a required publication choice: `action.daily_anchor` selects `first_session` or `last_session` in the day scope. The initial dog late-rule remains unresolved. Its experienced threshold counts confirmed people/registrations across the scoped day (the condition is an attendance count); its chosen session anchor supplies the late-window boundary. Recipient tiers and verified release credentials remain required. A shared binding stores the quota, release rules and timezone; entry through an older template cannot pick an older daily cap. A day change uses the separate whole-day preview/publish RPC with occupancy/revision/clock fingerprint, audit and idempotency; it does not silently change historical session policy versions.

Unknown group visitor identity cannot support distinct-person counting: that combination is explicitly rejected pending identity data. Attendance counting can include declared group headcounts. The daily settings page provides whole-day preview/publication with explicit scope and first/last-session choices.


Group requests capture immutable contact evidence from a verified owned enquiry. Staff preview aggregate headcount and the configured A/B pair effective on that date, recheck existing registrations through the same DB evaluator, then apply with reason and idempotency. The calendar and signup pages link to group/individual rescheduling forms. Preview fingerprints, source group cutoffs/freezes, occupancy and attendance are rechecked before mutation. The source canonical activity/registration identities remain intact with immutable operation events.

Release rules require an explicit dynamic/once choice at publication. Dynamic rules follow the current threshold. Once rules record an immutable transition per session version or whole-day revision and do not reclaim released seats when staffing later rises. Recipient tiers/credentials still apply. Evaluations and previews never record transitions; serialized mutations or jobs record them with the database clock. A new binding revision is a new administrative release decision.

Shared and shelter sources now have reviewed immutable source versions. Only explicit inheritance selections (or typed inherit values) resolve through common → shelter → template. Core preview captures the resolved snapshot, source revisions and field provenance; publication rejects changed sources and freezes the effective policy. Existing activities never reconstruct a mutable source chain. Admins can register named service sites with timezone/location and named credentials; publication rejects unknown references. New site daily quotas retain their explicit shelter-day/all-sites-day scope. The source page publishes a saved draft as a reviewed source; the template page provides per-field source and inheritance controls.
