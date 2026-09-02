import express from "express";

const app = express();

app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

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

app.get("/oauth/callback", (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({
      error,
      error_description,
    });
  }

  res.json({
    message: "OAuth callback received",
    code_received: Boolean(code),
    state_received: Boolean(state),
  });
});

app.get("/.well-known/oauth-client-metadata.json", (_req, res) => {
  res.json({
    client_id:
      "https://binance-sentinel.onrender.com/.well-known/oauth-client-metadata.json",
    client_name: "Binance Sentinel",
    client_uri: "https://binance-sentinel.onrender.com",
    redirect_uris: [
      "https://binance-sentinel.onrender.com/oauth/callback"
    ],
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Binance Sentinel backend running on port ${PORT}`);
});