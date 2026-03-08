-- Allow admin panel route to read confirmations from client-side anon key
alter table if exists public.confirmaciones enable row level security;

drop policy if exists "allow public select confirmaciones"
on public.confirmaciones;

create policy "allow public select confirmaciones"
on public.confirmaciones
for select
to anon, authenticated
using (true);

grant select on table public.confirmaciones to anon, authenticated;
