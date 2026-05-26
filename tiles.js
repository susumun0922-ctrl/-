// 牌の構成定義
// 清音45音×2（「を」を除く）= 90
// 濁音20音×1 = 20
// 半濁音5音×1 = 5
// 拗音4音×1 = 4
// 長音1音×1 = 1
// 合計120枚

const SEION = [
  'あ','い','う','え','お',
  'か','き','く','け','こ',
  'さ','し','す','せ','そ',
  'た','ち','つ','て','と',
  'な','に','ぬ','ね','の',
  'は','ひ','ふ','へ','ほ',
  'ま','み','む','め','も',
  'や','ゆ','よ',
  'ら','り','る','れ','ろ',
  'わ','ん'
]; // 45音（「を」除外）

const DAKUON = [
  'が','ぎ','ぐ','げ','ご',
  'ざ','じ','ず','ぜ','ぞ',
  'だ','ぢ','づ','で','ど',
  'ば','び','ぶ','べ','ぼ'
]; // 20音

const HANDAKUON = ['ぱ','ぴ','ぷ','ぺ','ぽ']; // 5音

const YOON = ['ゃ','ゅ','ょ','っ']; // 拗音4音（小書き）

const CHOON = ['ー']; // 長音1音

function buildTileSet() {
  const tiles = [];
  let id = 0;
  // 清音は各2枚
  for (const ch of SEION) {
    tiles.push({ id: id++, char: ch, type: 'seion' });
    tiles.push({ id: id++, char: ch, type: 'seion' });
  }
  for (const ch of DAKUON) {
    tiles.push({ id: id++, char: ch, type: 'dakuon' });
  }
  for (const ch of HANDAKUON) {
    tiles.push({ id: id++, char: ch, type: 'handakuon' });
  }
  for (const ch of YOON) {
    tiles.push({ id: id++, char: ch, type: 'yoon' });
  }
  for (const ch of CHOON) {
    tiles.push({ id: id++, char: ch, type: 'choon' });
  }
  return tiles;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { buildTileSet, shuffle, SEION, DAKUON, HANDAKUON, YOON, CHOON };
