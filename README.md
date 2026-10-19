# FAMAC Visitação

Sistema de visitação e prospecção em obras da FAMAC Acabamentos. Projeto independente em `C:\Dev\famac`, criado a partir da análise dos fluxos do AGROVERDE, localizado em `C:\Users\gabme\sistema-visitacao`.

O projeto original não foi modificado. Nenhum banco, credencial, usuário, cadastro, foto ou histórico do AGROVERDE foi copiado. O projeto da pasta `hotel-rovi` não participa desta aplicação.

## Executar no computador

Requer Node.js 24 e npm.

```powershell
cd C:\Dev\famac
npm install
npm run dev
```

Abra **http://127.0.0.1:5174/**. A porta é exclusiva desta prévia. Não abra `index.html` diretamente: o projeto precisa do servidor Vite.

```powershell
npm run build
npm run preview
```

O build está em `dist/`; a prévia do build usa **http://127.0.0.1:4174/**. Cada endereço/porta tem armazenamento próprio no navegador.

## Esta versão

- Entrada diretamente em Nova visita, com formulário adaptado para celular.
- Obras com endereço completo, bairro obrigatório e consulta de CEP ao sair do campo completo (Tab no computador ou troca de campo no celular). O botão também permite buscar novamente; preenchimento manual continua disponível.
- Responsável e telefone opcionais para a prospecção inicial (quando preenchido, telefone exige DDD); empreiteiro e arquiteto com busca e cadastro na própria visita.
- Tipos comercial e residencial; seleção de múltiplos produtos oferecidos e vendidos.
- Visitas de Relacionamento podem ser registradas sem produtos; em Prospecção e Fechamento, a seleção de produto continua obrigatória.
- Fotos por câmera/galeria, com até 6 imagens, limitadas a 12 MB por arquivo antes da otimização local.
- Histórico de visitas e detalhes com fotos, observações e próxima ação.
- Exclusão individual de visitas com confirmação. A visita sai das listas e dos indicadores; vendas vinculadas permanecem no CRM e no financeiro.
- CRM compartilhado com kanban de cinco etapas, responsável atual, próximos retornos e histórico da equipe. Uma obra mantém a mesma oportunidade entre colaboradores; visitas e fotos privadas conservam sua autoria. Vendas parciais, encerramento com motivo e reabertura são registrados sem apagar o histórico.
- Negociações encerradas ficam em uma lista própria com busca, filtros e paginação de 12 registros. As etapas finais do quadro exibem somente resumos; reabrir devolve a obra ao acompanhamento. No histórico, vendas feitas durante a visita aparecem acima da visita do mesmo salvamento.
- Fechamentos do CRM e das visitas são conciliados em um relatório financeiro com filtros e CSV, sem duplicar vendas vinculadas. Quem prospectou e quem vendeu aparecem separadamente. Uma venda lançada no CRM pode ser vinculada à visita do vendedor.
- Programação por dia/semana/mês, retorno opcional ao registrar visita, conclusão e motivo de não realização. Ações do CRM com data aparecem para seu responsável.
- Cadastro e edição de obras e contatos, com paginação de 12 registros e filtros sobre a lista completa. Contatos podem ser excluídos com confirmação, preservando vínculos e histórico.
- Catálogo com 14 produtos iniciais e novos produtos, disponíveis para toda a equipe. A administração pode cadastrar, editar e excluir qualquer produto; alterações de nome valem para as próximas visitas e o histórico mantém o nome original.
- Cada produto pode ter até 6 fotos, com capa e galeria ampliada no catálogo e na tela Nova visita. A administração inclui e remove imagens no cadastro ou edição; toda a equipe pode apresentá-las aos clientes sem alterar o rascunho da visita.
- Visão geral, equipe e relatórios com filtros combinados, rankings, exportação CSV e impressão/PDF.
- Login com PIN e senha, alteração de senha e redefinição pela administração, sem e-mail de acesso.
- Integração com Postgres, Auth, Functions e Object Storage do Neon. Arquitetos, empreiteiros e fotos do catálogo são compartilhados; obras, visitas, programação e fotos das visitas ficam restritos ao colaborador. A administração consulta a equipe.

Os nomes **Claudionor, Charles e Celso** são os colaboradores configurados. Na versão conectada, a identidade vem da sessão autenticada. Na prévia local isolada, a seleção de perfil serve somente para testes.

## Dados e banco Neon

A prévia local inicia sem obras, contatos, visitas ou programações. Produtos e nomes dos colaboradores são a configuração informada pelo usuário. A produção possui uma lista de arquitetos importada explicitamente; a planilha e os contatos não são incluídos no código público. O projeto Neon é exclusivo da FAMAC, na região N. Virginia; a API autentica a sessão e verifica as permissões antes de acessar o banco ou as fotos.

Na versão conectada, os registros são gravados no Postgres por uma Neon Function; fotos comprimidas ficam no bucket privado `famac-visitas`, e o banco guarda somente suas referências. A aplicação carrega os registros ao entrar e verifica mudanças automaticamente a cada 30 segundos com a aba visível, ao retornar à janela e ao recuperar a conexão. O rascunho da visita é preservado; alterações ainda não salvas não são sincronizadas. Formulários abertos em modais pausam a atualização para preservar a edição.

