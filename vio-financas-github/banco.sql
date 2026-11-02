-- Execute este arquivo no SQL Editor do seu projeto Supabase.
-- Pode ser executado novamente: os registros existentes são preservados.

begin;

create table if not exists public.fin_transacoes (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,

  descricao text not null
    check (char_length(btrim(descricao)) between 1 and 100),

  tipo text not null
    check (tipo in ('receita', 'despesa')),

  categoria text not null default 'outros'
    check (
      categoria in (
        'outros',
        'salario',
        'moradia',
        'alimentacao',
        'transporte',
        'lazer',
        'saude'
      )
    ),

  valor_centavos bigint not null
    check (valor_centavos between 1 and 99999999999),

  data date,
  origem_local text,
  created_at timestamptz not null default now(),

  unique (user_id, origem_local)
);

create table if not exists public.fin_metas (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,

  alvo_centavos bigint not null
    check (alvo_centavos between 1 and 99999999999)
);

create index if not exists fin_transacoes_usuario_idx
  on public.fin_transacoes(user_id, created_at, id);

-- Políticas permissivas se combinam com OR. Se as tabelas já tiverem
-- políticas de outra aplicação, pare antes de alterar sua configuração.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'fin_transacoes'
          and policyname <> 'fin_transacoes_do_usuario')
        or
        (tablename = 'fin_metas'
          and policyname <> 'fin_metas_do_usuario')
      )
  ) then
    raise exception
      'As tabelas fin_transacoes/fin_metas têm políticas personalizadas. Revise-as antes de executar este script.';
  end if;
end;
$$;

alter table public.fin_transacoes enable row level security;
alter table public.fin_metas enable row level security;

revoke all on table public.fin_transacoes, public.fin_metas
  from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select, insert, delete
  on table public.fin_transacoes
  to authenticated;

grant select, insert, update
  on table public.fin_metas
  to authenticated;

drop policy if exists fin_transacoes_do_usuario
  on public.fin_transacoes;

create policy fin_transacoes_do_usuario
  on public.fin_transacoes
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists fin_metas_do_usuario
  on public.fin_metas;

create policy fin_metas_do_usuario
  on public.fin_metas
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
