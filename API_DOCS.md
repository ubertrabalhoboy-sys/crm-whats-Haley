# Fiqon CRM WhatsApp - API Reference

This document provides a high-level overview of the internal API endpoints available in the Next.js `src/app/api` directory. These endpoints power the Fiqon CRM frontend and handle external webhooks.

> **Note:** Unless otherwise specified, API requests made from the frontend to these endpoints rely on Supabase SSR (Server-Side Rendering) cookies for authentication. Webhooks rely on specific token verification.

---

## 1. Integrations & Webhooks

Endpoints responsible for connecting with external services (WhatsApp via Uazapi, Fiqon).

### WhatsApp & Uazapi
- `POST /api/webhook/uazapi`
  - **Description**: Primary webhook receiver for inbound WhatsApp text and status updates from Uazapi.
  - **Security**: Requires a secret token via `x-webhook-secret` header or `?secret=` query parameter that matches `WEBHOOK_SECRET_TOKEN`.

- `POST /api/whatsapp/connect`
  - **Description**: Connects or pairs a new WhatsApp instance.
- `GET /api/whatsapp/status`
  - **Description**: Retrieves the connection status of the current WhatsApp instance.
- `POST /api/whatsapp/instance/ensure`   | `POST /api/whatsapp/instance/delete`
  - **Description**: Lifecycle management for the Uazapi WhatsApp instances.
- `GET /api/whatsapp/webhook/inspect`  | `POST /api/whatsapp/webhook/configure`
  - **Description**: Inspects and configures the Uazapi webhook URL to point to this application.

### Fiqon
- `POST /api/integrations/fiqon/button`
  - **Description**: Handles external button interactions or triggers from the Fiqon integration.

---

## 2. Artificial Intelligence

Endpoints managing the Fiqon AI engine (Gemini) and AI metrics.

- `POST /api/ai/process`
  - **Description**: Invokes the core `orchestrator.ts` flow to process incoming WhatsApp messages through the AI pipeline and send a reply.
- `GET /api/ai/metrics`
  - **Description**: Retrieves execution metrics, AI response latency, and usage tokens for dashboard analysis.

---

## 3. CRM, Chats & Messages

Endpoints for the Kanban CRM interface, chat history, and manual messaging.

- `GET /api/chats`
  - **Description**: Lists all active chats for the Kanban board.
- `GET /api/chats/[id]/messages`
  - **Description**: Retrieves the message history for a specific chat.
- `POST /api/chats/[id]/read`
  - **Description**: Marks a specific chat as read.
- `POST /api/chats/[id]/kanban`
  - **Description**: Updates the Kanban stage/status for a specific chat.
- `GET /api/kanban-stages`
  - **Description**: Lists the configured Kanban columns/stages for the restaurant.
  
- `GET /api/messages`
  - **Description**: General message retrieval.
- `POST /api/messages/send`
  - **Description**: Sends a manual text message or payload to a lead from the CRM interface.

---

## 4. E-commerce & Orders

Endpoints handling catalog, storefront configuration, cart calculations, and checkout.

- `GET /api/store/info`
  - **Description**: Public endpoint to fetch basic store information (name, logo, open status).
- `GET /api/settings/store` | `POST /api/settings/store`
  - **Description**: Manages backend settings for the store (business hours, delivery area, etc.).
- `GET /api/promocoes` | `POST /api/promocoes` | `DELETE /api/promocoes`
  - **Description**: CRUD operations for the restaurant's product catalog and promotions.

- `POST /api/order/calculate`
  - **Description**: Calculates cart total (subtotal + delivery fee - discounts).
- `POST /api/order/pix`
  - **Description**: Generates a dynamic Pix code for order payment.
- `POST /api/order/submit`
  - **Description**: Finalizes an order, saves it to the database, and clears the active cart.

---

## 5. Gamification (Roleta)

Endpoints related to the interactive "Discount Roulette" game.

- `GET /api/roleta` | `POST /api/roleta`
  - **Description**: Fetches or updates general roulette configurations.
- `GET /api/roleta/branding` | `POST /api/roleta/branding`
  - **Description**: Manages visual customization (colors, logo) for the roulette interface.
- `GET /api/roleta/stats`
  - **Description**: Retrieves statistics on roulette usage and prizes won.
- `GET /api/play/[restaurantId]/prizes`
  - **Description**: Public endpoint for the roulette web app to fetch available prizes.
- `POST /api/play/[restaurantId]/spin`
  - **Description**: Processes a user's spin, determines the prize, and registers the winning.

---

## 6. Dashboard, Admin & Background Jobs

Endpoints for administrative insights and background tasks.

- `GET /api/dashboard`
  - **Description**: Fetches aggregated statistics (total sales, active chats, AI intervention rate) for the main dashboard.
- `GET /api/notifications` | `PATCH /api/notifications`
  - **Description**: Retrieves and manages unread notifications for the restaurant owner.
- `POST /api/onboarding/create-restaurant`
  - **Description**: Provisions a new restaurant account in the system during onboarding.
- `POST /api/automations/test`
  - **Description**: Tests execution of a configured CRM automation.
- `POST /api/cron/process-queue`
  - **Description**: Background job endpoint for processing delayed events (e.g., sending a coupon after N minutes).
