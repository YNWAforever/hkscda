-- Release candidate only. No production execution has occurred.
-- Execute as one statement inside the approved release transaction.
-- Set hkscda.release_actor to the verified operator UUID before execution.
-- Every exact ID/slug/title/version/revision must still match the read-only manifest.
do $archive$
declare expected record; actual public.content_item%rowtype; actor uuid:=nullif(current_setting('hkscda.release_actor',true),'')::uuid;
begin
 if actor is null then raise exception 'Explicit release actor required'; end if;
 perform private.require_content_actor(actor);
 -- Lock and validate all seven before the first archive.
 for expected in select * from (values
('70000000-0000-4000-8000-000000000001'::uuid,'demo-siu-bak-recovery','【示範】小白康復中',0,'2b7fa327-6252-4a55-96c1-0d901b1bed51'::uuid),
('70000000-0000-4000-8000-000000000002'::uuid,'demo-lucky-ready-for-adoption','【示範】Lucky 準備尋家',0,'c3e7b846-f79d-4fd5-b7cf-4a3180999a93'::uuid),
('70000000-0000-4000-8000-000000000003'::uuid,'demo-orange-sponsor-needed','【示範】阿橘需要助養',0,'47d7360d-5a8c-4842-95a6-4913536aff87'::uuid),
('70000000-0000-4000-8000-000000000004'::uuid,'demo-summer-adoption-day','【示範】夏日領養日',0,'9f363805-9ecd-475d-a658-1b17889599eb'::uuid),
('70000000-0000-4000-8000-000000000005'::uuid,'demo-charity-market-july','【示範】七月慈善市集',0,'247b184f-5d81-4a50-b177-b784b021e99a'::uuid),
('70000000-0000-4000-8000-000000000006'::uuid,'demo-rescue-report-june','【示範】六月救援報告',0,'46e76700-2fe8-42d2-8884-c0fe9b38e09e'::uuid),
('70000000-0000-4000-8000-000000000007'::uuid,'demo-dodo-adopter-update','【示範】豆豆新生活更新',0,'bcaf3ef0-df86-479f-8434-d21faf7f0709'::uuid)
 ) x(id,slug,title,version,revision) order by id loop
  select * into actual from public.content_item where id=expected.id for update;
  if not found or (actual.slug,actual.title,actual.version,actual.published_revision_id,actual.status) is distinct from (expected.slug,expected.title,expected.version,expected.revision,'published'::text) then raise exception 'Content manifest changed: %',expected.id; end if;
 end loop;
 for expected in select * from (values
('70000000-0000-4000-8000-000000000001'::uuid,'demo-siu-bak-recovery','【示範】小白康復中',0,'2b7fa327-6252-4a55-96c1-0d901b1bed51'::uuid),
('70000000-0000-4000-8000-000000000002'::uuid,'demo-lucky-ready-for-adoption','【示範】Lucky 準備尋家',0,'c3e7b846-f79d-4fd5-b7cf-4a3180999a93'::uuid),
('70000000-0000-4000-8000-000000000003'::uuid,'demo-orange-sponsor-needed','【示範】阿橘需要助養',0,'47d7360d-5a8c-4842-95a6-4913536aff87'::uuid),
('70000000-0000-4000-8000-000000000004'::uuid,'demo-summer-adoption-day','【示範】夏日領養日',0,'9f363805-9ecd-475d-a658-1b17889599eb'::uuid),
('70000000-0000-4000-8000-000000000005'::uuid,'demo-charity-market-july','【示範】七月慈善市集',0,'247b184f-5d81-4a50-b177-b784b021e99a'::uuid),
('70000000-0000-4000-8000-000000000006'::uuid,'demo-rescue-report-june','【示範】六月救援報告',0,'46e76700-2fe8-42d2-8884-c0fe9b38e09e'::uuid),
('70000000-0000-4000-8000-000000000007'::uuid,'demo-dodo-adopter-update','【示範】豆豆新生活更新',0,'bcaf3ef0-df86-479f-8434-d21faf7f0709'::uuid)
 ) x(id,slug,title,version,revision) order by id loop
  perform public.mutate_content_revision_with_audit(actor,expected.id,expected.version,'archive','{}'::jsonb);
 end loop;
end
$archive$;
