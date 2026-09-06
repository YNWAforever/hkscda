# COD / AlipayHK credential validation — work in progress

Provider-supplied identifiers: merchant2088831950966386, segment2470305571, walletALIPAYHK, production. Supplied2024API PDF has85pages; page81contains distinct production/sandbox notification public keys. The extracted production public key is retained here as public verification material, not as a merchant secret.

Merchant callback to register with COD: https://hkscda.vercel.app/api/webhooks/cod. Require COD AQS format and TLS1.2+. User reports COD confirmed create_order/refresh_transaction_status/order_details enabled; notifications await URL registration. Merchant public-key registration wording is not independently verified.

Vercel metadata inspection found all6CODvariables, allSensitive. COD_ENV targetsproduction only; other5targetproduction andpreview. Latest metadata timestamps are August16, so newly reshared key contents are not confirmed. Sensitive values cannot be retrieved via normal Vercel readback; no secret values were output or downloaded. Official reference: https://vercel.com/docs/environment-variables/sensitive-environment-variables.

One deliberate invalid-signature notification POST returned500/COD notification processing failed. Source validates configuration before notification processing; expected invalid signature response is400. This confirms a runtime/setup failure but does not identify the bad variable or establish provider registration. No business-data mutation or payment-provider request was made by this rejection probe.

Added allowlisted field-only error diagnostics to the existing webhook. Red:8diagnostic failures,7existing passes. Green:57passes,0failures,153assertions across configuration/cryptography/client/webhook suites. Existing signature and reconciliation safeguards unchanged. No new public diagnostic endpoint or secret export is introduced.

scripts/check-cod-config.ts is offline only: checks getCodConfig, AES encrypt/decrypt round-trip, merchant RSA signing/verification, and production notification-public-key fingerprint against the suppliedPDF. Output contains only validation status and public-key metadata; it never makes provider requests. Missing-env run correctly exits1. Typecheck passed; focused lint/result pending final record.

User says the reshared ZIP contains merchant private/public keys plusaes128/aes256. Local file path requested; actual supplied key matching/format/AES length validation pending. Do not assume aes128/aes256 encoding, concatenate them, or use merchant public key as notification key.

No credentials were changed, no deployment, method publication, provider activation or real transaction was performed. Production key validation/installation and live tests must report separate outcomes. Existing production schema drift beyond the approved CMS read repair remains a payment-write readiness gate.
Final local checks: typecheck and focused lint passed;57COD tests passed. Offline synthetic128/256-bit AES runs passed; wrong notification key rejected. Production notification SPKI SHA256 from the supplied PDF:8a26a541d788648b9fb24bec53a2cd43b9dcbd195d32c275d7be5e0196f8d6dc. Actual merchant keys still await the ZIP path.
