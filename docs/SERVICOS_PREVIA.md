# Serviços e instalações — prévia local

Publicação autorizada em 01/11/2026 após avaliação local. Em produção, a aba e as ações são restritas ao administrador e Túlio. A prévia com `VITE_FAMAC_MODE=local` permanece isolada e sem transferência automática de dados.

## Abrir

Execute `npm run dev:local` e abra http://127.0.0.1:5174/. O comando força o modo local sem editar `.env.local`. A porta é exclusiva: se já estiver ocupada, encerre a outra prévia antes de executar.

Os cadastros iniciam vazios e ficam no IndexedDB do navegador. Por solicitação explícita, o histórico da planilha foi importado no navegador do usuário em 01/11/2026, excluindo Julho. Não há sincronização com produção ou outros dispositivos, e novos navegadores continuam vazios por padrão.

## Avaliar o fluxo

1. Em **Serviços → Equipe de execução**, cadastre os profissionais. São cadastros operacionais, sem login.
2. Crie um serviço diretamente ou registre uma venda na prévia e use **Vendas para instalação → Gerar serviço**. O cartão do CRM também permite criar serviço a partir de seus fechamentos. Vendas que não precisam de instalação podem ser marcadas como **Sem instalação** e reavaliadas depois.
3. Preencha cliente/obra, endereço, bairro, cidade, tipo, descrição, produtos, contato, orientações e até seis fotos.
   O CEP consulta o endereço ao sair do campo completo (Tab no computador ou troca de campo no celular). O botão **Buscar endereço** permite consultar novamente. Confira o número e o complemento; preenchimento manual continua disponível. CEP, rua, número, complemento e UF ficam preservados no serviço, inclusive quando preenchidos a partir de uma venda ou obra.
4. Salve sem data para aguardar agendamento ou adicione períodos com data inicial/final e profissionais. Há manhã, tarde, dia inteiro e horário específico. É possível ter vários agendamentos no mesmo serviço.
5. A agenda diária/semanal permite abrir o serviço. A lista completa tem busca, filtros e paginação de 12 itens.
6. Use **Iniciar execução**, **Concluir serviço**, **Registrar retorno** ou **Cancelar serviço**. Retornos e cancelamentos exigem motivo. Um retorno encerra as reservas anteriores e aguarda novo agendamento; o histórico conserva os registros. É possível reabrir serviços cancelados e registrar retorno de um concluído.

## Regras

- Períodos sobrepostos do mesmo profissional são recusados. Horários contíguos são permitidos. As datas inicial e final são inclusivas.
- A agenda e os agendamentos exibem datas no formato **dd/mm/aaaa**, com seletor em português, independentemente do idioma do navegador. O armazenamento continua usando datas ISO para comparar períodos corretamente.
- Cadastros inativos não entram em novas equipes. Para desativar um profissional com agendamento pendente, é necessário reatribuir primeiro.
- O identificador `SV-0001` pertence ao serviço e é distinto da OS da visita.
- Uma venda pode ter vários serviços. Criar, agendar ou concluir serviço não altera o fechamento nem soma novamente o valor financeiro.
- Reagendamento, retorno, cancelamento, fotos e mudanças de situação ficam na prévia. O histórico registra o nome do colaborador selecionado, sem autenticação real neste ambiente isolado.
- Serviços guardam snapshots do cliente/obra; edições operacionais não alteram a autoria ou os dados das visitas.
- Veículos, login dos instaladores e notificações remotas ficam para uma etapa futura. A autorização é verificada no servidor em cada ação e acesso a fotos.

## Histórico da planilha

Em **Serviços → Histórico importado**, os 1.556 lançamentos mantêm data, texto original, aba e célula de origem. São 1.472 lançamentos de serviço e 84 observações; dias repetidos continuam como lançamentos distintos, sem presumir ordens de serviço únicas. A aba Julho foi excluída por conter título e datas de março/abril. Novembro e dezembro estavam sem lançamentos.

As situações vêm das cores da legenda e não representam uma atualização da situação atual. A equipe é identificada somente quando o texto permite; produtos não são cadastrados como profissionais. Não foram criados endereços, contatos, vendas ou agendamentos ativos a partir da planilha.

Após a importação, o usuário autorizou excluir os 134 lançamentos sinalizados para conferência e retirar o filtro correspondente. Restaram 1.422 lançamentos (1.338 serviços e 84 observações). A limpeza confere IDs e fingerprints, preserva os demais dados e grava backup atômico na chave `service-history-backup:<id-do-plano-de-limpeza>`, com recibo em `serviceHistoryCleanups`. O plano de limpeza aplicado também foi arquivado em `test-results/`; a operação não se repete nem alimenta novas prévias.

O usuário autorizou a exclusão do teste SV-0001 antes da importação. A operação foi atômica no IndexedDB: backup na chave `service-history-backup:<id-do-plano>`, exclusão do teste, inclusão dos lançamentos e recibo em `serviceHistoryImports`. Repetir o mesmo plano não duplica o histórico nem repete a exclusão. O contador `nextInstallationNumber` impede reutilizar o código removido; o número do imóvel fica em `addressNumber`.

Os arquivos de origem, revisão, plano aplicado e recibo ficam em `test-results/`, ignorados pelo Git. O middleware de importação existe somente no Vite local, aceita apenas requisições da mesma origem e de loopback, e não participa do site publicado. O plano foi arquivado após o recibo de sucesso; o endpoint volta a responder sem dados. Testes de importação usam planos fictícios e interceptam os recibos, sem alterar o navegador do usuário ou o arquivo de confirmação real.

## Verificação

`npm test` inclui testes de regras de Serviços. Com a prévia local na porta 5174, `npm run test:services` verifica cadastro de equipe, vínculo com venda, conflito, retorno, conclusão, fotos, persistência e financeiro sem duplicidade em computador e celular. O teste usa contexto descartável e bloqueia conexões ao Neon. Execute também `npm run test:ui` e `npm run build`.

## Persistência em produção

A migração aditiva `010-services.sql` cria o estado operacional, histórico importado e referências de fotos. A API `/services/actions` aplica as mesmas regras da prévia no servidor, com autoria da sessão, sequência de códigos, trava da revisão, conflitos de equipe e idempotência por operação. Atualizações diretas por `/state` são recusadas. Contas comuns não recebem esses dados. Fotos são enviadas ao bucket privado sob `servicos/`; cancelar o formulário não altera arquivos remotos e remoções são limpas após o commit.

O script `import-services-history.mjs` importa somente os 1.422 lançamentos revisados mediante execução explícita; preserva o estado operacional e o financeiro. Arquivos, backups e recibos ficam em `test-results/`, ignorados pelo Git.
