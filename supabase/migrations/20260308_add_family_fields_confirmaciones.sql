alter table if exists public.confirmaciones
  add column if not exists cupo_familia integer,
  add column if not exists miembros_familia text;
