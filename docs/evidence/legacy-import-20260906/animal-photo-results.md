# Animal photo import preparation — 2026-09-06

Source folder supplied by user: `C:\Users\laich\Downloads\hkscda`. The user does not know legacy status meanings. Unknown status codes remain unchanged in private staging; this task did not assign public availability.

## Measured result

- 1,256 source images, 320,854,996 bytes (1,252 .jpeg and 4 .png filename extensions).
- Initial exact filename inventory found 1,159 metadata matches. After image validation, 1,142 were accepted as linked animal profile photos. No fuzzy, case-folded, name-based or extension-only match was assigned.
- 1,142 animal records now have a verified photo association in the PRIVATE local manifest, covering 1,142 of 5,144 staged animals. The remaining 4,002 do not have a verified profile photo from this folder.
- 1,108 distinct objects copied unchanged to Git-ignored local `backups/legacy-import-20260906/animal-photos/`; 34 further accepted links reuse identical bytes. SHA256 hashes verify the copies.
- Repeat run: zero new objects, 1,142 existing object uses verified. All stored paths use content hashes. Source files were not changed.
- 97 valid images have no matching legacy file metadata. None have an extension-only same-stem candidate. They remain unassigned and untouched in the supplied folder; their local paths/hashes are recorded privately.
- 17 images held: 7 Pillow OSError decode/read failures; 10 MPO multi-image files detected inside .jpeg filenames (nine with 3 frames and one with 2). MPO is outside the current JPEG/PNG importer contract, not evidence these ten files are corrupt. No automatic format conversion or first-frame extraction performed.
- Six accepted animal-photo file IDs also appear in adoption attachments. All six, like every other copied image, remain private. No public URL, Supabase upload, storage-policy change or production asset mutation occurred.

See [final aggregate profile](animal-photo-profile.json) and [first-pass evidence](animal-photo-first-pass.json). The private manifest is `backups/legacy-import-20260906/animal-photo-manifest.json`; a checksum-named copy is retained under `photo-manifests/` for this and future runs. Tracked reports contain aggregates only, not names, IDs, image contents or private file paths from individual records.

## Matching and integrity contract

A local filename must match exactly one legacy files.path basename and be unique in the supplied tree. Encoded paths, traversal, remote URLs, filesystem links and escaped destinations are rejected. When legacy byte size is present and nonzero it must match. The file must pass Pillow verify and full decode with size/pixel limits, and be a supported JPEG/PNG matching its extension. File IDs must be referenced by animals.profile_pic_id. Unmatched, ambiguous, unsupported and size-conflicting files are held; no associations are invented.

Original bytes and embedded metadata are preserved only in private staging. This is file integrity and relational matching, not visual confirmation of an animal's identity or approval to publish. Public release still requires privacy/content review and approved animal status handling.

## Verification

27 synthetic tests pass across staging, lookup and photo tools. Initial photo matching tests failed before implementation. Independent source review found a fixed temporary manifest path and direct-to-final object writes unsafe on redirection/interruption. Exclusive temporary writes, fsync, verified atomic hard-link publication and atomic manifest replacement now address both findings. Synthetic interruption leaves no final or temporary object; retry succeeds and another retry reuses it. Manifest symlinks are rejected and an existing old fixed temporary filename remains untouched. Reviewer rechecked helper source and found no further actionable issue in that bounded review; reviewer did not inspect real images or rerun the tests.

Photo copying is restartable per object, not one database transaction. A fatal later failure may leave already completed private objects; subsequent runs verify/reuse them. No partial final object is published by the revised writer. Manifest snapshots permit later batches without losing earlier associations.

## Remaining import gates

No animal application rows were made public. Keep unknown A/D/F/S statuses as original legacy values in restricted staging until an authoritative mapping or reviewed private target model is available. Full target identity mapping, orphan resolution, live animal-policy drift, remaining image/document batches and production rollback/approval gates remain as recorded in the earlier reports. This photo package advances local import preparation only.
