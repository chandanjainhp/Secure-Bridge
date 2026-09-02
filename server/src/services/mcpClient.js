import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function normalizeMcpServerUrl() {
  const configuredUrl = process.env.MCP_SERVER_URL?.trim();
  const base =
    configuredUrl ||
    `http://${process.env.MCP_SERVER_HOST || "127.0.0.1"}:${process.env.MCP_SERVER_PORT || "8787"}`;
  const normalizedBase = base.replace(/\/$/, "");

  if (/^https?:\/\//i.test(normalizedBase)) {
    return normalizedBase.endsWith("/mcp")
      ? normalizedBase
      : `${normalizedBase}/mcp`;
  }

  if (normalizedBase.includes("://")) {
    return normalizedBase;
  }

  return `${normalizedBase}/mcp`;
}

export async function createMcpClient() {
  if (process.env.ENABLE_MCP !== "true") {
    return null;
  }

  const url = normalizeMcpServerUrl();

  try {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      fetch: globalThis.fetch.bind(globalThis),
    });

    const client = new Client(
      { name: "secure-bridge-server", version: "1.0.0" },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);
    return client;
  } catch (error) {
    console.warn(
      "[mcpClient] MCP server unavailable; continuing without MCP tools.",
      error?.message || error,
    );
    return null;
  }
}

export async function listMcpToolsForAiSdk() {
  if (process.env.ENABLE_MCP !== "true") {
    return {};
  }

  try {
    const client = await createMcpClient();
    if (!client) return {};

    const result = await client.listTools();
    const tools = {};

    for (const tool of result.tools || []) {
      tools[tool.name] = {
        description: tool.description || "MCP tool",
        parameters: tool.inputSchema || {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
        execute: async (args = {}) => {
          const response = await client.callTool({
            name: tool.name,
            arguments: args,
          });
          return response;
        },
      };
    }

    return tools;
  } catch (error) {
    console.warn(
      "[mcpClient] Failed to list MCP tools.",
      error?.message || error,
    );
    return {};
  }
}
