import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getNodeSelf } from "../src/node-self";

const ENV_KEYS = ["REGISTRY_SERVICE_URL", "NODE_ENV"] as const;

describe("getNodeSelf", () => {
  let saved: Record<string, string | undefined>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });

  it("returns the parsed node self info on a 200 response", async () => {
    const info = {
      did: "did:imajin:jin",
      nodeOperatorDid: "did:imajin:operator",
      nodeFeeBps: 50,
      buyerCreditBps: 25,
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => info });

    expect(await getNodeSelf()).toEqual(info);
  });

  it("calls the registry's node/self endpoint using REGISTRY_SERVICE_URL when set", async () => {
    process.env.REGISTRY_SERVICE_URL = "https://registry.example.com";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ did: "did:imajin:jin", nodeOperatorDid: null, nodeFeeBps: null, buyerCreditBps: null }),
    });

    await getNodeSelf();
    expect(fetchMock).toHaveBeenCalledWith("https://registry.example.com/registry/api/node/self");
  });

  it("falls back to the canonical dev port when REGISTRY_SERVICE_URL is unset", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ did: "did:imajin:jin", nodeOperatorDid: null, nodeFeeBps: null, buyerCreditBps: null }),
    });

    await getNodeSelf();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/registry/api/node/self");
  });

  it("returns null on a non-2xx response (e.g. 503 not configured)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Node identity not configured" }) });
    expect(await getNodeSelf()).toBeNull();
  });

  it("returns null when the fetch throws (network error)", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    expect(await getNodeSelf()).toBeNull();
  });
});
