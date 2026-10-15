# Conexão futura com o banco

Esta versão não cria nem conecta banco remoto. Supabase é uma possibilidade, ainda não uma decisão de hospedagem.

## Modelo previsto

| Entidade           | Informações                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Perfis             | Identidade autenticada, nome do colaborador e permissão                                                    |
| Contatos           | Nome, função (empreiteiro/arquiteto/responsável), telefone, empresa e observações                          |
| Obras              | Nome, tipo, responsável, telefone, endereço e bairro; vínculos com os contatos                             |
| Produtos           | Catálogo dos 14 produtos informados                                                                        |
| Visitas            | Obra, data, colaborador, endereço e contatos na época, tipo de visita, notas, total vendido e próxima ação |
| Produtos da visita | Produto oferecido e indicador de venda; sem atribuição automática do valor da visita a cada item           |
| Programações       | Obra, colaborador, data, objetivo, situação, motivo de não realização e visita correspondente              |
| Fotos              | Identificação do arquivo, visita, autor e caminho no armazenamento privado                                 |

## Implementação a realizar após a escolha

1. Criar um projeto/banco exclusivo para FAMAC, sem clonar o banco do AGROVERDE.
2. Definir quem administra o sistema e se os colaboradores podem consultar toda a equipe ou apenas os próprios registros.
3. Criar autenticação real e as contas de Claudionor, Charles e Celso. Não há senhas, PINs ou contas de acesso nesta versão.
4. Criar esquema, índices, chaves e políticas de acesso. Caso seja Supabase, implementar RLS, sessão autenticada e acesso privado às fotos.
5. Substituir `src/lib/repository.mjs` por um adaptador remoto e operações transacionais, preservando a consistência entre obra, visita e retorno.
6. Mover as imagens para armazenamento de arquivos; o IndexedDB local atual é apenas para a prévia.
7. Definir validação, prevenção de duplicidade de obras/contatos, edição de visitas e auditoria no servidor.
8. Definir se a versão de produção precisa operar sem sinal e como sincronizar registros pendentes.
9. Conectar o projeto FAMAC com variáveis novas e exclusivas e testar perfis distintos, fotos e relatórios.

O padrão será iniciar o banco definitivo vazio. Nenhum dado local deve ser enviado automaticamente. Uma eventual importação dos registros desta prévia deve ser uma operação explícita, validada e separada.

O modo local atual permite seleção livre de colaborador e consulta de todos os registros. Não deve ser publicado como aplicação com controle de acesso antes de implementar autenticação e autorização reais.
