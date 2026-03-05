import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  return {
    createSupabaseServerClient: vi.fn(),
    createClient: vi.fn(),
    state: {
      restaurantId: "rest-1",
      restaurantRow: {
        id: "rest-1",
        uaz_instance_token: "token-1",
        uaz_status: "disconnected",
        uaz_phone: null,
      },
      existingNotification: false,
      insertedNotifications: [] as Record<string, unknown>[],
      restaurantUpdates: [] as Record<string, unknown>[],
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocked.createSupabaseServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocked.createClient,
}));

function makeServerSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { restaurant_id: mocked.state.restaurantId },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "restaurants") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: mocked.state.restaurantRow,
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected server table access: ${table}`);
    },
  };
}

function makeAdminSupabaseClient() {
  return {
    from: (table: string) => {
      if (table === "notifications") {
        return {
          select: () => {
            const chain = {
              eq: vi.fn(() => chain),
              gte: vi.fn(() => chain),
              limit: vi.fn(async () => ({
                data: mocked.state.existingNotification ? [{ id: "notif-1" }] : [],
                error: null,
              })),
            };
            return chain;
          },
          insert: async (payload: Record<string, unknown>) => {
            mocked.state.insertedNotifications.push(payload);
            return { error: null };
          },
        };
      }

      if (table === "restaurants") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: async () => {
              mocked.state.restaurantUpdates.push(values);
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`Unexpected admin table access: ${table}`);
    },
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runGet() {
  const { GET } = await import("./route");
  return GET();
}

describe("WhatsApp status diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mocked.state.restaurantRow = {
      id: "rest-1",
      uaz_instance_token: "token-1",
      uaz_status: "disconnected",
      uaz_phone: null,
    };
    mocked.state.existingNotification = false;
    mocked.state.insertedNotifications = [];
    mocked.state.restaurantUpdates = [];

    mocked.createSupabaseServerClient.mockResolvedValue(makeServerSupabaseClient());
    mocked.createClient.mockReturnValue(makeAdminSupabaseClient());
    vi.mocked(global.fetch).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns connected state without creating proactive warning", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        instance: { state: "open" },
        connected: true,
        loggedIn: true,
      })
    );

    const res = await runGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.status).toBe("open");
    expect(body.statusReasonCode).toBeNull();
    expect(mocked.state.insertedNotifications).toHaveLength(0);
    expect(mocked.state.restaurantUpdates).toHaveLength(1);
    expect(mocked.state.restaurantUpdates[0]).toMatchObject({ uaz_status: "open" });
  });

  it("maps battery issue and creates warning notification", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        status: "close",
        reason: "battery low",
        battery: 14,
        connected: false,
        loggedIn: false,
      })
    );

    const res = await runGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.statusReasonCode).toBe("PHONE_BATTERY_LOW");
    expect(String(body.statusReason)).toContain("Bateria");
    expect(body.batteryPercent).toBe(14);
    expect(mocked.state.insertedNotifications).toHaveLength(1);
    expect(mocked.state.insertedNotifications[0]).toMatchObject({
      restaurant_id: "rest-1",
      type: "warning",
      title: "Bateria baixa no celular pareado",
    });
  });

  it("does not create duplicate warning when a recent unread one already exists", async () => {
    mocked.state.existingNotification = true;
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        status: "disconnected",
        reason: "network unstable",
        connected: false,
        loggedIn: false,
      })
    );

    const res = await runGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.statusReasonCode).toBe("PHONE_NETWORK_UNSTABLE");
    expect(mocked.state.insertedNotifications).toHaveLength(0);
  });

  it("falls back to DB status when upstream fails and marks upstream health", async () => {
    mocked.state.restaurantRow.uaz_status = "disconnected";
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ message: "timeout upstream" }, 502)
    );

    const res = await runGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.upstreamHealthy).toBe(false);
    expect(body.status).toBe("disconnected");
    expect(body.statusReasonCode).toBe("UPSTREAM_ERROR");
    expect(mocked.state.restaurantUpdates).toHaveLength(0);
    expect(mocked.state.insertedNotifications).toHaveLength(1);
    expect(mocked.state.insertedNotifications[0]).toMatchObject({
      type: "warning",
      title: "Provedor WhatsApp indisponível",
    });
  });
});
