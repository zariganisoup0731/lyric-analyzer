import "dotenv/config";
import express from "express";
import querystring from "querystring";
import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import { getLyrics } from "genius-lyrics-api";
import * as readline from "node:readline";
import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import kuromoji from "kuromoji";

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
app.listen(port, () => {
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
        res.redirect("/getCurrentlyPlayingTracks");
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
      res.status(500).send({
        error: "internal_server_error"
      });
    }
  }
})

let currentlyPlayingTrackName;
let artistName;

// get spotifyAPI currentlyPlayingTracks data
app.get("/getCurrentlyPlayingTracks", async (req, res) => {
  try {
    const currentlyPlayingTrackResponse = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      method: "GET",
      headers : {
        "Authorization": "Bearer " + spotifyAccessToken
      }
    });

    if(currentlyPlayingTrackResponse.status === 200) {
      const currentlyPlayingTrackJson = await currentlyPlayingTrackResponse.json();
      currentlyPlayingTrackName = currentlyPlayingTrackJson.item.name;
      artistName = currentlyPlayingTrackJson.item.artists[0].name;
      res.redirect("/getLyrics");
    } else if(currentlyPlayingTrackResponse.status === 204) {
      res.status(204).send("再生中の楽曲がありません。");
      console.log("再生中の楽曲がありません。");
    } else {
      const currentlyPlayingTrackJson = await currentlyPlayingTrackResponse.json();
      res.status(400).send({
        error: currentlyPlayingTrackJson.error.message
      });
      throw new Error(currentlyPlayingTrackJson.error.message);
    }
  } catch(error) {
    console.error(error.message);

    if(!res.headersSent) {
      res.status(500).send({
        error: "internal_server_error"
      });
    }
  }
})

let lyrics;
let songData;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
let analyzeLyricsPromptTemplate = await readFile(new URL("./analyzeLyricsPromptTemplate.txt", import.meta.url), "utf-8");
let formatLyricsPromptTemplate = await readFile(new URL("./formatLyricsPromptTemplate.txt", import.meta.url), "utf-8");
let analyzeLyricsPrompt;
let formatLyricsPrompt;
const buildPrompt = (template, songData) => {
  return template.replace(/\{(title|artist|lyrics)\}/g, (_, key) => songData[key]);
}

// get geniusAPI lyrics data
app.get("/getLyrics", async (req, res) => {
  const geniusClientAccessToken = process.env.GENIUS_API_CLIENT_ACCESS_TOKEN;
  const options = {
      apiKey: geniusClientAccessToken,
      title: currentlyPlayingTrackName,
      artist: artistName,
      optimizeQuery: true
    };
  const onLineHandler = (input) => {
    if(input === "1") {
      rl.off("line", onLineHandler);
      rl.pause();
      res.redirect("/setGeminiAnalyzeOption");
    } else if(input === "2") {
      rl.off("line", onLineHandler);
      rl.pause();
      res.status(200).send(`<pre>${lyrics}<pre>`);
      process.exit(0);
    } else {
      console.log("不適切な値が入力されました。\n1,2のどちらかを入力してください。");
    }
  }

  try {
    lyrics = await getLyrics(options);

    if(lyrics === null) {
      res.send("歌詞が見つかりませんでした。");
      console.log("歌詞が見つかりませんでした。");
    } else {
      songData = {
        title: currentlyPlayingTrackName,
        artist: artistName,
        lyrics: lyrics
      }
      analyzeLyricsPrompt = buildPrompt(analyzeLyricsPromptTemplate, songData);
      formatLyricsPrompt = buildPrompt(formatLyricsPromptTemplate, songData);
      console.log("歌詞の取得に成功しました。");
      console.log("取得した歌詞のGeminiによる分析を行いますか？\n1：はい\n2：いいえ");
      rl.on("line", onLineHandler);
    }
  } catch(error) {
    console.error(error.message);
    if(!res.headersSent) {
      res.status(500).send({
        error: "internal_server_error"
      });
    }
  }
})

let prompt;

// set geminiAPI analyze option
app.get("/setGeminiAnalyzeOption", async(req, res) => {
  console.log("分析オプションを選択してください。\n1：歌詞の雰囲気、込められた意図などを推論させる\n2：取得した歌詞をもとに形態素解析を行う（日本語詞限定）\n3：任意のプロンプトを与える");

  try {
    rl.resume();
    rl.on("line", (input) => {
      if(input === "1") {
        rl.close();
        prompt = analyzeLyricsPrompt;
        res.redirect("/geminiAnalyzeLyrics");
      } else if(input === "2") {
        rl.close();
        prompt = formatLyricsPrompt;
        res.redirect("/geminiAnalyzeLyrics");
      } else if(input === "3") {
        rl.question("geminiに与えるプロンプトを入力してください。> ", (answer) => {
          rl.close();
          prompt = `${answer}\n楽曲名：${currentlyPlayingTrackName}\nアーティスト名：${artistName}\n歌詞：${lyrics}`;
          res.redirect("/geminiAnalyzeLyrics");
        });
      } else {
        console.log("不適切な値が入力されました。\n1,2,3のいずれかを入力してください。");
      }
    })
  } catch(error) {
    console.error(error.message);

    if(!res.headersSent) {
      res.status(500).send({
        error: "internal_server_error"
      });
    }
  }
})

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const buildTokenizer = () => {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: "node_modules/kuromoji/dict" }).build((error, tokenizer) => {
      if(error) {
        reject(error);
      } else {
        resolve(tokenizer);
      }
    });
  });
};

app.get("/geminiAnalyzeLyrics", async(req, res) => {
  try {
    const interaction = await ai.interactions.create({
      model: "gemini-3.1-flash-lite",
      input: prompt
    });

    if(prompt === formatLyricsPrompt) {
      if(interaction.output_text === "null") {
        console.log("日本語詞ではないため、形態素解析が行えません。");
        res.send(`<pre>日本語詞ではないため、形態素解析が行えません。\n${lyrics}<pre>`);
        process.exit(0);
      } else {
        const tokenizer = await buildTokenizer();
        const tokens = tokenizer.tokenize(interaction.output_text.replace(/\s/g, ""));
        console.log("形態素解析が完了しました。");
        res.json(tokens);
        process.exit(0);
      }
    } else {
      console.log("分析が完了しました。");
      res.status(200).send(`<pre>${interaction.output_text}<pre>`);
      process.exit(0);
    }
  } catch(error) {
    console.error(error.message);

    if(!res.headersSent) {
      res.status(500).send({
        error: "internal_server_error"
      });
    }
  }
})