import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import cors from "cors";
import {
  discoverOAuthServerInfo,
  startAuthorization,
  exchangeAuthorization,
} from "@modelcontextprotocol/client";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

// ====================== CONFIGURATION ======================
const BASE_URL = "https://binance-sentinel.onrender.com";

const MCP_URL = new URL("https://agent.binance.com/mcp/agentic");
const CALLBACK_URL = `${BASE_URL}/oauth/callback`;
const CLIENT_ID = BASE_URL;

const clientInformation = {
  client_id: CLIENT_ID,
  client_name: "Binance Sentinel",
  client_uri: BASE_URL,
  redirect_uris: [CALLBACK_URL],
  response_types: ["code"],
  grant_types: ["authorization_code"],
  token_endpoint_auth_method: "none" as const,
  scope: "openid offline_access mcp:agentic account:balances:read account:positions:read"
};
// ===========================================================

interface PendingOAuthSession {
  state: string;
  codeVerifier: string;
}

let pendingOAuth: PendingOAuthSession | null = null;
let accessToken: string | null = null;

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Binance Sentinel",
    status: "online",
    track: "Track A - AI Agent",
    mode: accessToken ? (accessToken.startsWith("mock_") ? "DEMO" : "LIVE") : "NOT_CONNECTED"
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    token_present: Boolean(accessToken),
    mode: accessToken?.startsWith("mock_") ? "DEMO" : accessToken ? "LIVE" : "NONE"
  });
});

// Client ID Metadata Document
app.get("/.well-known/oauth-client-metadata.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.json(clientInformation);
});

// Démarrer OAuth
app.get("/oauth/start", async (_req: Request, res: Response) => {
  try {
    console.log("→ Découverte du serveur OAuth Binance...");
    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);

    const state = randomUUID();

    const result = await startAuthorization(oauthInfo.authorizationServerUrl, {
      metadata: oauthInfo.authorizationServerMetadata,
      clientInformation,
      redirectUrl: CALLBACK_URL,
      state,
      resource: MCP_URL,
      scope: clientInformation.scope
    });

    pendingOAuth = {
      state,
      codeVerifier: result.codeVerifier,
    };

    console.log("→ Redirection vers Binance...");
    return res.redirect(result.authorizationUrl.toString());
  } catch (error: any) {
    console.error("Erreur /oauth/start :", error?.message || error);
    return res.status(500).json({
      error: "Failed to start OAuth",
      details: error?.message || "Unknown error"
    });
  }
});

// Callback
app.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, iss, error, error_description } = req.query;

    if (error) {
      console.error("Refus Binance :", error, error_description);
      return res.status(400).json({ error, error_description });
    }

    if (!pendingOAuth || !state || String(state) !== pendingOAuth.state) {
      return res.status(400).json({ error: "Invalid OAuth state" });
    }

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);

    const tokens = await exchangeAuthorization(oauthInfo.authorizationServerUrl, {
      metadata: oauthInfo.authorizationServerMetadata,
      clientInformation,
      authorizationCode: String(code),
      iss: iss ? String(iss) : undefined,
      codeVerifier: pendingOAuth.codeVerifier,
      redirectUri: CALLBACK_URL,
      resource: MCP_URL,
    });

    accessToken = tokens.access_token;
    pendingOAuth = null;

    console.log("✅ Autorisation réussie !");
    return res.json({
      success: true,
      message: "Binance authorization successful",
      mode: "LIVE"
    });
  } catch (error: any) {
    console.error("Erreur callback :", error?.message || error);
    pendingOAuth = null;
    return res.status(500).json({
      error: "Failed to exchange authorization code",
      details: error?.message
    });
  }
});

// Mode DEMO (pour la vidéo du hackathon)
app.get("/oauth/mock-bypass", (_req: Request, res: Response) => {
  accessToken = "mock_hackathon_agent_token_validated_sentinel_2026";
  pendingOAuth = null;
  console.log("⚠️ Mode DEMO activé");
  return res.redirect(`${BASE_URL}/oauth/status`);
});

app.get("/oauth/status", (_req: Request, res: Response) => {
  res.json({
    authorized: Boolean(accessToken),
    mode: accessToken?.startsWith("mock_") ? "DEMO" : accessToken ? "LIVE" : "NONE"
  });
});

// Analyse portefeuille (MVP Sentinel)
app.get("/api/analysis/portfolio", async (_req: Request, res: Response) => {
  if (!accessToken || accessToken.startsWith("mock_")) {
    return res.json({
      success: true,
      mode: accessToken ? "DEMO" : "NOT_CONNECTED",
      analysis: {
        portfolioHealth: "Healthy",
        globalRiskLevel: "MEDIUM",
        risksDetected: [
          {
            id: 1,
            type: "Forte concentration",
            severity: "medium",
            message: "72% de l'exposition est concentrée sur SOL"
          },
          {
            id: 2,
            type: "Volatilité",
            severity: "medium",
            message: "Conditions de marché actuellement volatiles"
          }
        ],
        assets: [
          { asset: "SOL", free: "120.50", locked: "0.00", percentage: 72 },
          { asset: "USDT", free: "450.00", locked: "0.00", percentage: 20 },
          { asset: "BTC", free: "0.008", locked: "0.00", percentage: 8 }
        ],
        summary: "Portefeuille globalement sain mais avec une concentration élevée sur SOL."
      }
    });
  }

  // TODO: Appel réel aux tools MCP avec accessToken
  return res.json({
    success: true,
    mode: "LIVE",
    message: "Prêt à récupérer les vraies données via MCP"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🛡️ Binance Sentinel running on port ${PORT}`);
  console.log(`→ BASE_URL: ${BASE_URL}`);
});
