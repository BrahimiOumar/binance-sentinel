import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const endpoint = "https://agent.binance.com/mcp/agentic";

const client = new Client({
  name: "binance-sentinel",
  version: "1.0.0",
});

const transport = new StreamableHTTPClientTransport(
  new URL(endpoint)
);

try {
  console.log("Connecting to Binance Agent OS...");

  await client.connect(transport);

  console.log("CONNECTED!");

  const result = await client.listTools();

  console.log("\nAvailable tools:");

  for (const tool of result.tools) {
    console.log(`- ${tool.name}`);
  }

  await transport.close();
} catch (error) {
  console.error("\nConnection failed:");
  console.error(error);
}