// 辞書チェック機能
// Wikipedia/Wiktionary日本語版のAPIで単語の存在を確認する
// オフライン時のフォールバック用に小さい単語リストも持つ

const https = require('https');

// 簡易キャッシュ
const cache = new Map();

// よく使う基本単語（オフライン/フォールバック用）
const BASIC_WORDS = new Set([
  // 2文字
  'いぬ','ねこ','うま','うし','とり','さる','さかな','くま',
  'はな','やま','うみ','かわ','そら','つき','ほし','ひ','ゆき','あめ',
  'みず','ひの','つち','き','いし','すな','くも',
  'あさ','ひる','よる','はる','なつ','あき','ふゆ',
  'あか','あお','しろ','くろ','きいろ','みどり',
  'いえ','くるま','でんしゃ','ほん','つくえ','いす','まど','とびら',
  'あたま','かお','め','はな','くち','みみ','て','あし','ゆび',
  'おとこ','おんな','こども','おとな','ともだち','かぞく',
  'たべる','のむ','みる','きく','はなす','よむ','かく','いく','くる',
  'おはよう','こんにちは','こんばんは','ありがとう','さようなら',
  // 3文字
  'すいか','りんご','みかん','ばなな','ぶどう','いちご','もも','れもん',
  'たまご','ぎゅうにゅう','ぱん','ごはん','みそしる','うどん','そば',
  'らーめん','かれー','すし','てんぷら','やきとり',
  'がっこう','せんせい','せいと','きょうしつ','こくばん','えんぴつ',
  'でんわ','てれび','らじお','かめら','こんぴゅーた',
  'ひこうき','じてんしゃ','ばす','たくしー','ふね',
  'さくら','ひまわり','ばら','ちゅーりっぷ','あさがお',
  'らいおん','ぞう','きりん','ぱんだ','うさぎ','ねずみ',
  'おかあさん','おとうさん','おにいさん','おねえさん',
  'あさひ','ゆうひ','つきよ','ほしぞら','にじ','かみなり',
  // 4文字
  'こんにちは','ありがとう','おはようございます',
  // 動詞・形容詞活用
  'あつい','さむい','たかい','ひくい','ながい','みじかい',
  'おもい','かるい','つよい','よわい','はやい','おそい'
]);

// ひらがなのみか確認（拗音・長音含む）
function isHiraganaOnly(str) {
  return /^[\u3040-\u309F\u30FCー]+$/.test(str);
}

// Wikipedia/Wiktionary 日本語版で単語検索
function checkOnlineWord(word) {
  return new Promise((resolve) => {
    if (cache.has(word)) {
      return resolve(cache.get(word));
    }
    // Wiktionary日本語版で見出しを検索
    const url = `https://ja.wiktionary.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(word)}&prop=info`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const pages = json?.query?.pages || {};
          const found = Object.keys(pages).some(k => parseInt(k, 10) > 0);
          if (found) {
            cache.set(word, true);
            return resolve(true);
          }
          // Wiktionaryで見つからなかったらWikipedia本体も試す
          const url2 = `https://ja.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(word)}&prop=info`;
          https.get(url2, (res2) => {
            let data2 = '';
            res2.on('data', (chunk) => data2 += chunk);
            res2.on('end', () => {
              try {
                const json2 = JSON.parse(data2);
                const pages2 = json2?.query?.pages || {};
                const found2 = Object.keys(pages2).some(k => parseInt(k, 10) > 0);
                cache.set(word, found2);
                resolve(found2);
              } catch (e) {
                resolve(false);
              }
            });
          }).on('error', () => resolve(false));
        } catch (e) {
          resolve(false);
        }
      });
    }).on('error', () => resolve(false));
  });
}

async function checkWord(word) {
  if (!word || word.length < 2) {
    return { valid: false, source: 'invalid', word };
  }
  if (!isHiraganaOnly(word)) {
    return { valid: false, source: 'non-hiragana', word };
  }
  if (BASIC_WORDS.has(word)) {
    return { valid: true, source: 'basic', word };
  }
  try {
    const online = await checkOnlineWord(word);
    return { valid: online, source: online ? 'wiki' : 'unknown', word };
  } catch (e) {
    return { valid: false, source: 'error', word };
  }
}

module.exports = { checkWord, isHiraganaOnly, BASIC_WORDS };
