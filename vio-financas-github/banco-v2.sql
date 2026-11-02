-- Vio 2.0: executar depois de banco.sql.
-- Migração aditiva e reexecutável; não exclui lançamentos nem metas.
-- A V1 não guardava confirmação: todos os registros anteriores permanecem
-- pendentes até uma ação explícita de revisão/confirmacão do usuário.

begin;

do $precondicoes$
begin
  if to_regclass('public.fin_transacoes') is null
     or to_regclass('public.fin_metas') is null then
    raise exception 'Prepare o banco da V1 com banco.sql antes desta migração.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'fin_transacoes'
      and policyname <> 'fin_transacoes_do_usuario'
  ) then
    raise exception 'fin_transacoes tem políticas personalizadas. Revise-as antes de migrar.';
  end if;
end;
$precondicoes$;

alter table public.fin_transacoes
  add column if not exists status text not null default 'pendente',
  add column if not exists data_efetiva date,
  add column if not exists confirmado_em timestamptz,
  add column if not exists guardado_centavos bigint not null default 0,
  add column if not exists versao integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists legado_sem_confirmacao boolean not null default true,
  add column if not exists categoria_id uuid;

-- O DEFAULT true acima identifica somente os registros já presentes na V1.
-- Registros novos nascem false; uma reexecução não remarca os antigos.
alter table public.fin_transacoes
  alter column legado_sem_confirmacao set default false;

create table if not exists public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  nome text not null
    check (char_length(btrim(nome)) between 1 and 50),
  cor text not null default '#A855F7'
    check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  constraint fin_categorias_usuario_id_key unique (user_id, id)
);

create unique index if not exists fin_categorias_usuario_nome_idx
  on public.fin_categorias(user_id, lower(btrim(nome)));

create index if not exists fin_transacoes_usuario_categoria_idx
  on public.fin_transacoes(user_id, categoria_id);

create index if not exists fin_transacoes_usuario_data_efetiva_idx
  on public.fin_transacoes(user_id, data_efetiva, id)
  where status = 'confirmado';

create index if not exists fin_transacoes_usuario_pendentes_idx
  on public.fin_transacoes(user_id, data, id)
  where status = 'pendente';

