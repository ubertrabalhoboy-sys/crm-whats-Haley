# CRM Whats — SaaS de CRM & Automação WhatsApp

Plataforma SaaS multitenant para gerenciar atendimento ao cliente e funil de vendas via WhatsApp, com Inteligência Artificial integrada.

## ⚡ Stack

| Camada | Tecnologias |
|--------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS |
| **Backend** | Next.js API Routes (serverless), Supabase (PostgreSQL + Auth + Realtime) |
| **IA** | Google Gemini 2.5 Flash (function calling), OpenAI (fallback) |
| **Integrações** | Uazapi (WhatsApp API), Fiqon (Webhooks), Google Maps (frete) |

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│  Next.js App Router (SSR/CSR)                        │
│  ┌──────┐ ┌───────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │
│  │Inbox │ │Kanban │ │Dash  │ │Promo │ │Config    │  │
│  └──────┘ └───────┘ └──────┘ └──────┘ └──────────┘  │
├─────────────────────────────────────────────────────┤
│                   API ROUTES                         │
│  /api/webhook/uazapi  ← WhatsApp recebe mensagens   │
│  /api/chats           ← CRUD de conversas            │
│  /api/ai              ← Processamento IA             │
│  /api/settings        ← Config loja/IA               │
├─────────────────────────────────────────────────────┤
│              AI ORCHESTRATOR (lib/ai/)                │
│  orchestrator.ts → gemini → tools → uazapi (envio)   │
│  10 ferramentas: catálogo, carrinho, PIX, kanban...  │
├─────────────────────────────────────────────────────┤
│                   SUPABASE                           │
│  PostgreSQL + RLS (multitenant por restaurant_id)    │
│  Auth + Realtime (Kanban live updates)               │
└─────────────────────────────────────────────────────┘
```

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz com:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Uazapi (WhatsApp)
UAZAPI_BASE_URL=https://api.uazapi.com
UAZAPI_GLOBAL_API_KEY=sua_chave
UAZAPI_ADMIN_TOKEN=seu_token

# IA
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...                  # opcional

# Serviços Externos
GOOGLE_MAPS_API_KEY=AIza...            # opcional (cálculo de frete)
FIQON_WEBHOOK_URL=https://...          # opcional (automações)

# Configuração
AI_PREFIX_CACHE_MODE=enabled           # off | enabled
WEBHOOK_SECRET_TOKEN=seu_segredo       # proteção do webhook
```

## 🚀 Setup Local

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev
# → http://localhost:3000
```

## 🧪 Testes

```bash
# Rodar todos os testes de IA
npm run test:ai:all

# Testes individuais
npm run test:ai               # heurísticas
npm run test:ai:tools         # regras de ferramentas
npm run test:ai:flow          # fluxos de conversa
npm run test:ai:orchestrator  # regras do orquestrador
npm run test:ai:mocks         # integração com mocks
npm run test:ai:metrics       # métricas de turno
```

## 📂 Estrutura Principal

```
src/
├── app/
│   ├── (app)/          # Rotas autenticadas (dashboard, inbox, kanban...)
│   ├── (public)/       # Rotas públicas (login, onboarding)
│   └── api/            # API Routes (webhook, chats, settings...)
├── components/         # Componentes React compartilhados
└── lib/
    ├── ai/             # Motor de IA (orchestrator, tools, heuristics)
    ├── shared/         # Utilitários compartilhados (env, utils)
    ├── supabase/       # Clients Supabase (browser, server, SSR)
    └── automations/    # Engine de automações (Fiqon, triggers)
```

## 📋 Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção |
| `npm run lint` | ESLint |
| `npm run test:ai:all` | Suite completa de testes de IA |
