# Neon — configuração e operação

Projeto FAMAC `morning-river-28975560`, organização `org-fancy-queen-60178958`, branch `production`, região `aws-us-east-1`. Frontend: GitHub Pages. Backend: Function `famacapi`. Arquivos: bucket privado `famac-visitas`.

## Acesso

O usuário informa **PIN de um número e senha**, sem caixa de e-mail: 0 para o administrador, 1 para Claudionor, 2 para Charles e 3 para Celso. O PIN é convertido em um identificador técnico reservado pelo `src/lib/identity.mjs` para usar o Neon Auth gerenciado. Esse identificador permanece estável para preservar as contas e senhas existentes; não envia mensagens nem aparece no formulário. Não há cadastro público; os usuários são criados pela administração. O PIN não substitui a senha. O formato de um dígito comporta no máximo dez identificadores distintos.

- Colaborador: somente obras, contatos, visitas, programação e fotos com sua autoria.
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

Fotos são comprimidas no navegador e enviadas à Function autenticada. O servidor valida JPG e tamanho, gera a chave do objeto e grava no bucket privado. O histórico obtém links de leitura com validade de cinco minutos, somente após verificar a autoria. Fotos não ficam em base64 no banco e não são carregadas em cada relatório.

O sistema exige conexão para entrar e salvar na versão conectada. O rascunho não é uma fila offline. Dados da prévia local continuam isolados e exigem uma importação explícita caso ela venha a ser solicitada.

## Verificação

```powershell
npm test
npm run build
```

Para a suíte visual da prévia, iniciar Vite na porta 5174 com `VITE_FAMAC_MODE=local`, depois executar `npm run test:ui`. Os contextos são descartáveis.

A suíte `npm run test:neon` exige uma branch **temporária** `famac-e2e-*`. Criar a branch a partir de uma produção sem dados, aplicar a configuração e as migrações, e gerar acessos de teste nela. Salvar ambiente em `test-results/neon.env.local` e acessos em `test-results/neon-access.local`. O runner valida o nome da branch, limpa somente suas fixtures, usa contextos descartáveis e verifica login, persistência, fotos privadas, autorização, relatórios, conflitos, senhas e celular. Ao concluir, retornar o vínculo a `production` e excluir a branch temporária. Nunca usar as credenciais de produção para a suíte com fixtures.

Monitorar banco, processamento, armazenamento e transferência no painel Neon. Backups externos periódicos e retenção de fotos devem ser definidos conforme o crescimento do uso.
