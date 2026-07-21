update public.content_item
set
  body = replace(body, '半歲以下仍屬幼貓', '半歲或以上為成貓'),
  updated_at = now()
where body like '%半歲以下仍屬幼貓%';

select id, slug, title
from public.content_item
where body::text like '%半歲以下仍屬幼貓%';
