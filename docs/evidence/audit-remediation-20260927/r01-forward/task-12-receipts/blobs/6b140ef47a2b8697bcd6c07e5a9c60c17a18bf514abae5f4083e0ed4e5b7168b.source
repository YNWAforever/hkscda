-- Explicitly public, reviewed legacy profile facts. Internal source/provenance stays private.
CREATE OR REPLACE FUNCTION private.is_valid_animal_public_profile(profile jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE field text; value jsonb; content text; max_length integer;
BEGIN
 IF jsonb_typeof(profile) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 FOR field,value IN SELECT * FROM jsonb_each(profile) LOOP
  IF field NOT IN ('code','birthday','neutered','suitability','personality','health','story','recordDate') THEN RETURN false; END IF;
  IF value='null'::jsonb THEN CONTINUE; END IF;
  IF field='neutered' THEN
   IF jsonb_typeof(value)<>'boolean' THEN RETURN false; END IF;
   CONTINUE;
  END IF;
  IF jsonb_typeof(value)<>'string' THEN RETURN false; END IF;
  content:=value#>>'{}';
  IF field IN ('birthday','recordDate') THEN
   IF content !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
   BEGIN
    PERFORM make_date(substring(content,1,4)::integer,substring(content,6,2)::integer,substring(content,9,2)::integer);
   EXCEPTION WHEN datetime_field_overflow THEN RETURN false;
   END;
  ELSIF field='suitability' THEN
   IF content NOT IN ('newbie','experienced') THEN RETURN false; END IF;
  ELSIF field='code' THEN
   IF content !~ '^[A-Za-z0-9][A-Za-z0-9 _()./-]{0,63}$' THEN RETURN false; END IF;
  ELSE
   max_length:=CASE field WHEN 'personality' THEN 1000 WHEN 'health' THEN 2000 ELSE 8000 END;
   IF length(content)>max_length OR content ~ '[<>@]' OR content ~* '(https?://|www[.])'
    OR regexp_replace(content,'[0-9]{4}-[0-9]{2}-[0-9]{2}','','g') ~ '[+0-9][0-9 ()-]{6,}[0-9]' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.is_valid_animal_public_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_valid_animal_public_profile(jsonb) TO authenticated,service_role;
ALTER TABLE public.animals ADD COLUMN public_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.animals ADD CONSTRAINT animals_public_profile_valid CHECK(private.is_valid_animal_public_profile(public_profile));
COMMENT ON COLUMN public.animals.public_profile IS 'Allowlisted public profile only. No raw legacy payloads, staff notes, contacts or private attachments.';
