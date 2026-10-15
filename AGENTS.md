# FAMAC Visitação

- Este checkout é independente do AGROVERDE e do projeto hotel-rovi.
- Projeto de referência, somente leitura: `C:\Users\gabme\sistema-visitacao`.
- Não copiar `.env`, credenciais, SQLs de manutenção, usuários ou dados do projeto de referência.
- Manter obras, contatos, visitas e programação vazios por padrão; produtos e colaboradores solicitados estão em `src/lib/domain.mjs`.
- Banco e hospedagem ainda serão escolhidos. Não conectar nem provisionar serviços implicitamente.
- A persistência atual é local em `src/lib/repository.mjs`; a seleção de colaborador não é login.
- Português do Brasil na interface. Preservar o logo e a identidade descrita em `docs/IDENTIDADE_VISUAL.md`.
- Antes de concluir alterações de comportamento, executar `npm test` e `npm run build`. Para fluxos de interface, usar `npm run test:ui` com a aplicação na porta 5174.
- Testes de navegador usam contexto descartável e não deixam fixtures no estado inicial.
