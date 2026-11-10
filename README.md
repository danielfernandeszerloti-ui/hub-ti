# Hub de TI — Grupo Zerbini

Painel único em **ti.grupozerbini.com.br** com o que precisa de atenção nos sistemas de TI:

| Sistema | Endereço | O que o hub mostra |
| --- | --- | --- |
| Helpdesk | chamados.grupozerbini.com.br | Chamados em aberto, SLA vencido, não lidos, aguardando colaborador ou aprovação, minhas tarefas, gráfico de 14 dias |
| Gestão de Ativos | ativos.grupozerbini.com.br | Inventário por status, compras para aprovar e em andamento, onboardings, garantias/licenças a vencer, estoque abaixo do mínimo |
| Solicitações de Compra | compras.grupozerbini.com.br | Aguardando aprovação, para comprar, aguardando comprovante, comprovantes para conferir, assinaturas ativas |
| Fornecedores | fornecedores.grupozerbini.com.br | Fornecedores ativos, serviços fora do ar, incidentes em aberto e com SLA estourado, contratos vencidos ou vencendo, pagamentos pendentes, custo mensal |

A lista **Precisa de você** junta tudo, do mais urgente para o menos urgente, e cada item abre direto a tela certa no sistema de origem. Os números se atualizam sozinhos (tempo real, mais uma checagem a cada 2 minutos).

## Como funciona

- Site estático (HTML + JS, sem build) publicado pelo GitHub Pages a partir da pasta `www/`.
- Helpdesk, Gestão de Ativos e Solicitações de Compra usam o mesmo projeto Supabase e o mesmo login (código por e-mail ou senha).
- Fornecedores fica em outro projeto Supabase (`ivxclpslwrzjwrbucftg`, outra conta): o cartão pede o login do sistema de fornecedores (e-mail e senha) uma vez e guarda a sessão à parte. Os números são lidos direto das tabelas `fornecedores`, `contratos`, `incidentes` e `servicos`, com as regras de acesso daquele banco.
- Os dados vêm da função `hub_resumo()` do banco (`supabase/20261110_hub_ti.sql`):
  - é **SECURITY INVOKER**: cada contagem passa pelas regras de acesso (RLS) de quem está logado, então o hub nunca mostra algo que a pessoa não veria nos próprios sistemas;
  - só funciona para e-mails na tabela `hub_acesso` (hoje, só o Daniel). Para liberar outra pessoa:
    ```sql
    insert into public.hub_acesso(email) values ('nome.sobrenome@grupozerbini.com.br');
    ```
- A página tem Content-Security-Policy: só carrega scripts do próprio site e só conversa com o Supabase.

## Publicação

1. Repositório `hub-ti` no GitHub com este conteúdo; em **Settings → Pages → Source**, escolha **GitHub Actions** (o workflow `.github/workflows/pages.yml` publica a pasta `www/` a cada push na `main`).
2. No Registro.br, crie o registro **CNAME** `ti` apontando para `danielfernandeszerloti-ui.github.io`.
3. Em **Settings → Pages**, confirme o domínio `ti.grupozerbini.com.br` e marque **Enforce HTTPS** quando o certificado ficar pronto.

## Estrutura

```
www/index.html      página e estilos
www/app.js          login, leitura do resumo, tela
www/config.js       URL e chave pública do Supabase, endereços dos sistemas
www/vendor/         supabase-js
supabase/           migração do banco (já aplicada)
```
