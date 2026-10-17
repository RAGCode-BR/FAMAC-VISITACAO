# Neon — configuração e operação

Projeto FAMAC `morning-river-28975560`, organização `org-fancy-queen-60178958`, branch `production`, região `aws-us-east-1`. Frontend: GitHub Pages. Backend: Function `famacapi`. Arquivos: bucket privado `famac-visitas`.

## Acesso

O usuário informa **PIN de um número e senha**, sem caixa de e-mail: 0 para o administrador, 1 para Claudionor, 2 para Charles e 3 para Celso. O PIN é convertido em um identificador técnico reservado pelo `src/lib/identity.mjs` para usar o Neon Auth gerenciado. Esse identificador permanece estável para preservar as contas e senhas existentes; não envia mensagens nem aparece no formulário. Não há cadastro público; os usuários são criados pela administração. O PIN não substitui a senha. O formato de um dígito comporta no máximo dez identificadores distintos.

- Colaborador: somente obras, visitas, programação, fotos e contatos de responsáveis com sua autoria. Arquitetos e empreiteiros são compartilhados, disponíveis para consulta, seleção, edição e exclusão por toda a equipe. A autoria original é preservada; contatos importados sem colaborador atribuído usam `owner_id='shared'`.
- Administrador: consulta toda a equipe. O seletor no topo define o colaborador para novos cadastros; os relatórios continuam consolidando todos os registros autorizados.
- **Alterar senha**: disponível ao usuário autenticado.
- **Colaboradores → Acessos ao sistema**: administração pode redefinir senhas. Recuperação não depende de e-mail.

Os acessos iniciais são gerados em `famac-acessos.local`, arquivo ignorado pelo Git. Distribua cada acesso ao respectivo usuário e altere as senhas iniciais pelo sistema. O repositório e os logs não contêm senhas. Os cadastros operacionais da produção iniciam vazios.

## Ambiente e deploy

```powershell
neon login
neon link -y --org-id org-fancy-queen-60178958 --project-id morning-river-28975560 --branch production --no-env-pull
neon config plan
neon deploy
npm run neon:client-env
npm run db:migrate
npm run dev
```

`neon.ts` declara os serviços. As migrações versionadas em `server/migrations/` são aplicadas por `scripts/migrate.mjs` com uma conexão direta e transação. Operações comuns usam `pg` com pool pequeno e conexão pooled dentro da Function.

`.env.local` recebe variáveis secretas `DATABASE_URL`, `AWS_*` e metadados do Neon. **Essas variáveis nunca recebem prefixo `VITE_`.** `scripts/neon-client-env.mjs` cria somente os aliases públicos `VITE_NEON_AUTH_URL`, `VITE_FAMAC_API_URL` e `VITE_FAMAC_MODE=cloud`.

O GitHub Actions usa as duas URLs públicas nas variáveis do repositório. A publicação do frontend não requer senha de banco, chave de bucket ou token de administração. `npm run build` também verifica se credenciais locais foram incluídas nos arquivos públicos.

O comando inicial `neon init --agent codex` instala o plugin Neon com a configuração MCP no escopo do usuário. O CLI autenticado é o caminho de operação usado neste projeto. O plugin/MCP pode exigir nova sessão no Codex para ficar disponível.

## Banco e fotos

### CRM compartilhado

As tabelas `crm_opportunities`, `crm_activities`, `crm_sales` e `crm_visit_links` guardam oportunidades, auditoria, fechamentos e vínculos com visitas. São acessíveis somente pela API autenticada. `/state` devolve o resumo comercial compartilhado; alterações nesse trecho via `PUT /state` são recusadas. `POST /crm/:id/actions` valida a versão do cartão, a ação, o vendedor e as datas sob a mesma trava de revisão dos demais salvamentos. A identidade e o horário do histórico vêm do servidor. Repetir o mesmo identificador de operação não duplica ações nem vendas.

Uma oportunidade é localizada pelo vínculo existente ou pelo endereço normalizado, com número/complemento; sem número, o nome também participa. Não há comparação aproximada de endereços. Ao continuar uma visita pelo CRM, o colaborador reutiliza uma obra própria ou cria uma cópia privada vinculada à mesma oportunidade, preservando a obra e as visitas do prospector. Apenas o resumo comercial e as ações do CRM são compartilhados, sem copiar fotos ou notas privadas.

As etapas são Prospecção, Aguardando retorno, Em negociação, Venda realizada e Sem negócio. Produtos vendidos parcialmente saem dos pendentes; a última venda conclui a oportunidade. Encerramentos sem negócio, encerramento dos produtos restantes e reaberturas exigem motivo. Reabrir inicia outra negociação e preserva os fechamentos anteriores. As próximas ações com data aparecem na Programação do responsável atual; uma visita realizada a partir da data prevista resolve o retorno anterior.

