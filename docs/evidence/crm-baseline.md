# CRM Wave 1 failing baseline

Commit: `20c168459a90c5c92093659a18b139a994451470`

Command:

```powershell
bun test .\docs\evidence\crm-baseline\identity-safety.test.ts .\docs\evidence\crm-baseline\email-safety.test.ts
```

Result: exit 1; 0 pass, 3 fail, 6 assertions.

The tests state the desired safety contracts and intentionally fail on the current source:

- Volunteer intake should use an existing email without replacing canonical name, phone, language, source, or deletion state. The current upsert submits all five fields and `deleted_at: null`.
- Donation intake should use an existing email without replacing canonical name, phone, language, or source. The current upsert submits all four fields.
- A resolved provider rejection should produce and persist `failed`. The current volunteer sender receives the fake rate-limit error, then returns and persists `sent`.

No database, provider, production data, or real recipient was used. The fakes record only arguments passed to the existing repository and notification boundaries. Production source was not changed.

Raw output: [raw-output.txt](./crm-baseline/raw-output.txt)
