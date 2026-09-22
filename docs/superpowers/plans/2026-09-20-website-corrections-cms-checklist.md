# Website corrections CMS publication checklist

Status: prepared for review, not published. The local fixture previews these values; it is not evidence that production content has changed. Live row IDs and present values have not been queried.

## Fee changes

Use the existing Adoption Information CMS fee records. Match species and existing item name, confirm the exact record, then preserve its ID, sort order and all unlisted fields. Stop for review if a matching row is missing or ambiguous. Do not insert duplicate rows.

| Species and existing item | New itemName                                                                                                             | New priceHkd               | isPublished |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ----------- |
| Dog — Mongrel 唐狗        | 唐狗領養（全包，無額外費用） / Mongrel adoption (all inclusive, no extra fees)                                           | 500                        | true        |
| Dog — 5-in-1 Vaccine      | 五合一疫苗（每劑；唐狗全包領養不另收費） / 5-in-1 vaccine (per dose; no extra charge for all-inclusive mongrel adoption) | 250                        | true        |
| Cat — 4-in-1 Vaccine      | 三合一疫苗（每劑） / 3-in-1 vaccine (per dose)                                                                           | 250                        | true        |
| Cat — Bath                | Preserve existing itemName                                                                                               | Preserve existing priceHkd | false       |

The mongrel row and dog vaccine wording must be reviewed and published together. Other breed fees, injections, neutering and cage fees stay unchanged. Unpublish the bath record; do not delete it. Existing CMS payload fields suffice; no schema migration or hardcoded public fee override is required.

## Publication and rollback

- [ ] Obtain separate approval for the target environment and production content publication.
- [ ] Record exact IDs, old values and publication status for the four rows before changing them.
- [ ] Review the four proposed changes and save through the authenticated CMS, retaining its audit trail.
- [ ] Verify the public fee page in both language views, desktop and mobile: HK$500 all inclusive, HK$250 per dose, cat 3-in-1, no Bath row, unrelated rows unchanged.
- [ ] Confirm stale cached content has refreshed and the long vaccine explanation wraps legibly.
- [ ] If rollback is needed, restore the recorded values and publication states through the same CMS and verify again.

## Other content

The code adds donation@hkscda.com only to the donation page, sets the English organisation name to HK SAVING CAT AND DOG ASSOCIATION LIMITED, and adds staff totals 1 / 1 / 4 / 4 / 2 separately from board membership. It retires public CCCP entry points while retaining legacy stored CMS content. Review the TNR-only About section and TNR return-stage wording with existing CMS content before release.

## Deferred inputs

Sponsorship terms document; approved TNR photos; rescue/TNR counting rules and exact historical adoption baseline/cutoff; social-media presentation; wedding upload versus online-form choice.
