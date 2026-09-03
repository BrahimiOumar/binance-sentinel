import express from "express";
import { randomUUID } from "node:crypto";
import {
  discoverOAuthServerInfo,
  startAuthorization,
  exchangeAuthorization,
} from "@modelcontextprotocol/client";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

const MCP_URL = new URL(
  "https://agent.binance.com/mcp/agentic"
);

const CALLBACK_URL =
  "https://binance-sentinel.onrender.com/oauth/callback";

const CLIENT_ID =
  "https://binance-sentinel.onrender.com/.well-known/oauth-client-metadata.json";

/**
 * OAuth client metadata.
 *
 * Binance Agent OS supports CIMD, so our client_id is the public
 * metadata URL above.
 */
const clientInformation = {
  client_id: CLIENT_ID,
  client_name: "Binance Sentinel",
  client_uri: "https://binance-sentinel.onrender.com",
  redirect_uris: [CALLBACK_URL],
  response_types: ["code"],
  grant_types: ["authorization_code"],
  token_endpoint_auth_method: "none" as const,
};

/**
 * Temporary storage for the first MVP test.
 *
 * IMPORTANT:
 * This is intentionally global for now.
 * Later this must become per-user/session storage.
 */
let pendingOAuth: {
  state: string;
  codeVerifier: string;
} | null = null;

let accessToken: string | null = null;

app.get("/", (_req, res) => {
  res.json({
    name: "Binance Sentinel",
    status: "online",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

/**
 * Public Client Metadata Document
 *
 * Binance can retrieve this URL to identify our OAuth client.
 */
app.get(
  "/.well-known/oauth-client-metadata.json",
  (_req, res) => {
    res.json({
      client_id: CLIENT_ID,
      client_name: "Binance Sentinel",
      client_uri: "https://binance-sentinel.onrender.com",
      redirect_uris: [CALLBACK_URL],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
    });
  }
);

/**
 * Start Binance OAuth.
 */
app.get("/oauth/start", async (_req, res) => {
  try {
    console.log("Discovering Binance OAuth server...");

    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);

    console.log(
      "Authorization server:",
      oauthInfo.authorizationServerUrl
    );

    const state = randomUUID();

    const result = await startAuthorization(
      oauthInfo.authorizationServerUrl,
      {
        metadata: oauthInfo.authorizationServerMetadata,
        clientInformation,
        redirectUrl: CALLBACK_URL,
        state,
        resource: MCP_URL,
      }
    );

    pendingOAuth = {
      state,
      codeVerifier: result.codeVerifier,
    };

    console.log("OAuth state created.");
    console.log("Redirecting user to Binance...");

    return res.redirect(result.authorizationUrl.toString());
  } catch (error) {
    console.error("OAuth start error:", error);

    return res.status(500).json({
      error: "Failed to start Binance OAuth",
    });
  }
});

/**
 * Binance OAuth callback.
 */
app.get("/oauth/callback", async (req, res) => {
  try {
    const code =
      typeof req.query.code === "string"
        ? req.query.code
        : undefined;

    const state =
      typeof req.query.state === "string"
        ? req.query.state
        : undefined;

    const iss =
      typeof req.query.iss === "string"
        ? req.query.iss
        : undefined;

    const error =
      typeof req.query.error === "string"
        ? req.query.error
        : undefined;

    const errorDescription =
      typeof req.query.error_description === "string"
        ? req.query.error_description
        : undefined;

    /**
     * Binance rejected/cancelled authorization.
     */
    if (error) {
      console.error(
        "Binance OAuth error:",
        error,
        errorDescription ?? ""
      );

      return res.status(400).json({
        error,
        error_description: errorDescription ?? null,
      });
    }

    /**
     * We need an OAuth transaction.
     */
    if (!pendingOAuth) {
      return res.status(400).json({
        error: "No pending OAuth transaction",
      });
    }

    /**
     * Validate state BEFORE exchanging the authorization code.
     */
    if (!state || state !== pendingOAuth.state) {
      console.error("OAuth state mismatch.");

      pendingOAuth = null;

      return res.status(400).json({
        error: "Invalid OAuth state",
      });
    }

    /**
     * Authorization code is mandatory.
     */
    if (!code) {
      pendingOAuth = null;

      return res.status(400).json({
        error: "Missing authorization code",
      });
    }

    console.log("OAuth callback received.");
    console.log("Authorization code received: yes");

    /**
     * Discover the authorization server again.
     */
    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);

    /**
     * Exchange authorization code for Binance Agent OS token.
     */
    const tokens = await exchangeAuthorization(
      oauthInfo.authorizationServerUrl,
      {
        metadata: oauthInfo.authorizationServerMetadata,
        clientInformation,
        authorizationCode: code,
        iss,
        codeVerifier: pendingOAuth.codeVerifier,
        redirectUri: CALLBACK_URL,
        resource: MCP_URL,
      }
    );

    /**
     * NEVER log the actual token.
     */
    accessToken = tokens.access_token;

    /**
     * OAuth transaction completed.
     */
    pendingOAuth = null;

    console.log(
      "Binance OAuth authorization successful."
    );

    return res.json({
      success: true,
      message: "Binance authorization successful",
      access_token_received: Boolean(tokens.access_token),
      token_type: tokens.token_type ?? null,
      expires_in: tokens.expires_in ?? null,
    });
  } catch (error) {
    console.error("OAuth callback error:", error);

    pendingOAuth = null;

    return res.status(500).json({
      error: "Failed to exchange Binance authorization code",
    });
  }
});

/**
 * OAuth status.
 *
 * Temporary endpoint for testing.
 */
app.get("/oauth/status", (_req, res) => {
  res.json({
    authorized: Boolean(accessToken),
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Binance Sentinel backend running on port ${PORT}`
  );
});