-- Correct only the exact obsolete service slogan; unrelated 24-hour copy is out of scope.
update public.content_item
set
  body = replace(
    body,
    '?亙???????',
    '?祆?隞仿?蝝撘脰??舀???拇???銝阡? 24 撠??嗅潦'
  ),
  updated_at = now()
where body like '%?亙???????%';

-- Read-only audit: this must return no remaining rows after the correction.
select id, slug, title
from public.content_item
where body::text like '%?亙???????%';