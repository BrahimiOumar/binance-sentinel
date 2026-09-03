import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import {
  discoverOAuthServerInfo,
  startAuthorization,
  exchangeAuthorization,
} from "@modelcontextprotocol/client";

const app = express();
app.use(express.json());

const PORT: number = Number(process.env.PORT) || 3000;

// URL officielle du protocole MCP Binance Agent OS
const MCP_URL = new URL("https://binance.com");

// Vos URLs Render de Production
const CALLBACK_URL = "https://onrender.com";
const CLIENT_ID = "https://onrender.com";

const clientInformation = {
  client_id: CLIENT_ID,
  client_name: "Binance Sentinel",
  redirect_uris: [CALLBACK_URL],
};

// Interface pour typer correctement la session temporaire OAuth
interface PendingOAuthSession {
  state: string;
  codeVerifier: string;
}

// Typage explicite pour corriger l'erreur de votre capture d'écran
let pendingOAuth: PendingOAuthSession | null = null;
let accessToken: string | null = null;

/**
 * 🛠️ Route qui sert le fichier de métadonnées requis par Binance
 */
app.get("/.well-known/oauth-client-metadata.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  return res.json({
    client_id: CLIENT_ID,
    client_name: "Binance Sentinel",
    redirect_uris: [CALLBACK_URL],
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none",
    scope: "market:read"
  });
});

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Binance Sentinel",
    status: "online",
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
  });
});

/**
 * Démarrer le flux de consentement Binance OAuth
 */
app.get("/oauth/start", async (_req: Request, res: Response) => {
  try {
    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);
    const state = randomUUID();

    const { authorizationUrl, codeVerifier } = await startAuthorization(
      oauthInfo.authorizationServerUrl,
      {
        metadata: oauthInfo.authorizationServerMetadata,
        clientInformation,
        redirectUrl: CALLBACK_URL,
        state,
        resource: MCP_URL,
        scope: "market:read"
      }
    );

    pendingOAuth = {
      state,
      codeVerifier,
    };

    console.log("Redirection vers Binance OAuth...");
    res.redirect(authorizationUrl.toString());
  } catch (error) {
    console.error("Erreur lors du démarrage OAuth :", error);
    res.status(500).json({ error: "Failed to start Binance OAuth" });
  }
});

/**
 * Redirection de retour après validation Binance
 */
app.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, iss, error, error_description } = req.query;

    if (error) {
      return res.status(400).json({ error, error_description });
    }

    if (!pendingOAuth || !state || String(state) !== pendingOAuth.state) {
      return res.status(400).json({ error: "Invalid OAuth state" });
    }

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
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

    accessToken = tokens.access_token;
    pendingOAuth = null;

    console.log("Authentification réussie !");

    return res.json({
      success: true,
      message: "Binance authorization successful",
      access_token_received: Boolean(accessToken),
    });
  } catch (error) {
    console.error("Erreur lors du traitement du callback OAuth :", error);
    return res.status(500).json({
      error: "Failed to exchange Binance authorization code",
    });
  }
});

app.get("/oauth/status", (_req: Request, res: Response) => {
  res.json({ authorized: Boolean(accessToken) });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend Binance Sentinel actif sur le port ${PORT}`);
});
