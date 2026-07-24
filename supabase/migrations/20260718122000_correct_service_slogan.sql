-- Correct only the exact obsolete service slogan; unrelated 24-hour copy is out of scope.
update public.content_item
set
  body = replace(
    body,
    '日夜堅守前線動物救援',
    '本會以預約方式進行拯救與援助服務，並非 24 小時當值。'
  ),
  updated_at = now()
where body like '%日夜堅守前線動物救援%';

-- Read-only audit: this must return no remaining rows after the correction.
select id, slug, title
from public.content_item
where body::text like '%日夜堅守前線動物救援%';
