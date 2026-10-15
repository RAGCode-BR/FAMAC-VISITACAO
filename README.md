# FAMAC Visitação

Sistema de visitação e prospecção em obras da FAMAC Acabamentos. Projeto independente em `C:\Dev\famac`, criado a partir da análise dos fluxos do AGROVERDE, localizado em `C:\Users\gabme\sistema-visitacao`.

O projeto original não foi modificado. Nenhum banco, credencial, usuário, cadastro, foto ou histórico do AGROVERDE foi copiado. O projeto da pasta `hotel-rovi` não participa desta aplicação.

## Executar no computador

Requer Node.js 20.19+ ou 22.12+ e npm.

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
- Obras com endereço completo, bairro obrigatório e consulta de CEP com preenchimento manual como alternativa.
- Responsável e telefone opcionais para a prospecção inicial (quando preenchido, telefone exige DDD); empreiteiro e arquiteto com busca e cadastro na própria visita.
- Tipos comercial e residencial; seleção de múltiplos produtos oferecidos e vendidos.
- Fotos por câmera/galeria, com até 6 imagens, limitadas a 12 MB por arquivo antes da otimização local.
- Histórico de visitas e detalhes com fotos, observações e próxima ação.
- Programação por dia/semana/mês, retorno opcional ao registrar visita, conclusão e motivo de não realização.
- Cadastro e edição de obras e contatos; portfólio dos 14 produtos.
- Visão geral, equipe e relatórios com filtros combinados, rankings, exportação CSV e impressão/PDF.

Os nomes **Claudionor, Charles e Celso** são os colaboradores configurados para a prévia. A seleção de perfil **não é autenticação** e não restringe acesso aos dados.

## Dados e banco futuro

A aplicação inicia sem obras, contatos, visitas ou programações. Produtos e nomes dos colaboradores são a configuração informada pelo usuário, não dados importados.

Os registros feitos na prévia são gravados **somente no IndexedDB deste navegador**, no armazenamento `famac-visitacao-local-v1`. Não existe conexão com Supabase, API própria ou banco remoto. Não há sincronização entre computadores, celulares, navegadores ou portas. Limpar os dados do site remove os registros locais. O formulário em andamento é mantido ao navegar entre telas; ao recarregar, o navegador avisa sobre alterações ainda não salvas.

O único serviço consultado pelo aplicativo é o [ViaCEP](https://viacep.com.br/), quando o usuário pede a busca de endereço. As fontes tipográficas são carregadas do Google Fonts; se estiverem indisponíveis, o navegador usa fontes do sistema.

O módulo `src/lib/repository.mjs` concentra a leitura e a gravação para permitir a futura implementação de um repositório remoto. Login, permissões, upload remoto e políticas de acesso ainda precisam ser implementados com o provedor escolhido. Não conecte a prévia a um banco apenas alterando uma URL.

Consulte [Próximos passos para o banco](docs/BANCO_FUTURO.md) e [Identidade visual](docs/IDENTIDADE_VISUAL.md).

## Regras dos relatórios

- **Oferecido/prospectado:** produto selecionado entre as ofertas da visita.
- **Interesse sem venda:** produto oferecido que não foi marcado como vendido naquela visita. É um indicador de prospecção, não uma confirmação de interesse declarada pelo cliente.
- **Vendido:** produto marcado como vendido; ele também precisa estar entre os oferecidos.
- **Visita com venda:** registro com um ou mais produtos vendidos. É contado uma vez, mesmo com vários produtos.
- **Visita de prospecção:** registro classificado como Prospecção. Uma visita com produto vendido passa a Fechamento.
- **Conversão:** visitas com venda divididas pelas visitas dos filtros, sem divisão por zero.
- **Valor vendido:** total informado na visita, opcional. Não há rateio de valor por produto. Filtrar um produto seleciona visitas com esse produto; o valor exibido continua sendo o total dessas visitas.
- Rankings de bairros separam municípios e UFs para não juntar bairros homônimos.
- Os filtros se aplicam às visitas, usando os nomes dos contatos registrados na época. Gráficos mostram os produtos presentes nessas visitas; um filtro de produto não divide o valor ou remove outros produtos da mesma visita.
- CSV exporta todas as visitas filtradas, independentemente da paginação/busca visual da tabela, e inclui endereço e contatos. PDF imprime todas as visitas filtradas.

## Prévia no GitHub Pages

Repositório de destino: [RAGCode-BR/FAMAC-VISITACAO](https://github.com/RAGCode-BR/FAMAC-VISITACAO).

O workflow `.github/workflows/pages.yml` instala as dependências, executa os testes, compila o sistema e publica `dist/` a cada push em `main`. No repositório, o GitHub Pages precisa estar habilitado com **Settings → Pages → Source: GitHub Actions**. A disponibilidade para repositórios privados depende do plano e das permissões da conta.

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
