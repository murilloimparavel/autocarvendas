# Glossário de localização pt-BR

Use estes termos de forma consistente na interface. O contexto determina a tradução; nomes, siglas e dados fornecidos pelos usuários permanecem como foram cadastrados.

| Termo de origem | Forma preferida em pt-BR | Observação de uso |
| --- | --- | --- |
| Dealership | Loja, revenda | “Concessionária” quando a operação for de fato uma concessionária autorizada. |
| Rooftop | Unidade, loja | Unidade operacional vinculada a um grupo. |
| Inventory | Estoque | Em telas de público, “veículos disponíveis” também pode soar mais natural. |
| Inventory acquisition | Entrada de veículo no estoque | Usar “entrada” no fluxo operacional e “aquisição” quando o contexto for financeiro ou contábil. |
| Appraisal | Avaliação | Avaliação do veículo e do valor de compra/troca. |
| Reconditioning / recon | Preparação | Etapa de revisão e preparação do veículo antes de disponibilizá-lo para venda. |
| Frontline | Pronto para venda | Estado do veículo após preparação e aprovação do anúncio; evitar o jargão em inglês na interface. |
| Wholesale | Atacado | Origem de compra de veículos adquiridos no mercado atacadista. |
| Consumer purchase | Compra de particular | Origem de aquisição, em contraste com leilão ou compra de outra loja. |
| Lead | Lead, contato interessado | “Lead” em CRM e relatórios; “contato interessado” em mensagens ao consumidor. |
| Deal | Venda, negociação | “Negociação” enquanto estiver em andamento; “venda” após fechamento. |
| Trade-in | Veículo na troca, troca | Em formulários: “Seu veículo na troca”. |
| Test drive | Test-drive | Preservar essa forma comum no setor; usar hífen. |
| Repair order | Ordem de serviço (OS) | Depois da primeira ocorrência, usar “OS”. |
| Service advisor | Consultor de serviços | Evitar “consultor de serviço” quando se referir à função de oficina. |
| Parts | Peças | “Estoque de peças” para parts inventory. |
| Delivery | Entrega | No fluxo de venda, “entrega do veículo”. |
| Mileage | Quilometragem | Exibir em km no locale pt-BR; converter valores que a aplicação armazena em milhas. |
| VIN | Chassi (VIN) | Preservar VIN quando for o nome do campo técnico ou identificador externo. |
| Stock number | Código do estoque | Manter o valor do código sem alterações. |
| Financing | Financiamento | “Simulação de financiamento” para ferramentas de cotação. |
| Payment | Pagamento | Não confundir com “repasse” ou “liquidação”. |
| Customer | Cliente | Preservar nome, e-mail, telefone e demais dados cadastrados. |
| Salesperson | Vendedor | “Equipe de vendas” em rótulos coletivos. |
| Make / model / trim | Marca / modelo / versão | O conteúdo do catálogo de veículos não deve ser traduzido. |
| License plate | Placa | Campo brasileiro; não confundir com VIN/chassi. |
| RENAVAM | RENAVAM | Sigla brasileira, sempre em caixa alta. |
| FIPE | Tabela FIPE | Referência de mercado, sem alterar o nome próprio. |

## Formatos por locale

- `pt-BR`: datas no padrão brasileiro, números com vírgula decimal, moeda BRL quando não houver moeda configurada e distâncias em quilômetros.
- `en-US`: formatos dos Estados Unidos e milhas.
- Nunca converter o valor financeiro entre moedas durante a formatação. A moeda real do cadastro deve ser preservada.
- Não traduzir conteúdo escrito pelo lojista, dados do cliente, marca/modelo/versão do veículo, identificadores ou texto contratual salvo como dado.
