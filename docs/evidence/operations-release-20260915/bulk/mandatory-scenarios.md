# Mandatory scenario acceptance

Environment: dedicated local PostgreSQL at 127.0.0.1:56322; synthetic verified identities, unique shelter definitions, template keys and distant future dates. No production access or provider delivery.

Test: `src/lib/volunteers/bulk/mandatoryScenarios.database.test.ts`

`mandatory capacity 10 concurrent eleventh, active role downgrade, and 104 policy-bound cross-shelter global-day quota groups`

Result: 1 passed, 0 failed, 192 assertions; 32.38 seconds.

- Capacity 10: nine approved registrations, two independent SQL connections race for the last seat; exactly one books, one receives capacity_full, and approved count remains 10.
- Changed administrator role: capture and preview as active administrator, change role to treasurer while retaining active status, then apply rejects with volunteer_forbidden and leaves the activity description unchanged.
- More than 100 policy-bound selections: generate 104 published-policy sessions across two synthetic shelters and 52 Hong Kong dates. Both policies share a global all_shelters_day distinct-person limit of 5. Four bookings span the shelters, then two independent connections race the fifth place: one succeeds and one receives daily_quota_full. Preview returns 52 explicit groups, each containing both sessions on its HK date; all groups apply. A further sixth applicant is still denied and all five approved commitments remain. All 104 activities retain their policy bindings and receive the batch edit.

No application or migration changes were necessary. The first test attempt passed capacity assertions but used the wrong Bun SQL error property for the authorization assertion; the final fixture checks the actual database exception message.