O aplicativo também consulta o [ViaCEP](https://viacep.com.br/) para preencher endereços. As fontes tipográficas são carregadas do Google Fonts; se estiverem indisponíveis, o navegador usa fontes do sistema.

O módulo `src/lib/repository.mjs` seleciona o repositório remoto quando as URLs públicas do Neon estão configuradas. Com `VITE_FAMAC_MODE=local`, funciona a prévia em IndexedDB (`famac-visitacao-local-v1`), independente do banco remoto. **Os dados antigos da prévia nunca são importados automaticamente.**

Consulte [Configuração e operação do Neon](docs/NEON.md), [Modelo do banco e próximos passos](docs/BANCO_FUTURO.md) e [Identidade visual](docs/IDENTIDADE_VISUAL.md).

## Regras dos relatórios

- **Oferecido/prospectado:** produto selecionado entre as ofertas da visita.
- **Interesse sem venda:** produto oferecido que não foi marcado como vendido naquela visita. É um indicador de prospecção, não uma confirmação de interesse declarada pelo cliente.
- **Vendido:** produto marcado como vendido; ele também precisa estar entre os oferecidos.
- **Visita com venda:** registro com um ou mais produtos vendidos. É contado uma vez, mesmo com vários produtos.
- **Visita de prospecção:** registro classificado como Prospecção. Uma visita com produto vendido passa a Fechamento.
- **Conversão:** visitas com venda divididas pelas visitas dos filtros, sem divisão por zero.
- **Presença em campo:** quantidade de visitas e dias distintos com visita registrada, sem inferir jornada, faltas ou metas.
- **Participação:** visitas do colaborador divididas pelas visitas autorizadas nos filtros atuais.
- **Valor médio por visita com venda:** valor vendido dividido pelo número de visitas com venda; sem vendas, o indicador exibe um traço.
- A evolução por data usa até 12 intervalos e inclui intervalos sem visitas. Os gráficos de KPI acompanham os mesmos filtros das tabelas e exportações.
- **Valor vendido:** total informado na visita, opcional. Não há rateio de valor por produto. Filtrar um produto seleciona visitas com esse produto; o valor exibido continua sendo o total dessas visitas.
- Rankings de bairros separam municípios e UFs para não juntar bairros homônimos.
- Os filtros se aplicam às visitas, usando os nomes dos contatos registrados na época. Gráficos mostram os produtos presentes nessas visitas; um filtro de produto não divide o valor ou remove outros produtos da mesma visita.
- CSV exporta todas as visitas filtradas, independentemente da paginação/busca visual da tabela, e inclui endereço e contatos. PDF imprime todas as visitas filtradas.

## Prévia no GitHub Pages

Repositório de destino: [RAGCode-BR/FAMAC-VISITACAO](https://github.com/RAGCode-BR/FAMAC-VISITACAO).

O workflow `.github/workflows/pages.yml` instala as dependências, executa os testes, compila o sistema e publica `dist/` a cada push em `main`. No repositório, o GitHub Pages precisa estar habilitado com **Settings → Pages → Source: GitHub Actions**. A disponibilidade para repositórios privados depende do plano e das permissões da conta.

As variáveis de repositório `VITE_NEON_AUTH_URL` e `VITE_FAMAC_API_URL` contêm somente URLs públicas. Credenciais do banco e do bucket não participam do build. O backend é publicado separadamente com `neon deploy`.

Depois de `npm run build`, execute `npm run test:pages` para verificar o build servido na subpasta `/FAMAC-VISITACAO/`. Esse teste usa o mesmo Edge configurado para os testes de interface e confere os recursos da aplicação sem permitir que uma página de fallback esconda erros 404.

Endereço previsto após uma publicação bem-sucedida: **https://ragcode-br.github.io/FAMAC-VISITACAO/**. Este endereço não comprova que a publicação já aconteceu; confira o resultado do workflow em Actions.

As URLs de recursos são relativas para que logos, favicon, JavaScript e CSS funcionem na subpasta do repositório. O site continua sendo uma prévia sem autenticação e sem banco remoto. Os registros permanecem no navegador que os criou; mudar de dispositivo ou endereço não transfere dados.

Referências: [publicação do Vite no GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages) e [workflows do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Verificação

```powershell
npm test
npm run build
```

Para verificar no navegador, inicie `npm run dev` em outro terminal e execute:

```powershell
npm run test:ui
```

O teste usa Microsoft Edge instalado em `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`. Para outro local, defina `BROWSER_PATH`. Para outra porta, defina `TEST_APP_URL`.

Os testes usam um contexto de navegador descartável: não deixam cadastros de teste no sistema. Verificam cadastro com CEP, contatos, foto e produtos, filtros dos relatórios, persistência, programação e nove telas no celular. Capturas sem dados estão em `docs/preview-*.png`; PDF de teste e arquivos temporários ficam em `test-results/`, ignorado pelo Git.

## Referência de código

Foram analisados os fluxos de navegação, cadastros, visitas, programação e relatórios do código-fonte do AGROVERDE. `src/components/Pagination.jsx` foi reutilizado do original; a busca de contatos adapta os comportamentos de `SearchableClientSelect.jsx`. O domínio de obras, persistência local, demais componentes e identidade visual foram implementados para a FAMAC. Bibliotecas de autenticação, SQLs, funções administrativas e arquivos de ambiente do projeto original não integram esta versão.
