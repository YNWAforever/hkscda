drop policy if exists "admin full access" on public.animals;
drop policy if exists "staff can manage animals" on public.animals;

grant select, insert, update, delete on public.animals to authenticated;

create policy "staff can manage animals"
  on public.animals for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));
