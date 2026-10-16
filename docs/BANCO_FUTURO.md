# Banco Neon e próximos passos

O provedor escolhido é Neon. A configuração e a operação estão descritas em [NEON.md](NEON.md). O backend usa Postgres, Neon Auth, Functions e Object Storage privado, com PIN e senha e autorização por colaborador.

## Modelo previsto

| Entidade           | Informações                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Perfis             | Identidade autenticada, nome do colaborador e permissão                                                    |
| Contatos           | Nome, função (empreiteiro/arquiteto/responsável), telefone, cidade, empresa e observações; arquitetos e empreiteiros compartilhados |
| Obras              | Nome, tipo, responsável, telefone, endereço e bairro; vínculos com os contatos                             |
| Produtos           | 14 produtos iniciais e produtos adicionais compartilhados; administração cria, edita e exclui logicamente; nomes ativos únicos e histórico preservado |
| Visitas            | Obra, data, colaborador, endereço e contatos na época, tipo de visita, notas, total vendido e próxima ação |
| Produtos da visita | Produto oferecido e indicador de venda; sem atribuição automática do valor da visita a cada item           |
| Programações       | Obra, colaborador, data, objetivo, situação, motivo de não realização e visita correspondente              |
| Fotos              | Identificação do arquivo, visita, autor e caminho no armazenamento privado                                 |

## Próximos passos de evolução

1. Definir a política de backups externos e testar a recuperação.
2. Definir retenção das fotos e acompanhar as franquias do plano gratuito.
3. Evoluir prevenção de duplicidades e auditoria conforme as regras operacionais forem definidas.
4. Definir se o trabalho em campo precisa funcionar sem sinal e implementar uma fila offline se necessário.
5. Evoluir consultas de relatórios no servidor e paginação remota conforme o histórico crescer.

O banco iniciou vazio e recebeu a importação de arquitetos solicitada explicitamente. Nenhum dado da prévia local é enviado automaticamente. Novas importações devem ser operações explícitas, validadas e separadas.

A prévia local isolada permite seleção livre de colaborador para testes. A versão conectada aplica as permissões no backend e não depende dessa seleção para autorizar acesso.
