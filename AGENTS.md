# FAMAC Visitação

- Este checkout é independente do AGROVERDE e do projeto hotel-rovi.
- Projeto de referência, somente leitura: `C:\Users\gabme\sistema-visitacao`.
- Não copiar `.env`, credenciais, SQLs de manutenção, usuários ou dados do projeto de referência.
- Manter obras, contatos, visitas e programação vazios por padrão; produtos e colaboradores solicitados estão em `src/lib/domain.mjs`.
- Banco escolhido: Neon, projeto exclusivo `morning-river-28975560`, organização `org-fancy-queen-60178958`, branch `production`, região `aws-us-east-1`. Frontend no GitHub Pages. Não criar outros projetos nem habilitar serviços além do escopo solicitado.
- Produção usa Neon Auth, API autenticada em Neon Functions, Postgres e bucket privado `famac-visitas`. PIN de 6 números identifica o usuário; senha é validada pelo Auth. Colaborador consulta somente seus registros; administração consulta a equipe. As autorizações são aplicadas no servidor.
- A prévia isolada usa IndexedDB quando `VITE_FAMAC_MODE=local`. Não importar os dados locais automaticamente para o banco remoto.
- Nunca versionar `.env*` (exceto `.env.example`), `.neon`, senhas ou `famac-acessos.local`. Somente URLs públicas recebem prefixo `VITE_`.
- Português do Brasil na interface. Preservar o logo e a identidade descrita em `docs/IDENTIDADE_VISUAL.md`.
- Antes de concluir alterações de comportamento, executar `npm test` e `npm run build`. Para fluxos de interface, usar `npm run test:ui` com a aplicação na porta 5174.
- Testes de navegador usam contexto descartável e não deixam fixtures no estado inicial.
- Para testar os serviços reais, usar uma branch temporária `famac-e2e-*`, com ambiente e acessos em `test-results/`. Nunca executar fixtures na branch `production`; remover a branch temporária ao concluir.
