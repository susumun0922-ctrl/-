// ひらがじゃん 点数計算ロジック
// オリジナル役体系：基本点1000、飜ごとに2倍、役満は8000

const { SEION, DAKUON, HANDAKUON, YOON, CHOON } = require('./tiles');

// 国士無双の14音セット
const KOKUSHI_SET = ['あ','か','さ','た','な','は','ま','や','ら','わ','が','ぱ','ゃ','ー'];

function isAllSeion(words) {
  // 全ての単語が清音のみで構成
  const seionSet = new Set(SEION);
  return words.every(w => Array.from(w).every(c => seionSet.has(c)));
}

function hasAllDakuonHandakuon(words) {
  // 全単語に濁音/半濁音/拗音/長音のいずれかを含む
  const specialSet = new Set([...DAKUON, ...HANDAKUON, ...YOON, ...CHOON]);
  return words.every(w => Array.from(w).some(c => specialSet.has(c)));
}

function isShiritori(words) {
  // 単語が順番にしりとりになっている（末尾→次の単語の先頭、長音・拗音は無視）
  if (words.length < 2) return false;
  const normalize = (c) => {
    const map = { 'ゃ':'や','ゅ':'ゆ','ょ':'よ','っ':'つ','ー':null };
    return map[c] !== undefined ? map[c] : c;
  };
  for (let i = 0; i < words.length - 1; i++) {
    const cur = Array.from(words[i]);
    let last = cur[cur.length - 1];
    if (normalize(last) === null) last = cur[cur.length - 2];
    last = normalize(last);
    const next = normalize(Array.from(words[i + 1])[0]);
    if (last !== next) return false;
  }
  return true;
}

function isKokushiMusou(allTiles) {
  // 14音セット全てを持っているか
  const chars = new Set(allTiles.map(t => t.char));
  return KOKUSHI_SET.every(c => chars.has(c));
}

function isChinitsu(allTiles, type) {
  // 一色（指定の type のみで構成）
  return allTiles.every(t => t.type === type);
}

/**
 * 役と点数を計算
 * @param {Object} ctx - { words, allTiles, melds, isRon, isTsumo, isRiichi, isIppatsu, isHaitei, isHoutei, isRinshan, isDaburi, isTenhou, kanCount }
 * @returns { yaku: [{name, han}], han, points, isYakuman }
 */
function calculateScore(ctx) {
  const yaku = [];
  let isYakuman = false;

  // 役満チェック
  if (ctx.isTenhou) { yaku.push({ name: '天和', han: 13 }); isYakuman = true; }
  if (isKokushiMusou(ctx.allTiles)) { yaku.push({ name: '国士無双', han: 13 }); isYakuman = true; }
  if (ctx.kanCount >= 4) { yaku.push({ name: '四槓子', han: 13 }); isYakuman = true; }
  if (isShiritori(ctx.words)) { yaku.push({ name: 'しりとり', han: 13 }); isYakuman = true; }

  if (!isYakuman) {
    // 通常役
    if (ctx.isRiichi) yaku.push({ name: '立直', han: 1 });
    if (ctx.isIppatsu) yaku.push({ name: '一発', han: 1 });
    if (ctx.isTsumo && ctx.melds.length === 0) yaku.push({ name: '門前清自摸和', han: 1 });
    else if (ctx.isTsumo) yaku.push({ name: 'ツモ', han: 1 });
    if (ctx.isRinshan) yaku.push({ name: '嶺上開花', han: 1 });
    if (ctx.isHaitei) yaku.push({ name: '海底撈月', han: 1 });
    if (ctx.isHoutei) yaku.push({ name: '河底撈魚', han: 1 });
    if (ctx.isDaburi) yaku.push({ name: 'ダブル立直', han: 1 });
    if (isAllSeion(ctx.words)) yaku.push({ name: '清音作り', han: 2 });
    if (hasAllDakuonHandakuon(ctx.words)) yaku.push({ name: '濁り組み', han: 2 });
    if (ctx.kanCount === 3) yaku.push({ name: '三槓子', han: 2 });
    if (isChinitsu(ctx.allTiles, 'seion')) yaku.push({ name: '清音一色', han: 3 });
  }

  const totalHan = yaku.reduce((s, y) => s + y.han, 0);
  let points;
  if (isYakuman) {
    points = 8000;
  } else if (totalHan === 0) {
    // 役なしは上がれない（ただし簡略化のため500点を与える「無役あがり」）
    yaku.push({ name: '無役（チョンボ防止）', han: 0 });
    points = 500;
  } else {
    points = Math.min(8000, 1000 * Math.pow(2, totalHan - 1));
  }

  return { yaku, han: totalHan, points, isYakuman };
}

module.exports = { calculateScore };