A visualização Em andamento mostra cartões ativos e resumos das etapas finais. Encerradas reúne vendas realizadas e negócios encerrados em uma lista com busca, filtros por responsável/resultado e paginação de 12 registros após filtrar toda a coleção. Reaberturas saem automaticamente dessa lista. No histórico decrescente, venda e visita do mesmo salvamento aparecem com a venda acima; a sequência persistida e vendas lançadas antes de uma visita vinculada permanecem intactas.

`crm_sales.source_visit_id` é único. Vendas lançadas em visitas são integradas atomicamente; vendas lançadas no CRM podem ser vinculadas a uma visita do mesmo vendedor, mantendo seus produtos e valor, sem gerar outro fechamento. Datas da venda e da visita podem diferir. O consolidado financeiro inclui vendas do CRM e visitas sem CRM, removendo duplicidades; métricas de presença e de visitas continuam baseadas em visitas físicas. Colaboradores consultam seus próprios fechamentos nos relatórios; o quadro comercial é compartilhado.

A migração `005-crm.sql` é aditiva. `scripts/migrate.mjs` concilia visitas antigas ainda não vinculadas, em ordem cronológica e de forma idempotente, sem reescrever seu histórico. Executar novamente após o deploy cobre visitas salvas pela versão anterior durante a publicação. O quadro usa atualização automática existente, sem habilitar outro serviço.

O schema `famac` contém membros, obras, contatos, visitas, programação, referências de fotos, revisão e operações. Dados são salvos por registro, com autoria no servidor. A API verifica JWT do Neon Auth e o vínculo fixo da conta antes de consultar ou alterar dados. A interface não acessa Postgres nem S3 com credenciais próprias.

`famac.products` armazena produtos adicionais e alterações dos 14 produtos iniciais, que possuem IDs estáveis no domínio. Criar, editar e excluir produtos exige administrador no servidor. Os produtos ativos são compartilhados, têm nomes únicos normalizados e podem ser oferecidos/vendidos nas visitas e usados nos relatórios. Renomeações afetam usos futuros; visitas e relatórios preservam os nomes registrados na época. Clientes antigos que omitam a coleção `products` em um salvamento preservam o catálogo remoto.

Contatos e produtos usam exclusão lógica (`deleted: true`), com confirmação na interface. Saem das listas de cadastro e das opções para novos vínculos, mas permanecem nos vínculos existentes e filtros históricos. Um contato excluído que já pertence a uma obra pode continuar no registro de novas visitas dessa obra; não pode ser vinculado a outra obra. Cadastros excluídos não podem ser alterados ou reativados por um formulário antigo. Remoções físicas e alterações de visitas continuam bloqueadas pela API. A exclusão de contatos segue as mesmas permissões da edição.

O salvamento de obra, visita e retorno é transacional. Uma revisão evita sobrescrever alterações de outro dispositivo; em conflito, o app atualiza a base, preserva os campos em preenchimento e pede uma nova tentativa. Operações têm identificação para confirmar commits cuja resposta se perdeu.

A atualização automática consulta `/state?since=<revisão>` a cada 30 segundos quando a aba está visível, ao voltar à janela e ao recuperar a conexão. Sem mudanças, a API retorna 204 e não transmite toda a base. Não há consulta contínua com a aba oculta; respostas anteriores a um salvamento são descartadas. Rascunhos de visita são preservados e a atualização pausa enquanto há um modal aberto para evitar sobrescrever edições de contato. Não utiliza o serviço Neon Realtime.

## Importação de arquitetos

`scripts/read-architects.ps1 -Path '<planilha.xlsx>'` extrai nome, contato e cidade; o cargo é usado somente na triagem. Saída em `test-results/architects-source.local`, fora do Git. Após revisar os nomes de possíveis empresas em um array JSON local, `node scripts/import-architects.mjs test-results/architects-source.local --exclude test-results/architect-exclusions.local` gera a revisão sem escrever no banco. Com o ambiente da branch carregado, `--apply` aplica em transação; produção exige também `--production`. Os nomes excluídos também ficam fora do código público.

O importador consolida repetições das abas, usa IDs estáveis, ignora linhas não identificadas como arquitetos e separa possíveis empresas ou dados conflitantes para revisão. Não sobrescreve contatos existentes com dados divergentes. Telefones ausentes permanecem vazios. As colunas de colaborador e verificação não são importadas. A planilha e seus registros não são publicados no GitHub; a prévia local continua vazia.

