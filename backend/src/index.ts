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

const MCP_URL = new URL("https://agent.binance.com/mcp/agentic");

const CALLBACK_URL =
  "https://binance-sentinel.onrender.com/oauth/callback";

const CLIENT_ID =
  "https://binance-sentinel.onrender.com/.well-known/oauth-client-metadata.json";

const clientInformation = {
  client_id: CLIENT_ID,
  client_name: "Binance Sentinel",
  redirect_uris: [CALLBACK_URL],
};

// TEMPORAIRE : uniquement pour notre premier test.
// En production, ce sera stocké par utilisateur/session.
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
 * Start Binance OAuth
 */
app.get("/oauth/start", async (_req, res) => {
  try {
    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);

    const state = randomUUID();

    const { authorizationUrl, codeVerifier } =
      await startAuthorization(
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
      codeVerifier,
    };

    console.log("Redirecting user to Binance OAuth...");

    res.redirect(authorizationUrl.toString());
  } catch (error) {
    console.error("OAuth start error:", error);

    res.status(500).json({
      error: "Failed to start Binance OAuth",
    });
  }
});

/**
 * Binance OAuth callback
 */

app.get("/.well-known/oauth-client-metadata.json", (_req, res) => {
  res.json({
    client_id: CLIENT_ID,
    client_name: "Binance Sentinel",
    redirect_uris: [CALLBACK_URL],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "openid profile", // ajuste selon les scopes que le MCP expose
  });
});


app.get("/oauth/callback", async (req, res) => {
  try {
    const {
      code,
      state,
      iss,
      error,
      error_description,
    } = req.query;

    // User denied/cancelled authorization
    if (error) {
      return res.status(400).json({
        error,
        error_description,
      });
    }

    // Validate OAuth state
    if (
      !pendingOAuth ||
      !state ||
      String(state) !== pendingOAuth.state
    ) {
      return res.status(400).json({
        error: "Invalid OAuth state",
      });
    }

    // Authorization code is required
    if (!code) {
      return res.status(400).json({
        error: "Missing authorization code",
      });
    }

    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);

    const tokens = await exchangeAuthorization(
      oauthInfo.authorizationServerUrl,
      {
        metadata: oauthInfo.authorizationServerMetadata,
        clientInformation,
        authorizationCode: String(code),
        iss: iss ? String(iss) : undefined,
        codeVerifier: pendingOAuth.codeVerifier,
        redirectUri: CALLBACK_URL,
        resource: MCP_URL,
      }
    );

    // Store temporarily for our first test.
    // NEVER log the token.
    accessToken = tokens.access_token;

    pendingOAuth = null;

    console.log("Binance OAuth authorization successful.");

    return res.json({
      success: true,
      message: "Binance authorization successful",
      access_token_received: Boolean(accessToken),
      token_type: tokens.token_type ?? null,
    });
  } catch (error) {
    console.error("OAuth callback error:", error);

    return res.status(500).json({
      error: "Failed to exchange Binance authorization code",
    });
  }
});

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