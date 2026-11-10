-- =====================================================================
-- Hub de TI (aplicada em 2026-11-10)
-- Painel único (ti.grupozerbini.com.br) que resume Helpdesk, Gestão de Ativos e
-- Solicitações de Compra. Tudo no mesmo projeto Supabase.
-- hub_resumo() é SECURITY INVOKER: cada contagem passa pelas regras (RLS) de quem
-- está logado, então o hub nunca mostra nada que a pessoa não veria nos sistemas.
-- O acesso ao hub em si é restrito à lista hub_acesso.
-- =====================================================================
create table if not exists public.hub_acesso (
  email text primary key check (email = lower(email)),
  criado_em timestamptz not null default now()
);
alter table public.hub_acesso enable row level security;   -- sem políticas: só funções do banco leem
revoke all on public.hub_acesso from anon, authenticated;

create or replace function public.hub_pode() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hub_acesso where email = lower(coalesce(auth.jwt()->>'email','')))
$$;
revoke execute on function public.hub_pode() from public, anon;
grant execute on function public.hub_pode() to authenticated;

create or replace function public.hub_resumo() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_eu text := lower(coalesce(auth.jwt()->>'email','')); v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb := '{}';
begin
  if not public.hub_pode() then raise exception 'Sem acesso ao Hub de TI'; end if;

  -- Helpdesk -----------------------------------------------------------
  r := r || jsonb_build_object('helpdesk', (
    with c as (select * from hd_chamados where status not in ('resolvido','cancelado'))
    select jsonb_build_object(
      'abertos', (select count(*) from c),
      'novos', (select count(*) from c where status = 'novo'),
      'nao_lidos', (select count(*) from c where not lido_agente),
      'sla_vencido', (select count(*) from c where prazo_sla < now() and status not in ('em_espera','pausado') and coalesce(aprovacao,'') <> 'pendente'),
      'sla_hoje', (select count(*) from c where prazo_sla >= now() and (prazo_sla at time zone 'America/Sao_Paulo')::date = v_hoje and status not in ('em_espera','pausado')),
      'aguardando', (select count(*) from c where status in ('em_espera','pausado')),
      'aprovacao', (select count(*) from c where aprovacao = 'pendente'),
      'meus', (select count(*) from c where atribuido_email = v_eu),
      'resolvidos_7d', (select count(*) from hd_chamados where status = 'resolvido' and resolvido_em > now() - interval '7 days'),
      'abertos_7d', (select count(*) from hd_chamados where criado_em > now() - interval '7 days'),
      'lista', coalesce((select jsonb_agg(x) from (
          select id, titulo, coalesce(nullif(solicitante_nome,''), solicitante_email) solicitante, setor, status, prioridade,
                 prazo_sla, lido_agente, atribuido_email, aprovacao, criado_em
            from c
           order by (prazo_sla < now() and status not in ('em_espera','pausado')) desc, (not lido_agente) desc,
                    case prioridade when 'urgente' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
                    prazo_sla nulls last, id
           limit 8) x), '[]'),
      'serie', coalesce((select jsonb_agg(jsonb_build_object('dia', d, 'abertos', a, 'resolvidos', s) order by d) from (
          select g::date d,
            (select count(*) from hd_chamados where (criado_em at time zone 'America/Sao_Paulo')::date = g::date) a,
            (select count(*) from hd_chamados where status = 'resolvido' and (resolvido_em at time zone 'America/Sao_Paulo')::date = g::date) s
          from generate_series(v_hoje - 13, v_hoje, interval '1 day') g) y), '[]')
    )));

  -- Minhas tarefas (Helpdesk → Hoje) ----------------------------------------
  r := r || jsonb_build_object('tarefas', (
    with t as (select * from hd_tarefas where not feita and responsavel_email = v_eu)
    select jsonb_build_object(
      'atrasadas', (select count(*) from t where prazo < v_hoje),
      'hoje', (select count(*) from t where prazo = v_hoje),
      'lista', coalesce((select jsonb_agg(x) from (
          select id, chamado_id, texto, prazo, prazo_hora, prioridade from t
           where prazo is null or prazo <= v_hoje + 7
           order by prazo nulls last, prazo_hora nulls last, id limit 8) x), '[]'))));

  -- Gestão de Ativos ----------------------------------------------------
  r := r || jsonb_build_object('ativos', jsonb_build_object(
    'total', (select count(*) from ativos where status <> 'Descartado'),
    'por_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from ativos group by status) s), '{}'),
    'compras_aprovar', (select count(*) from onboarding_compras where excluido_em is null and status in ('solicitada','enviada')),
    'compras_andamento', (select count(*) from onboarding_compras where excluido_em is null and status in ('aprovada','comprada')),
    'onboardings', (select count(*) from onboardings where excluido_em is null and status not in ('entregue','concluido','cancelado')),
    'onb_lista', coalesce((select jsonb_agg(x) from (
        select numero, nome, departamento, status, data_admissao from onboardings
         where excluido_em is null and status not in ('entregue','concluido','cancelado')
         order by data_admissao nulls last, numero limit 5) x), '[]'),
    'compras_lista', coalesce((select jsonb_agg(x) from (
        select id, item, quantidade, status, origem, valor_unit, criado_em from onboarding_compras
         where excluido_em is null and status in ('solicitada','enviada','aprovada','comprada')
         order by case when status in ('solicitada','enviada') then 0 else 1 end, criado_em limit 6) x), '[]'),
    'vencimentos', coalesce((select jsonb_agg(x order by x.data) from (
        select a.dispositivo, a.tipo, k.campo, (a.specs->>k.campo)::date data
          from ativos a cross join (values ('garantia_ate'),('licenca_ate'),('troca_bateria')) k(campo)
         where a.status <> 'Descartado' and coalesce(a.specs->>k.campo,'') ~ '^\d{4}-\d{2}-\d{2}$'
           and (a.specs->>k.campo)::date between v_hoje - 30 and v_hoje + 60
         order by 4 limit 10) x), '[]'),
    'estoque_baixo', coalesce((select jsonb_agg(x) from (
        select m.tipo_ativo, coalesce(m.subtipo,'') subtipo, m.minimo,
               (select count(*) from ativos a where a.tipo = m.tipo_ativo and a.status = 'Disponível'
                  and (coalesce(m.subtipo,'') = '' or lower(coalesce(a.specs->>'subtipo','')) = lower(m.subtipo))) disponiveis
          from estoque_minimos m where m.minimo > 0) x where x.disponiveis < x.minimo), '[]')
  ));

  -- Solicitações de Compra ----------------------------------------------
  r := r || jsonb_build_object('compras', jsonb_build_object(
    'aprovar', (select count(*) from fc_solicitacoes where status = 'aguardando_aprovacao'),
    'para_comprar', (select count(*) from fc_solicitacoes where status = 'aprovada' and quem_compra = 'financeiro'),
    'aguardando_comprovante', (select count(*) from fc_solicitacoes where (status = 'aprovada' and quem_compra = 'solicitante') or status = 'comprada'),
    'conferir', (select count(*) from fc_solicitacoes where status = 'comprovante_enviado'),
    'assinaturas', (select count(*) from fc_solicitacoes where recorrencia in ('mensal','anual') and status = 'finalizada' and assinatura_encerrada_em is null),
    'valor_aberto', (select coalesce(sum(valor_estimado),0) from fc_solicitacoes where status in ('aguardando_aprovacao','aprovada','comprada')),
    'lista', coalesce((select jsonb_agg(x) from (
        select id, titulo, coalesce(nullif(solicitante_nome,''), solicitante_email) solicitante, setor, status, urgente, valor_estimado, necessario_ate, criado_em
          from fc_solicitacoes where status in ('aguardando_aprovacao','aprovada','comprada','comprovante_enviado')
         order by urgente desc, case status when 'aguardando_aprovacao' then 0 when 'comprovante_enviado' then 1 else 2 end, necessario_ate nulls last, id
         limit 6) x), '[]')
  ));

  return r || jsonb_build_object('gerado_em', now(), 'eu', v_eu,
    'nome', coalesce((select nullif(nome,'') from usuarios where lower(login) = split_part(v_eu,'@',1) limit 1), ''));
end $$;
revoke execute on function public.hub_resumo() from public, anon;
grant execute on function public.hub_resumo() to authenticated;