Unificações de nomes com dados diferentes exigem aprovação explícita em um array JSON local, passado por `--merge <arquivo-local>`. O cadastro permite `phone` e `phone2`, com links de ligação separados. Cidades distintas aprovadas são preservadas no campo Cidade, separadas por `/`. Sem aprovação, o caso continua em revisão. Os demais contatos existentes não são sobrescritos.

Fotos são comprimidas no navegador e enviadas à Function autenticada. O servidor valida JPG e tamanho, gera a chave do objeto e grava no bucket privado. O histórico obtém links de leitura com validade de cinco minutos, somente após verificar a autoria. Fotos não ficam em base64 no banco e não são carregadas em cada relatório.

Produtos têm uma galeria opcional de até seis fotos, inclusive os 14 produtos iniciais. A primeira imagem é a capa; administração pode adicionar, remover e trocar a capa na edição. A galeria está disponível na aba Produtos e em Nova visita, preservando o rascunho e as seleções. Fotos do catálogo são compartilhadas apenas entre contas autorizadas, com URLs temporárias. Upload e exclusão exigem administrador; o servidor valida o vínculo de cada imagem com o produto.

`famac.product_photos` guarda referências a arquivos sob `produtos/<produto>/<foto>.jpg` no mesmo bucket privado `famac-visitas`. Fotografias de visitas continuam em sua tabela e com suas permissões privadas. A migração `004-product-photos.sql` é aditiva. Remover uma foto, substituir uma imagem ou excluir o produto limpa os arquivos sem uso depois do commit, conferindo novamente os vínculos sob a trava de revisão. Uploads de um salvamento recusado são removidos; um commit com resposta incerta preserva os arquivos até sua confirmação. A API preserva fotos existentes quando um cliente antigo omite o campo `photos`.

O sistema exige conexão para entrar e salvar na versão conectada. O rascunho não é uma fila offline. Dados da prévia local continuam isolados e exigem uma importação explícita caso ela venha a ser solicitada.

## Verificação

```powershell
npm test
npm run test:product-photos
npm run build
```

Para a suíte visual da prévia, iniciar Vite na porta 5174 com `VITE_FAMAC_MODE=local`, depois executar `npm run test:ui`. Os contextos são descartáveis.

`npm run test:features` verifica Contatos/Obras com múltiplas páginas, filtros, cadastro e persistência de produto, uso em venda, KPI, três larguras de tela e PDF. A suíte exige a prévia local antes de inserir dados fictícios em um contexto descartável; não usa a produção. Capturas ficam em `test-results/reports-kpi-*.png`.

`npm run test:product-photos` usa a mesma prévia local para verificar fotos em produtos novos e iniciais, otimização, limites, capa, cancelamento, remoção, persistência e apresentação durante a visita sem perda do rascunho, inclusive em 360px. A suíte Neon também testa upload e leitura privada por outro colaborador, permissões, vínculo da imagem com o produto, remoção real do bucket e limpeza de uploads após um conflito de revisão.

`npm run test:crm` verifica o kanban e o arraste de cartões, filtros, responsáveis, venda parcial por um colaborador e conclusão por outro, reabertura, vínculo de visita, conflito preservando campos, financeiro e CSV em computador e celular. Na suíte Neon, `scripts/crm-neon-flow.mjs` repete o fluxo entre três sessões reais, testa programação, idempotência, isolamento de fotos/notas, rejeição de alterações diretas do CRM e vínculo de visita ao fechamento sem duplicidade financeira.

A suíte `npm run test:neon` exige uma branch **temporária** `famac-e2e-*`. Criar uma branch isolada, aplicar a configuração e as migrações e configurar quatro contas exclusivas de teste. Caso seja uma cópia normal da produção, a limpeza e a substituição das contas devem ocorrer somente nessa cópia, sempre verificando o nome da branch. Salvar ambiente em `test-results/neon.env.local` e acessos em `test-results/neon-access.local`, preservando o ambiente de produção. O runner valida o nome da branch, limpa somente suas fixtures, usa contextos descartáveis e verifica login, compartilhamento de contatos, isolamento de obras/fotos, atualização automática com preservação do rascunho, suspensão em segundo plano, relatórios, conflitos, senhas e celular. Ao concluir, excluir a branch temporária. Nunca usar as credenciais de produção para a suíte com fixtures.

Monitorar banco, processamento, armazenamento e transferência no painel Neon. Backups externos periódicos e retenção de fotos devem ser definidos conforme o crescimento do uso.
