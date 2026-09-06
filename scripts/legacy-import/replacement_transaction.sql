-- Session-local functions for the isolated replacement rehearsal. No public RPC is installed.
CREATE OR REPLACE FUNCTION pg_temp.apply_animal_replacement(records jsonb, batch uuid, source_hash text, candidate_hash text, expected_ids uuid[], expected_fingerprint text, force_failure boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE item jsonb; old_row public.animals%ROWTYPE; saved private.animal_replacement_row%ROWTYPE; written public.animals%ROWTYPE; total integer:=0; existing private.animal_replacement_batch%ROWTYPE;
BEGIN
  LOCK TABLE public.animals IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO existing FROM private.animal_replacement_batch WHERE id=batch FOR UPDATE;
  IF FOUND THEN
    IF existing.state<>'applied' OR existing.source_sha256<>source_hash OR existing.candidate_sha256<>candidate_hash THEN RAISE EXCEPTION 'Batch identity/state mismatch'; END IF;
    FOR saved IN SELECT * FROM private.animal_replacement_row WHERE batch_id=batch LOOP
      SELECT * INTO written FROM public.animals WHERE id=saved.animal_id;
      IF NOT FOUND OR to_jsonb(written)<>saved.after_image THEN RAISE EXCEPTION 'Imported row changed; review required'; END IF;
    END LOOP;
    RETURN 0;
  END IF;
  IF (SELECT array_agg(id ORDER BY id) FROM public.animals) IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(expected_ids) AS x)
    OR (SELECT md5(string_agg(id::text||':'||type||':'||status||':'||updated_at::text,'|' ORDER BY id)) FROM public.animals) IS DISTINCT FROM expected_fingerprint THEN
    RAISE EXCEPTION 'Placeholder snapshot changed';
  END IF;
  IF records IS NULL OR jsonb_typeof(records) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid replacement array'; END IF;
  IF jsonb_array_length(records)=0 THEN RAISE EXCEPTION 'Empty replacement'; END IF;
  INSERT INTO private.animal_replacement_batch VALUES (batch,source_hash,candidate_hash,'applied',now(),now());
  FOR old_row IN SELECT * FROM public.animals WHERE id=ANY(expected_ids) LOOP
    UPDATE public.animals SET retired_at=now(),updated_at=now() WHERE id=old_row.id RETURNING * INTO written;
    INSERT INTO private.animal_replacement_row VALUES(batch,old_row.id,'retire',to_jsonb(old_row),to_jsonb(written));
    INSERT INTO public.audit_log(action,entity,entity_id,detail) VALUES('legacy_animal_retire','animals',old_row.id::text,jsonb_build_object('batch_id',batch));
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
    IF item->>'type' NOT IN ('cat','dog') OR NOT (coalesce((item->>'adoption_eligible')::boolean,false) OR coalesce((item->>'sponsorship_eligible')::boolean,false)) THEN RAISE EXCEPTION 'Invalid candidate eligibility'; END IF;
    INSERT INTO public.animals(id,type,name,gender,age,status,adoption_eligible,sponsorship_eligible,image_url,description,notes)
    VALUES((item->>'id')::uuid,item->>'type',item->>'name',item->>'gender',item->>'age','available',(item->>'adoption_eligible')::boolean,(item->>'sponsorship_eligible')::boolean,NULL,NULL,NULL)
    RETURNING * INTO written;
    INSERT INTO private.animal_replacement_row VALUES(batch,written.id,'insert',NULL,to_jsonb(written));
    INSERT INTO public.audit_log(action,entity,entity_id,detail) VALUES('legacy_animal_import','animals',written.id::text,jsonb_build_object('batch_id',batch));
    total:=total+1;
  END LOOP;
  IF force_failure THEN RAISE EXCEPTION 'Forced replacement failure'; END IF;
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.rollback_animal_replacement(batch uuid)
RETURNS integer LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE saved private.animal_replacement_row%ROWTYPE; current_row public.animals%ROWTYPE; ids uuid[]; fk record; linked boolean; total integer:=0; batch_state text;
BEGIN
  -- EXCLUSIVE also blocks FK ROW SHARE locks: no new child reference can
  -- commit between the history check and deletion (including CASCADE/SET NULL).
  -- Existing FK writers finish before this lock is acquired; plain reads continue.
  LOCK TABLE public.animals IN EXCLUSIVE MODE;
  SELECT state INTO batch_state FROM private.animal_replacement_batch WHERE id=batch FOR UPDATE;
  IF batch_state IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'Batch not applied'; END IF;
  FOR saved IN SELECT * FROM private.animal_replacement_row WHERE batch_id=batch LOOP
    SELECT * INTO current_row FROM public.animals WHERE id=saved.animal_id;
    IF NOT FOUND OR to_jsonb(current_row)<>saved.after_image THEN RAISE EXCEPTION 'Imported row changed; review required'; END IF;
  END LOOP;
  SELECT array_agg(animal_id) INTO ids FROM private.animal_replacement_row WHERE batch_id=batch AND operation='insert';
  FOR fk IN SELECT n.nspname,c.relname,a.attname,cardinality(con.conkey) AS width FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=con.conkey[1] WHERE con.contype='f' AND con.confrelid='public.animals'::regclass LOOP
    IF fk.width<>1 THEN RAISE EXCEPTION 'Unsupported composite reference'; END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=ANY($1))',fk.nspname,fk.relname,fk.attname) INTO linked USING ids;
    IF linked THEN RAISE EXCEPTION 'New linked history prevents rollback'; END IF;
  END LOOP;
  DELETE FROM public.animals WHERE id=ANY(ids);
  FOR saved IN SELECT * FROM private.animal_replacement_row WHERE batch_id=batch LOOP
    IF saved.operation='retire' THEN
      UPDATE public.animals SET retired_at=(saved.before_image->>'retired_at')::timestamptz,updated_at=(saved.before_image->>'updated_at')::timestamptz WHERE id=saved.animal_id;
    END IF;
    INSERT INTO public.audit_log(action,entity,entity_id,detail) VALUES('legacy_animal_rollback','animals',saved.animal_id::text,jsonb_build_object('batch_id',batch,'operation',saved.operation));
    total:=total+1;
  END LOOP;
  UPDATE private.animal_replacement_batch SET state='rolled_back',updated_at=now() WHERE id=batch;
  RETURN total;
END;
$$;
