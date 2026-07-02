-- Manual proof entry allows an optional file upload per the approved design
-- spec ("Manual proof entry is in scope"): staff can record a payment with
-- method/reference/amount/date, with an optional file upload. Today the
-- proof file columns are NOT NULL at the database layer, which blocks staff
-- from recording a payment verified some other way (e.g. checked the bank
-- system directly) without also attaching a file.
--
-- Relax storage_path/file_name to nullable and widen the file_type/file_size
-- check constraints to allow null. payment_method/reference/amount_cents/
-- payment_date/review_status/source are untouched and remain required — a
-- recorded payment must always have real payment details even without a
-- file.

alter table public.sponsorship_payment_proof
  alter column storage_path drop not null,
  alter column file_name drop not null;

alter table public.sponsorship_payment_proof
  drop constraint if exists sponsorship_payment_proof_file_type_check;

alter table public.sponsorship_payment_proof
  add constraint sponsorship_payment_proof_file_type_check
  check (file_type is null or file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));

alter table public.sponsorship_payment_proof
  drop constraint if exists sponsorship_payment_proof_file_size_check;

alter table public.sponsorship_payment_proof
  add constraint sponsorship_payment_proof_file_size_check
  check (file_size is null or (file_size > 0 and file_size <= 8388608));
