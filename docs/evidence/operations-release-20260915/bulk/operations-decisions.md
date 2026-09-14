# Unresolved operating decisions

The software preserves these as unresolved policy fields. Synthetic fixtures used for tests are explicitly labelled and do not authorize publication of operational defaults.

| Policy field | Question for HKSCDA | Consequence staff should review |
|---|---|---|
| `capacity.group_in_shared_total`, `capacity.shared_total` | Do group participants share the same total as individual volunteers? | A confirmed group may consume individual capacity; existing accepted commitments cannot be silently displaced. |
| newcomer `daily_limits[].count_mode` / scope | Does the daily cap count distinct people or attendance instances? | One person attending two sessions may count once or twice; the same rule must apply across sessions. |
| experienced tier `capacity.volunteers` / `tier_quotas` | What is the actual experienced-volunteer cap for confirmed-group days? | The earlier 5–6 example is not an approved cap. |
| `booking.group_open`, `booking.group_close`, `capacity.group_size` | When may groups request/confirm, and which size limits apply? | Enquiries and pending groups do not change the confirmed-group scenario. |
| `release_rules` threshold, scope, daily anchor and weekdays | For the T−48h release, which experienced threshold, day/session scope and weekdays apply? | Release behavior must be consistent across a day's execution groups and accepted commitments. |

Use the policy settings page linked from the activity workspace to review the actual fields and unresolved reasons. Complete the decision, save, preview and obtain the authorized policy-publication decision; session generation cannot publish an unresolved policy.
