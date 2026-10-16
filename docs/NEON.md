# Neon — configuração e operação

Projeto FAMAC `morning-river-28975560`, organização `org-fancy-queen-60178958`, branch `production`, região `aws-us-east-1`. Frontend: GitHub Pages. Backend: Function `famacapi`. Arquivos: bucket privado `famac-visitas`.

## Acesso

O usuário informa **PIN de um número e senha**, sem caixa de e-mail: 0 para o administrador, 1 para Claudionor, 2 para Charles e 3 para Celso. O PIN é convertido em um identificador técnico reservado pelo `src/lib/identity.mjs` para usar o Neon Auth gerenciado. Esse identificador permanece estável para preservar as contas e senhas existentes; não envia mensagens nem aparece no formulário. Não há cadastro público; os usuários são criados pela administração. O PIN não substitui a senha. O formato de um dígito comporta no máximo dez identificadores distintos.

- Colaborador: somente obras, visitas, programação, fotos e contatos de responsáveis com sua autoria. Arquitetos e empreiteiros são compartilhados, disponíveis para consulta, seleção e edição por toda a equipe. A autoria original é preservada; contatos importados sem colaborador atribuído usam `owner_id='shared'`.
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

O schema `famac` contém membros, obras, contatos, visitas, programação, referências de fotos, revisão e operações. Dados são salvos por registro, com autoria no servidor. A API verifica JWT do Neon Auth e o vínculo fixo da conta antes de consultar ou alterar dados. A interface não acessa Postgres nem S3 com credenciais próprias.

O salvamento de obra, visita e retorno é transacional. Uma revisão evita sobrescrever alterações de outro dispositivo; em conflito, o app atualiza a base, preserva os campos em preenchimento e pede uma nova tentativa. Operações têm identificação para confirmar commits cuja resposta se perdeu.

A atualização automática consulta `/state?since=<revisão>` a cada 30 segundos quando a aba está visível, ao voltar à janela e ao recuperar a conexão. Sem mudanças, a API retorna 204 e não transmite toda a base. Não há consulta contínua com a aba oculta; respostas anteriores a um salvamento são descartadas. Rascunhos de visita são preservados e a atualização pausa enquanto há um modal aberto para evitar sobrescrever edições de contato. Não utiliza o serviço Neon Realtime.

## Importação de arquitetos

`scripts/read-architects.ps1 -Path '<planilha.xlsx>'` extrai nome, contato e cidade; o cargo é usado somente na triagem. Saída em `test-results/architects-source.local`, fora do Git. Após revisar os nomes de possíveis empresas em um array JSON local, `node scripts/import-architects.mjs test-results/architects-source.local --exclude test-results/architect-exclusions.local` gera a revisão sem escrever no banco. Com o ambiente da branch carregado, `--apply` aplica em transação; produção exige também `--production`. Os nomes excluídos também ficam fora do código público.

O importador consolida repetições das abas, usa IDs estáveis, ignora linhas não identificadas como arquitetos e separa possíveis empresas ou dados conflitantes para revisão. Não sobrescreve contatos existentes com dados divergentes. Telefones ausentes permanecem vazios. As colunas de colaborador e verificação não são importadas. A planilha e seus registros não são publicados no GitHub; a prévia local continua vazia.

Unificações de nomes com dados diferentes exigem aprovação explícita em um array JSON local, passado por `--merge <arquivo-local>`. O cadastro permite `phone` e `phone2`, com links de ligação separados. Cidades distintas aprovadas são preservadas no campo Cidade, separadas por `/`. Sem aprovação, o caso continua em revisão. Os demais contatos existentes não são sobrescritos.

Fotos são comprimidas no navegador e enviadas à Function autenticada. O servidor valida JPG e tamanho, gera a chave do objeto e grava no bucket privado. O histórico obtém links de leitura com validade de cinco minutos, somente após verificar a autoria. Fotos não ficam em base64 no banco e não são carregadas em cada relatório.

O sistema exige conexão para entrar e salvar na versão conectada. O rascunho não é uma fila offline. Dados da prévia local continuam isolados e exigem uma importação explícita caso ela venha a ser solicitada.

## Verificação

```powershell
npm test
npm run build
```

Para a suíte visual da prévia, iniciar Vite na porta 5174 com `VITE_FAMAC_MODE=local`, depois executar `npm run test:ui`. Os contextos são descartáveis.

A suíte `npm run test:neon` exige uma branch **temporária** `famac-e2e-*`. Criar uma branch isolada, aplicar a configuração e as migrações e configurar quatro contas exclusivas de teste. Caso seja uma cópia normal da produção, a limpeza e a substituição das contas devem ocorrer somente nessa cópia, sempre verificando o nome da branch. Salvar ambiente em `test-results/neon.env.local` e acessos em `test-results/neon-access.local`, preservando o ambiente de produção. O runner valida o nome da branch, limpa somente suas fixtures, usa contextos descartáveis e verifica login, compartilhamento de contatos, isolamento de obras/fotos, atualização automática com preservação do rascunho, suspensão em segundo plano, relatórios, conflitos, senhas e celular. Ao concluir, excluir a branch temporária. Nunca usar as credenciais de produção para a suíte com fixtures.

Monitorar banco, processamento, armazenamento e transferência no painel Neon. Backups externos periódicos e retenção de fotos devem ser definidos conforme o crescimento do uso.
