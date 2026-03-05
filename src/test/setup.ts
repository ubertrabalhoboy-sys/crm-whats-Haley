import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock des variáveis de ambiente para testes
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";
process.env.GEMINI_API_KEY = "dummy-gemini-key";
process.env.UAZAPI_BASE_URL = "https://api.uazapi.com";
process.env.UAZAPI_GLOBAL_API_KEY = "dummy-uaz-key";
process.env.WEBHOOK_SECRET_TOKEN = "dummy-webhook-secret";

// Mock global do fetch se necessário
global.fetch = vi.fn();
