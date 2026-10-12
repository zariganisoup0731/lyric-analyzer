require("dotenv").config();
const express = require("express");
const querystring = require("querystring");

const client_id = process.env.SPOTIFY_API_CLIENT_ID;
const redirect_uri = "http://127.0.0.1:3000/callback";
const app = express();
const port = 3000;

const server = app.listen(port, () => {
  console.log(`App listening on port ${port}`);
  // console.log(JSON.stringify(server.address()));
})

app.get("/login", (req, res) => {
  // const state = generateRandomString(16);
  const scope = "user-read-private user-read-email";

  res.redirect("https://accounts.spotify.com/authorize?" + 
    querystring.stringify({
      response_type: "code",
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri
      // state: state
  }));
});

app.get("/callback", (req, res) => {
  console.log(req.query.code);
})