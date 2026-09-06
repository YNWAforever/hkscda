-- Operator-only session functions. No RPC or permanent privilege is installed.
-- Records contain exact before/after images captured after the profile migration.
CREATE OR REPLACE FUNCTION pg_temp.patch_animal_profiles(records jsonb, batch uuid, rollback boolean DEFAULT false, force_failure boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE item jsonb; current_row public.animals%ROWTYPE; expected jsonb; desired jsonb; total integer:=0;
BEGIN
 LOCK TABLE public.animals IN SHARE ROW EXCLUSIVE MODE;
 IF jsonb_typeof(records) IS DISTINCT FROM 'array' OR jsonb_array_length(records)<>248 THEN RAISE EXCEPTION 'Expected 248 profile records'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(records))<>248 THEN RAISE EXCEPTION 'Duplicate profile identity'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  expected:=CASE WHEN rollback THEN item->'after' ELSE item->'before' END;
  desired:=CASE WHEN rollback THEN item->'before' ELSE item->'after' END;
  IF expected->>'id' IS DISTINCT FROM item->>'id' OR desired->>'id' IS DISTINCT FROM item->>'id'
   OR (expected-'public_profile'-'updated_at') IS DISTINCT FROM (desired-'public_profile'-'updated_at')
   OR expected->>'retired_at' IS NOT NULL OR expected->>'status' IS DISTINCT FROM 'available'
   OR NOT (coalesce((expected->>'adoption_eligible')::boolean,false) OR coalesce((expected->>'sponsorship_eligible')::boolean,false))
   OR desired->>'updated_at' IS NULL OR NOT (desired ? 'public_profile') THEN RAISE EXCEPTION 'Invalid profile change'; END IF;
  SELECT * INTO current_row FROM public.animals WHERE id=(item->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile animal missing'; END IF;
  IF to_jsonb(current_row)=desired THEN CONTINUE; END IF;
  IF to_jsonb(current_row)<>expected THEN RAISE EXCEPTION 'Animal changed; review required'; END IF;
  UPDATE public.animals SET public_profile=desired->'public_profile',updated_at=(desired->>'updated_at')::timestamptz WHERE id=current_row.id;
  INSERT INTO public.audit_log(action,entity,entity_id,detail)
   VALUES(CASE WHEN rollback THEN 'legacy_profile_rollback' ELSE 'legacy_profile_publish' END,'animals',current_row.id::text,jsonb_build_object('batch_id',batch));
  total:=total+1;
 END LOOP;
 IF force_failure THEN RAISE EXCEPTION 'Forced profile failure'; END IF;
 RETURN total;
END;
$$;
