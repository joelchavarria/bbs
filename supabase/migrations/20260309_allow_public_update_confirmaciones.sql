-- Required for upsert(onConflict: grupo_key): conflict path performs UPDATE
alter table if exists public.confirmaciones enable row level security;

drop policy if exists "allow public update confirmaciones"
on public.confirmaciones;

create policy "allow public update confirmaciones"
on public.confirmaciones
for update
to anon, authenticated
using (true)
with check (true);

grant update on table public.confirmaciones to anon, authenticated;
