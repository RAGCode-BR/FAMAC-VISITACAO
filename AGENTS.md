# FAMAC Visitação

- Este checkout é independente do AGROVERDE e do projeto hotel-rovi.
- Projeto de referência, somente leitura: `C:\Users\gabme\sistema-visitacao`.
- Não copiar `.env`, credenciais, SQLs de manutenção, usuários ou dados do projeto de referência.
- Manter a prévia local vazia por padrão; produtos e colaboradores solicitados estão em `src/lib/domain.mjs`. A lista de arquitetos da produção foi importada por solicitação explícita; nunca incluir essa lista ou telefones no código público.
- Banco escolhido: Neon, projeto exclusivo `morning-river-28975560`, organização `org-fancy-queen-60178958`, branch `production`, região `aws-us-east-1`. Frontend no GitHub Pages. Não criar outros projetos nem habilitar serviços além do escopo solicitado.
- Produção usa Neon Auth, API autenticada em Neon Functions, Postgres e bucket privado `famac-visitas`. PIN de 1 número identifica o usuário (0 administrador, 1 Claudionor, 2 Charles, 3 Celso); senha é validada pelo Auth. Arquitetos e empreiteiros são compartilhados entre usuários. Obras, visitas, programação, fotos e contatos de responsáveis continuam restritos ao colaborador; administração consulta a equipe. As autorizações são aplicadas no servidor.
- Atualização automática consulta a revisão a cada 30 segundos com a aba visível e ao retomar a tela/conexão. Preservar rascunhos e não sobrescrever salvamentos ou formulários de contato abertos.
- O catálogo inicial de 14 produtos é preservado. Produtos adicionais ficam em `famac.products`, compartilhados para consulta e uso; somente administradores podem criar. Não editar/remover produtos já usados no histórico.
- Contatos e Obras paginam 12 registros após filtrar a lista completa. KPI de presença significa visitas e dias distintos com visita; não inferir ponto, faltas ou metas.
- A prévia isolada usa IndexedDB quando `VITE_FAMAC_MODE=local`. Não importar os dados locais automaticamente para o banco remoto.
- Nunca versionar `.env*` (exceto `.env.example`), `.neon`, senhas ou `famac-acessos.local`. Somente URLs públicas recebem prefixo `VITE_`.
- Português do Brasil na interface. Preservar o logo e a identidade descrita em `docs/IDENTIDADE_VISUAL.md`.
- Antes de concluir alterações de comportamento, executar `npm test` e `npm run build`. Para fluxos de interface, usar `npm run test:ui` com a aplicação na porta 5174.
- Testes de navegador usam contexto descartável e não deixam fixtures no estado inicial.
- Para testar os serviços reais, usar uma branch temporária `famac-e2e-*`, com ambiente e acessos em `test-results/`. Nunca executar fixtures na branch `production`; remover a branch temporária ao concluir.
