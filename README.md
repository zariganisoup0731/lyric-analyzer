## 概要
Spotifyで再生中の楽曲の歌詞情報をもとに、Geminiを経由して歌詞の考察や形態素解析結果を得るアプリケーション。  
操作はCLI、出力はブラウザ画面（今後GUIのWebアプリ化も検討）

## 使用例
https://github.com/user-attachments/assets/bd8feafb-11ad-4033-85b3-decff56486fe

https://github.com/user-attachments/assets/409868ae-c254-45c5-ae05-3aa5887f2a94

https://github.com/user-attachments/assets/5436f0f1-19d6-4809-8421-02dba7b0138a


## 制作意図
近年の考察ブームの影響で、楽曲の歌詞について意見が飛び交うことも少なくない。  
自分自身も音楽は日常的に耳にしているが、作業中に聴くことが多く、じっくりと歌詞について考える時間はそこまで多くないが、ふと今再生している曲の歌詞が気になることがある。  
このアプリは、時間の無いリスナーの要望に応えるべく、自分が今聴いている楽曲の歌詞について、Geminiに歌詞中の比喩表現や、固有名詞、楽曲制作時の時代背景などにも触れつつ考察してもらったり、Kuromojiを利用した日本語詞の形態素解析を行うことが出来る。

## 主な機能
* 再生中楽曲の歌詞表示
* Geminiによる歌詞考察・日本語訳
* 日本語詞の形態素解析
* Geminiに任意のプロンプトを与え、分析させる

## フロー
1. SpotifyAPIのアクセストークン取得
2. SpotifyAPIで再生中楽曲の曲名、アーティスト名取得（歌詞はSpotifyAPIでは取得不可）
3. 取得した楽曲情報を元にGeniusAPIより歌詞情報を取得
4. 分析オプションを選び、Geminiに分析させる
5. 形態素解析を行う場合は、Geminiに不要な箇所を取り除かせ整形した歌詞情報をKuromojiに渡す

## 工夫点
* エラー処理・条件分岐
* 歌詞情報の取得を、GeminiにGoogle検索によるグラウンディングで取得させるのではなく、GeniusAPIを利用することでトークン消費量を削減
* 簡潔な操作

# 使用言語・技術など
* JavaScript
* node.js
* express.js
* SpotifyAPI
* GeniusAPI
* GeminiAPI
* Kuromoji