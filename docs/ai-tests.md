# AI Tests README

Este documento resume como validar a base da IA em `src/lib/ai` sem depender de testes manuais de conversa.

## Objetivo

Os testes atuais cobrem a parte mais critica da IA:

- heuristicas de decisao comercial
- regras puras de desconto, carrossel e snapshot
- integracao leve entre `toolRules` e `heuristics`
- pos-processamento do orquestrador (normalizacao e sanitizacao de texto)

Eles nao substituem teste E2E com WhatsApp real, mas ajudam a detectar regressao rapida em regra de negocio e comportamento base.

## Comandos

Rode dentro de `crm-whats`:

```powershell
cd c:\Users\USER\Desktop\meu-servidor-whatsapp\crm-whats
```

### Rodar toda a suite da IA

```powershell
npm run test:ai:all
```

### Rodar testes separados

```powershell
npm run test:ai
npm run test:ai:tools
npm run test:ai:flow
npm run test:ai:transcripts
npm run test:ai:transcripts:multi
npm run test:ai:orchestrator
npm run test:ai:metrics
```

## O que cada teste cobre

### `npm run test:ai`

Arquivo: [scripts/test-ai-heuristics.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/test-ai-heuristics.mjs)

Cobre:

- leitura do `cart_snapshot`
- prioridade de objetivo comercial
- ordem de oferta (`principal -> adicional -> bebida`)
- retomada de carrinho
- resposta para duvida, objecao e fechamento operacional
- robustez com snapshot malformado

### `npm run test:ai:tools`

Arquivo: [scripts/test-ai-tool-rules.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/test-ai-tool-rules.mjs)

Cobre:

- calculo de desconto percentual
- prioridade de desconto explicito vs cupom automatico
- texto de preco do carrossel
- normalizacao do payload de `cart_snapshot`

### `npm run test:ai:flow`

Arquivo: [scripts/test-ai-flow.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/test-ai-flow.mjs)

Cobre:

- fluxo entre `toolRules` e `heuristics`
- `cart_snapshot` gerado no calculo
- leitura do snapshot pela IA
- coerencia entre estado do carrinho e objetivo comercial
- coerencia entre cupom aplicado e exibicao no carrossel

### `npm run test:ai:orchestrator`

Arquivo: [scripts/test-ai-orchestrator-rules.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/test-ai-orchestrator-rules.mjs)

Cobre:

- remocao de blocos de pensamento
- substituicao de placeholders
- bloqueio de payload tecnico cru
- deteccao de valor de frete sem evidencia
- deteccao de valor PIX sem evidencia

### `npm run test:ai:transcripts`

Arquivos:
- [scripts/test-ai-transcripts.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/test-ai-transcripts.mjs)
- [scripts/ai-transcript-benchmark.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/ai-transcript-benchmark.mjs)

Cobre:

- benchmark de comportamento por cenarios reais
- contratos de fluxo (`nao_pula_etapa`, `usa_midia_certa`, `segue_fluxo_roleta`)
- score por criterio
- dataset versionado de transcripts (`AI_TRANSCRIPT_DATASET_VERSION`)

### `npm run test:ai:transcripts:multi`

Arquivo: [scripts/test-ai-transcripts-multirun.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/test-ai-transcripts-multirun.mjs)

Cobre:

- reexecucao da mesma bateria de transcripts em `N` rodadas
- media, minimo, maximo e desvio padrao do benchmark
- deteccao de instabilidade entre execucoes

Voce pode mudar o numero de rodadas com:

```powershell
$env:AI_TRANSCRIPT_RUNS="10"
npm run test:ai:transcripts:multi
```

### `npm run test:ai:metrics`

Arquivo: [scripts/test-ai-metrics.mjs](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/scripts/test-ai-metrics.mjs)

Cobre:

- resumo final de metricas do turno
- classificacao de resultado (`payload`, `text`, `blocked`, `failed`)
- contagem de guardrails e falhas
- consolidacao de uso de tools no turno

## Arquivos principais da base de IA

- [src/lib/ai/orchestrator.ts](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/src/lib/ai/orchestrator.ts)
- [src/lib/ai/toolHandler.ts](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/src/lib/ai/toolHandler.ts)
- [src/lib/ai/heuristics.ts](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/src/lib/ai/heuristics.ts)
- [src/lib/ai/toolRules.ts](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/src/lib/ai/toolRules.ts)
- [src/lib/ai/orchestratorRules.ts](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/src/lib/ai/orchestratorRules.ts)
- [src/lib/ai/aiMetrics.ts](c:/Users/USER/Desktop/meu-servidor-whatsapp/crm-whats/src/lib/ai/aiMetrics.ts)

## Observacoes

### Sobre o aviso `MODULE_TYPELESS_PACKAGE_JSON`

Durante os testes pode aparecer um aviso do Node informando:

`MODULE_TYPELESS_PACKAGE_JSON`

Isso significa:

- o `package.json` nao declara `"type": "module"`
- os arquivos testados usam `import` / `export`
- o Node detecta sintaxe ESM e reinterpreta o arquivo automaticamente

Impacto:

- e apenas um aviso
- os testes continuam funcionando
- nao e erro de execucao

No estado atual, esse aviso pode ser ignorado com seguranca.

### Sobre o `cart_snapshot`

O codigo da IA agora usa `chats.cart_snapshot`.

Se esse campo nao existir no banco, a memoria operacional do carrinho nao sera persistida corretamente.

SQL minimo:

```sql
alter table public.chats
  add column if not exists cart_snapshot jsonb;
```

## Quando rodar

Rode `npm run test:ai:all`:

- antes de subir mudancas da IA
- depois de alterar regras de desconto, carrossel, frete ou prompt operacional
- antes de testar conversa manual no WhatsApp
- quando houver regressao em fluxo comercial

## Limites atuais

Esses testes ainda nao cobrem:

- Supabase real
- Gemini real
- UAZAPI real
- webhook completo
- conversa fim a fim com persistencia real

Ou seja: eles validam a base logica da IA, nao a integracao completa em producao.

## Backlog de Produto (Prioridade Alta)

- Dashboard de metricas de vendas:
  usar os dados de `automation_runs` para mostrar ao lojista quanto dinheiro a Haley recuperou em carrinhos abandonados nos ultimos 7 dias.
