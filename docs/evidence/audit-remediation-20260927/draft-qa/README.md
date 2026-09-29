# Synthetic mobile draft browser evidence

Environment: local built Nitro preview at `http://127.0.0.1:5183`, 390 × 844 Chromium, synthetic shortlist IDs/names, no form submission, file upload, provider request, real applicant, or production write. Run `node scripts/verify-draft-mobile.mjs` after starting a loopback preview. The script refuses non-loopback targets. Exit 0.

| Page        | Initial                                                              | Restored                                                                                                             |
| ----------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Sponsorship | `sponsor-before-mobile.png`: saving unchecked and local draft absent | `sponsor-restored-mobile.png`: explicit resume restores synthetic name and saving checked                            |
| Adoption    | `adoption-before-mobile.png`: saving unchecked at step 1/7           | `adoption-restored-photo-mobile.png`: keyboard opt-in, synthetic v2 draft, explicit resume returns to photo step 6/7 |

The script checked v2 envelopes, omitted terms/photos/status tokens, reloaded, resumed, and cleared local storage on opt-out for both forms. The global shortlist bar occupies part of the mobile viewport and still needs T24 usability review. The first Vite dev attempt timed out after 15 seconds; the built loopback preview returned 200 and completed the same synthetic journey. Browser checks did not submit the final forms, test server-side eligibility changes, send email, or exercise provider sandbox.
