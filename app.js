require("dotenv").config();
const express = require("express");
const querystring = require("querystring");
const crypto = require("node:crypto");
const cookieParser = require("cookie-parser");

const spotifyClientId = process.env.SPOTIFY_API_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_API_CLIENT_SECRET;
let spotifyAccessToken;
let spotifyRefreshToken;
const redirectUri = "http://127.0.0.1:3000/callback";

const generateRandomString = (length) => {
  return crypto.randomBytes(60).toString("hex").slice(0, length);
}

const stateKey = "spotify_auth_state";

const app = express();
app.use(cookieParser());
const port = 3000;
const server = app.listen(port, () => {
  console.log(`App listening on port ${port}`);
})

// spotifyAPI authorization flow
app.get("/login", (req, res) => {
  const state = generateRandomString(16);
  res.cookie(stateKey, state);
  const scope = "user-read-currently-playing";

  res.redirect("https://accounts.spotify.com/authorize?" + 
    querystring.stringify({
      response_type: "code",
      client_id: spotifyClientId,
      scope: scope,
      redirect_uri: redirectUri,
      state: state
    }));
});

app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  try {
    if(state === null || state !== storedState) {
      res.clearCookie(stateKey);
      res.status(400).send({
        error: "state_mismatch"
      });
      throw new Error("state_mismatch");
    } else {
      res.clearCookie(stateKey);
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + (Buffer.from(spotifyClientId + ":" + spotifyClientSecret).toString("base64"))
        },
        body: new URLSearchParams({
          code: code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });
      if(response.status === 200) {
        const json = await response.json();
        spotifyAccessToken = json.access_token;
        spotifyRefreshToken = json.refresh_token;
        res.redirect(`/currentPlayingTracks`);
      } else {
        res.status(400).send({
          error: "invalid_token"
        })
        throw new Error("invalid_token");
      }
    }
  } catch(error) {
    console.error(error.message);
    if(!res.headersSent) {
      res.status.send(500).send({
        error: "internal_server_error"
      });
    }
  }
})

let currentlyPlayingTrackName;
// get currentlyPlayingTracks Info
app.get("/currentPlayingTracks", async (req, res) => {
  try {
    const currentlyPlayingTrack = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      method: "GET",
      headers : {
        "Authorization": "Bearer " + spotifyAccessToken
      }
    });
    if(currentlyPlayingTrack.status === 200) {
      const currentlyPlayingTrackJson = await currentlyPlayingTrack.json();
      // console.log(Object.keys(currentlyPlayingTrackJson));
      // console.log(Object.keys(currentlyPlayingTrackJson.item));
      // console.log(currentlyPlayingTrackJson.item.name);
      currentlyPlayingTrackName = currentlyPlayingTrackJson.item.name;
      res.status(200).json(currentlyPlayingTrackJson);
    } else if(currentlyPlayingTrack.status === 204) {
      res.status(204).send("再生中の楽曲がありません。");
    } else {
      const currentlyPlayingTrackJson = await currentlyPlayingTrack.json();
      res.status(400).send({
        error: currentlyPlayingTrackJson.error.message
      });
      throw new Error(currentlyPlayingTrackJson.error.message);
    }
  } catch(error) {
    console.error(error.message);
    if(!res.headersSent) {
      res.status.send(500).send({
        error: "internal_server_error"
      });
    }
  }
})