do $restricoes$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin_transacoes'::regclass
      and conname = 'fin_transacoes_status_v2_check'
  ) then
    alter table public.fin_transacoes
      add constraint fin_transacoes_status_v2_check
      check (status in ('pendente', 'confirmado'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin_transacoes'::regclass
      and conname = 'fin_transacoes_reserva_v2_check'
  ) then
    alter table public.fin_transacoes
      add constraint fin_transacoes_reserva_v2_check
      check (
        guardado_centavos between 0 and valor_centavos
        and (
          guardado_centavos = 0
          or (tipo = 'receita' and status = 'confirmado')
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin_transacoes'::regclass
      and conname = 'fin_transacoes_confirmacao_v2_check'
  ) then
    alter table public.fin_transacoes
      add constraint fin_transacoes_confirmacao_v2_check
      check (
        (
          status = 'pendente'
          and data_efetiva is null
          and confirmado_em is null
          and guardado_centavos = 0
        )
        or
        (
          status = 'confirmado'
          and data_efetiva is not null
          and confirmado_em is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin_transacoes'::regclass
      and conname = 'fin_transacoes_versao_v2_check'
  ) then
    alter table public.fin_transacoes
      add constraint fin_transacoes_versao_v2_check check (versao > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin_transacoes'::regclass
      and conname = 'fin_transacoes_categoria_v2_check'
  ) then
    alter table public.fin_transacoes
      add constraint fin_transacoes_categoria_v2_check
      check (categoria_id is null or categoria = 'outros');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin_transacoes'::regclass
      and conname = 'fin_transacoes_categoria_do_usuario_fk'
  ) then
    alter table public.fin_transacoes
      add constraint fin_transacoes_categoria_do_usuario_fk
      foreign key (user_id, categoria_id)
      references public.fin_categorias(user_id, id)
      on delete no action;
  end if;
end;
$restricoes$;

-- SECURITY INVOKER mantém as permissões/RLS de quem está editando.
-- A função não consulta tabelas nem depende de objetos fora de pg_catalog.
create or replace function public.fin_normalizar_transacao_v2()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $funcao$
declare
  hoje date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'INSERT' then
    new.versao := 1;
    new.created_at := statement_timestamp();
  else
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id then
      raise exception 'A identidade e o proprietário da movimentação não podem ser alterados.'
        using errcode = '23514';
    end if;

    new.created_at := old.created_at;
    new.versao := old.versao + 1;
    new.legado_sem_confirmacao := false;
  end if;

  new.updated_at := statement_timestamp();
  new.descricao := btrim(new.descricao);

  if new.status = 'confirmado' then
    new.data_efetiva := coalesce(new.data_efetiva, hoje);

    if new.data_efetiva > hoje then
      raise exception 'A data do pagamento ou recebimento não pode estar no futuro.'
        using errcode = '23514';
    end if;

    if tg_op = 'UPDATE' then
      if old.status = 'confirmado' then
        new.confirmado_em := old.confirmado_em;
      else
        new.confirmado_em := statement_timestamp();
      end if;
    else
      new.confirmado_em := statement_timestamp();
    end if;

    new.legado_sem_confirmacao := false;
  elsif new.status = 'pendente' then
    new.data_efetiva := null;
    new.confirmado_em := null;
  end if;

  -- As CHECKs abaixo continuam responsáveis por rejeitar reserva em despesa
  -- ou pendente; a função não apaga silenciosamente um valor guardado.
  return new;
end;
$funcao$;

revoke all on function public.fin_normalizar_transacao_v2()
  from public, anon;
grant execute on function public.fin_normalizar_transacao_v2()
  to authenticated;

drop trigger if exists fin_transacoes_estado_v2
  on public.fin_transacoes;

create trigger fin_transacoes_estado_v2
  before insert or update on public.fin_transacoes
  for each row execute function public.fin_normalizar_transacao_v2();

-- Edição é permitida sem abrir escrita nos campos de identidade/auditoria.
revoke all on table public.fin_transacoes from public, anon;
revoke update on table public.fin_transacoes
  from public, anon, authenticated;

grant select, insert, delete on table public.fin_transacoes
  to authenticated;

grant update (
  descricao, tipo, categoria, categoria_id, valor_centavos,
  data, status, data_efetiva, guardado_centavos
) on public.fin_transacoes to authenticated;

alter table public.fin_transacoes enable row level security;
alter table public.fin_categorias enable row level security;

drop policy if exists fin_transacoes_do_usuario
  on public.fin_transacoes;

create policy fin_transacoes_do_usuario
  on public.fin_transacoes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $politicas$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'fin_categorias'
      and policyname <> 'fin_categorias_do_usuario'
  ) then
    raise exception 'fin_categorias tem políticas personalizadas. Revise-as antes de migrar.';
  end if;
end;
$politicas$;

revoke all on table public.fin_categorias
  from public, anon, authenticated;

grant select, insert, delete on table public.fin_categorias
  to authenticated;

grant update (nome, cor) on public.fin_categorias
  to authenticated;

drop policy if exists fin_categorias_do_usuario
  on public.fin_categorias;

create policy fin_categorias_do_usuario
  on public.fin_categorias
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on column public.fin_transacoes.data
  is 'Data prevista/vencimento. Não confirma pagamento automaticamente.';
comment on column public.fin_transacoes.data_efetiva
  is 'Data declarada do pagamento/recebimento, usada nos totais confirmados.';
comment on column public.fin_transacoes.guardado_centavos
  is 'Parcela de uma receita confirmada que o usuário declarou reservada.';
comment on column public.fin_transacoes.versao
  is 'Controle otimista: filtrar UPDATE por id, user_id e versão carregada.';

notify pgrst, 'reload schema';

commit;
