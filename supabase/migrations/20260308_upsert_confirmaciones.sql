-- Make confirmations idempotent by family/individual group key
alter table if exists public.confirmaciones
  add column if not exists grupo_key text,
  add column if not exists confirmado_por text;

update public.confirmaciones
set grupo_key = lower(
  regexp_replace(
    coalesce(
      case
        when familia is null or btrim(familia) = '' or upper(btrim(familia)) = 'INVITADO INDIVIDUAL'
          then 'individual:' || coalesce(nombre, '')
        else 'familia:' || familia
      end,
      ''
    ),
    '\\s+', ' ', 'g'
  )
)
where grupo_key is null or btrim(grupo_key) = '';

-- Keep latest row per group_key
with ranked as (
  select id,
         row_number() over (
           partition by grupo_key
           order by "timestamp" desc nulls last, id desc
         ) as rn
  from public.confirmaciones
  where grupo_key is not null and btrim(grupo_key) <> ''
)
delete from public.confirmaciones c
using ranked r
where c.id = r.id
  and r.rn > 1;

-- Unique index required for upsert(onConflict: grupo_key)
create unique index if not exists confirmaciones_grupo_key_unique
  on public.confirmaciones (grupo_key);
