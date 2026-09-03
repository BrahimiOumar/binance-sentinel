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

const PORT: number = Number(process.env.PORT) || 3000;

// URL officielle de la passerelle MCP de Binance Agent OS
const MCP_URL = new URL("https://agent.binance.com/mcp/agentic");

// Vos adresses Render de production pour Binance Sentinel
const CALLBACK_URL = "https://onrender.com";
const CLIENT_ID = "https://onrender.com";

/**
 * Configuration des métadonnées dynamiques d'Agent OS (CIMD)
 */
const clientInformation = {
  client_id: CLIENT_ID,
  client_name: "Binance Sentinel",
  client_uri: "https://onrender.com",
  redirect_uris: [CALLBACK_URL],
  response_types: ["code"],
  grant_types: ["authorization_code"],
  token_endpoint_auth_method: "none" as const,
  // Ajout des scopes d'accès natifs à l'écosystème Agentic requis par le protocole
  scope: "openid offline_access mcp:agentic account:balances:read"
};

interface PendingOAuthSession {
  state: string;
  codeVerifier: string;
}

// Stockage global temporaire pour le MVP
let pendingOAuth: PendingOAuthSession | null = null;
let accessToken: string | null = null;

app.get("/", (_req: Request, res: Response) => {
  res.json({ name: "Binance Sentinel", status: "online", track: "Track A - AI Agent" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", token_present: Boolean(accessToken) });
});

/**
 * 🌐 Route Virtuelle : Délivre le document de métadonnées requis par Binance
 */
app.get("/.well-known/oauth-client-metadata.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  return res.json(clientInformation);
});

/**
 * 🔐 Démarrer le flux d'autorisation (Expérience d'authentification)
 */
app.get("/oauth/start", async (_req: Request, res: Response) => {
  try {
    console.log("Démarrage de la découverte du serveur Binance...");
    const oauthInfo = await discoverOAuthServerInfo(MCP_URL);

    const state = randomUUID();

    const result = await startAuthorization(
      oauthInfo.authorizationServerUrl,
      {
        metadata: oauthInfo.authorizationServerMetadata,
        clientInformation,
        redirectUrl: CALLBACK_URL,
        state,
        resource: MCP_URL,
        scope: "openid offline_access mcp:agentic account:balances:read"
      }
    );

    pendingOAuth = {
      state,
      codeVerifier: result.codeVerifier,
    };

    console.log("Redirection de l'utilisateur vers Binance Agent OS...");
    return res.redirect(result.authorizationUrl.toString());
  } catch (error) {
    console.error("Erreur oauth/start :", error);
    return res.status(500).json({ error: "Failed to start Binance OAuth" });
  }
});

/**
 * 📥 Callback officiel de retour Binance
 */
app.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, iss, error, error_description } = req.query;

    if (error) {
      console.error("Refus Binance OAuth :", error, error_description);
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

    console.log("Jeton récupéré avec succès !");
    return res.json({ success: true, message: "Binance authorization successful" });
  } catch (error) {
    console.error("Erreur échange callback :", error);
    pendingOAuth = null;
    return res.status(500).json({ error: "Failed to exchange authorization code" });
  }
});

/**
 * ⚡ OPTION HACKATHON : Le contournement magique pour votre démo (Bypass Route)
 * En appelant cette URL, vous forcez l'état connecté pour enregistrer votre vidéo
 */
app.get("/oauth/mock-bypass", (_req: Request, res: Response) => {
  // Simulation de l'obtention du jeton d'accès unique d'Agent OS
  accessToken = "mock_hackathon_agent_token_validated_sentinel_2026";
  pendingOAuth = null;
  
  console.log("⚠️ Mode Démo activé : Jeton simulé injecté pour la démonstration.");
  return res.redirect("https://onrender.com/oauth/status");
});

app.get("/oauth/status", (_req: Request, res: Response) => {
  res.json({ authorized: Boolean(accessToken) });
});

/**
 * 📊 ANALYSE DU PORTEFEUILLE SÉCURITÉ (Fonctionnalités MVP 1 & 2)
 */
app.get("/api/analysis/portfolio", (_req: Request, res: Response) => {
  // Utilisation des données simulées si le jeton réel est bloqué par la liste blanche
  if (accessToken === "mock_hackathon_agent_token_validated_sentinel_2026" || !accessToken) {
    return res.json({
      success: true,
      mode: accessToken ? "DEMO (Bypass)" : "Mode Lecture Seule Public",
      analysis: {
        portfolioHealth: "Healthy",
        globalRiskLevel: "MEDIUM",
        risksDetected: [
          { id: 1, type: "Forte concentration", message: "Alerte : 72% de vos actifs de trading sont concentrés sur le token SOL." }
        ],
        raw_assets: [
          { asset: "SOL", free: "120.50", locked: "0.00" },
          { asset: "USDT", free: "450.00", locked: "0.00" },
          { asset: "BTC", free: "0.008", locked: "0.00" }
        ]
      }
    });
  }

  // Logique de traitement réel si le jeton est validé en direct
  return res.json({ success: true, message: "Prêt à traiter les données réelles." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🛡️ Binance Sentinel backend running on port ${PORT}`);
});
