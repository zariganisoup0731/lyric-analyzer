require("dotenv").config();
const express = require("express");
const querystring = require("querystring");
const crypto = require("node:crypto");
const cookieParser = require("cookie-parser");

const clientId = process.env.SPOTIFY_API_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_API_CLIENT_SECRET;
const redirectUri = "http://127.0.0.1:3000/callback";
const app = express();

app.use((req, res, next) => {
  console.log(req.method, req.url, "| Cookie:", req.headers.cookie);
  next();
});
app.use(cookieParser());

const generateRandomString = (length) => {
  return crypto.randomBytes(60).toString("hex").slice(0, length);
}

const stateKey = "spotify_auth_state";

const port = 3000;
const server = app.listen(port, () => {
  console.log(`App listening on port ${port}`);
})

app.get("/login", (req, res) => {
  const state = generateRandomString(16);
  res.cookie(stateKey, state);
  const scope = "user-read-private user-read-email";

  res.redirect("https://accounts.spotify.com/authorize?" + 
    querystring.stringify({
      response_type: "code",
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUri,
      state: state
    }));
});

app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  console.log(state + ", " + storedState);

  try {
    if(state === null || state !== storedState) {
      res.clearCookie(stateKey);
      res.redirect("/#" + 
        querystring.stringify({
          error: "state_mismatch"
        }));
      throw new Error("state_mismatch");
    } else {
      res.clearCookie(stateKey);
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + (Buffer.from(clientId + ":" + clientSecret).toString("base64"))
        },
        body: new URLSearchParams({
          code: code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });
      if(response.status === 200) {
        const json = await response.json();
        const access_token = json.access_token;
        const refresh_token = json.refresh_token;
        res.send("認可成功");
      } else {
        res.redirect("/#" + 
          querystring.stringify({
            error: "invalid_token"
          }));
        throw new Error("invalid_token");
      }
    }
  } catch(error) {
    console.error(error.message);
    // process.exit(-1);
  }
})