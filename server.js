// ひらがじゃん Web版 サーバー
// Express + Socket.IO によるリアルタイムマルチプレイ実装
// v2: リーチ・暗カン・点数計算対応

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { buildTileSet, shuffle } = require('./tiles');
const { checkWord } = require('./dictionary');
const { calculateScore } = require('./scoring');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

class Room {
  constructor(code, hostId, hostName) {
    this.code = code;
    this.hostId = hostId;
    this.players = [];
    this.state = 'lobby';
    this.wall = [];
    this.turn = 0;
    this.lastDiscard = null;
    this.pendingWin = null;
    this.log = [];
    this.tsumoCount = 0;      // ツモ巡数（一発・天和・地和判定用）
    this.kanCountTotal = 0;   // 局内カン回数（四槓子判定）
    this.lastActionWasKan = false; // 嶺上開花判定用
    this.riichiBets = 0;       // 供託リーチ棒
    this.addPlayer(hostId, hostName);
  }

  addPlayer(id, name) {
    if (this.players.length >= 4) return false;
    if (this.players.find(p => p.id === id)) return false;
    this.players.push({
      id, name,
      hand: [], discards: [], melds: [],
      score: 25000,
      riichi: false,
      riichiTurn: -1,
      doubleRiichi: false,
      ippatsuAvailable: false,
      firstTurn: true,  // 初手かどうか（天和・地和判定）
      connected: true
    });
    return true;
  }

  removePlayer(id) {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx === -1) return;
    if (this.state === 'lobby') {
      this.players.splice(idx, 1);
      if (this.hostId === id && this.players.length > 0) {
        this.hostId = this.players[0].id;
      }
    } else {
      this.players[idx].connected = false;
    }
  }

  start() {
    if (this.players.length < 2) return { error: '2人以上必要です' };
    this.state = 'playing';
    this.wall = shuffle(buildTileSet());
    this.tsumoCount = 0;
    this.kanCountTotal = 0;
    this.lastActionWasKan = false;
    for (const p of this.players) {
      p.hand = [];
      p.discards = [];
      p.melds = [];
      p.riichi = false;
      p.riichiTurn = -1;
      p.doubleRiichi = false;
      p.ippatsuAvailable = false;
      p.firstTurn = true;
      for (let i = 0; i < 13; i++) p.hand.push(this.wall.pop());
      this.sortHand(p);
    }
    this.turn = 0;
    const first = this.players[this.turn];
    first.hand.push(this.wall.pop());
    this.sortHand(first);
    this.tsumoCount = 1;
    this.log.push(`🀄 ゲーム開始！ ${first.name} の番です（最初のツモ完了）`);
    return { ok: true };
  }

  sortHand(p) {
    p.hand.sort((a, b) => a.char.localeCompare(b.char, 'ja'));
  }

  discard(playerId, tileId) {
    if (this.state !== 'playing') return { error: 'プレイ中ではありません' };
    const current = this.players[this.turn];
    if (current.id !== playerId) return { error: 'あなたの番ではありません' };
    const idx = current.hand.findIndex(t => t.id === tileId);
    if (idx === -1) return { error: '指定の牌がありません' };

    // リーチ後はツモ牌（最後の1枚）以外を捨てられない
    if (current.riichi && idx !== current.hand.length - 1) {
      return { error: 'リーチ後はツモ牌しか捨てられません' };
    }

    const tile = current.hand.splice(idx, 1)[0];
    current.discards.push(tile);
    this.lastDiscard = { tile, fromId: playerId, fromName: current.name, turn: this.tsumoCount };
    current.firstTurn = false;
    // 一発フラグは自分が捨てた瞬間に消える（次のツモまで持続するが、簡略化）
    // 他人の一発フラグも、その人が次のツモを迎えた時に消える（後述）
    this.lastActionWasKan = false;
    this.log.push(`🀫 ${current.name} が「${tile.char}」を捨てました`);
    return { ok: true };
  }

  drawNext() {
    if (this.wall.length === 0) {
      this.state = 'ended';
      this.log.push('🏳️ 山がなくなりました。流局です。');
      return { drawn: false, ryukyoku: true };
    }
    this.turn = (this.turn + 1) % this.players.length;
    let safety = 0;
    while (!this.players[this.turn].connected && safety < 5) {
      this.turn = (this.turn + 1) % this.players.length;
      safety++;
    }
    const next = this.players[this.turn];
    const tile = this.wall.pop();
    next.hand.push(tile);
    this.sortHand(next);
    this.tsumoCount++;
    // 一発フラグの管理: 自分の番が回ってきた時点で他人の一発は全て消える
    for (const p of this.players) {
      if (p.id !== next.id && p.ippatsuAvailable) p.ippatsuAvailable = false;
    }
    // 自分の番でリーチしてから1巡経過してなければ一発有効のまま
    this.log.push(`🎴 ${next.name} がツモ（残り山${this.wall.length}）`);
    return { drawn: true, toName: next.name, isHaitei: this.wall.length === 0 };
  }

  pon(playerId) {
    if (!this.lastDiscard) return { error: '捨て牌がありません' };
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'プレイヤー不明' };
    if (player.riichi) return { error: 'リーチ後は鳴けません' };
    if (player.id === this.lastDiscard.fromId) return { error: '自分の捨て牌は鳴けません' };
    const ch = this.lastDiscard.tile.char;
    const same = player.hand.filter(t => t.char === ch);
    if (same.length < 2) return { error: '同じ字が2枚必要です' };
    const used = [same[0], same[1], this.lastDiscard.tile];
    player.hand = player.hand.filter(t => t.id !== same[0].id && t.id !== same[1].id);
    player.melds.push({ type: 'pon', tiles: used });
    const from = this.players.find(p => p.id === this.lastDiscard.fromId);
    from.discards.pop();
    // 全プレイヤーの一発フラグを消す
    for (const p of this.players) p.ippatsuAvailable = false;
    this.log.push(`🔊 ${player.name} が「${ch}」でポン！`);
    this.turn = this.players.indexOf(player);
    this.lastDiscard = null;
    this.lastActionWasKan = false;
    return { ok: true };
  }

  // 明カン（他人の捨て牌）
  kan(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'プレイヤー不明' };
    if (player.riichi) return { error: 'リーチ後は鳴けません' };
    if (!this.lastDiscard) return { error: '捨て牌がありません' };
    if (player.id === this.lastDiscard.fromId) return { error: '自分の捨て牌は鳴けません' };
    const ch = this.lastDiscard.tile.char;
    const same = player.hand.filter(t => t.char === ch);
    if (same.length < 3) return { error: '同じ字が3枚必要です' };
    const used = [same[0], same[1], same[2], this.lastDiscard.tile];
    player.hand = player.hand.filter(t => !used.find(u => u.id === t.id));
    player.melds.push({ type: 'minkan', tiles: used });
    const from = this.players.find(p => p.id === this.lastDiscard.fromId);
    from.discards.pop();
    this.kanCountTotal++;
    // 嶺上牌
    if (this.wall.length > 0) {
      const rinshan = this.wall.pop();
      player.hand.push(rinshan);
      this.sortHand(player);
    }
    for (const p of this.players) p.ippatsuAvailable = false;
    this.log.push(`📣 ${player.name} が「${ch}」でカン！（嶺上ツモ）`);
    this.turn = this.players.indexOf(player);
    this.lastDiscard = null;
    this.lastActionWasKan = true;
    return { ok: true };
  }

  // 暗カン（自分の手札4枚）
  ankan(playerId, char) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'プレイヤー不明' };
    if (this.players[this.turn].id !== playerId) return { error: 'あなたの番ではありません' };
    const same = player.hand.filter(t => t.char === char);
    if (same.length < 4) return { error: '同じ字が4枚必要です' };
    player.hand = player.hand.filter(t => !same.slice(0, 4).find(u => u.id === t.id));
    player.melds.push({ type: 'ankan', tiles: same.slice(0, 4) });
    this.kanCountTotal++;
    if (this.wall.length > 0) {
      const rinshan = this.wall.pop();
      player.hand.push(rinshan);
      this.sortHand(player);
    }
    for (const p of this.players) p.ippatsuAvailable = false;
    this.log.push(`📣 ${player.name} が「${char}」で暗カン！（嶺上ツモ）`);
    this.lastDiscard = null;
    this.lastActionWasKan = true;
    return { ok: true };
  }

  // リーチ宣言
  riichi(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'プレイヤー不明' };
    if (this.players[this.turn].id !== playerId) return { error: 'あなたの番ではありません' };
    if (player.melds.some(m => m.type === 'pon' || m.type === 'minkan')) return { error: '副露(ポン・明カン)がある場合はリーチできません' };
    if (player.riichi) return { error: '既にリーチ済みです' };
    if (player.score < 1000) return { error: 'リーチには1000点必要です' };
    if (player.hand.length !== 14) return { error: '14枚のときに宣言してください' };
    if (this.wall.length < this.players.length) return { error: '残り山が少なくリーチできません' };

    player.riichi = true;
    player.riichiTurn = this.tsumoCount;
    player.ippatsuAvailable = true;
    player.score -= 1000;
    this.riichiBets += 1000;
    // ダブル立直（初手リーチ＆鳴き入ってない）
    if (player.firstTurn && this.players.every(p => p.melds.length === 0)) {
      player.doubleRiichi = true;
    }
    this.log.push(`🎌 ${player.name} がリーチ！ (-1000点)`);
    return { ok: true };
  }

  async declareWin(playerId, words, tileGroups, isRon) {
    if (this.state !== 'playing') return { error: 'プレイ中ではありません' };
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'プレイヤー不明' };

    let virtualHand = player.hand.slice();
    let virtualMelds = player.melds.slice();
    if (isRon) {
      if (!this.lastDiscard) return { error: '捨て牌がありません' };
      if (player.id === this.lastDiscard.fromId) return { error: '自分の捨て牌ではロンできません' };
      virtualHand = virtualHand.concat([this.lastDiscard.tile]);
    }

    const totalTiles = virtualHand.length + virtualMelds.reduce((s, m) => s + m.tiles.length, 0);
    const kanCount = virtualMelds.filter(m => m.type === 'minkan' || m.type === 'ankan').length;
    const expected = 14 + kanCount;
    if (totalTiles !== expected) {
      return { error: `手牌が${totalTiles}枚です（${expected}枚必要）` };
    }

    const totalGroups = words.length + virtualMelds.length;
    if (totalGroups !== 5) {
      return { error: `5組構成が必要です（現在${totalGroups}組）` };
    }
    const wordLengths = words.map(w => Array.from(w).length);
    const twoCount = wordLengths.filter(l => l === 2).length;
    const threeCount = wordLengths.filter(l => l === 3).length;
    // メルドがある場合、メルドは3文字単語の代わりとして扱う
    const meldsAsThree = virtualMelds.length;
    if (twoCount !== 1 || threeCount !== (4 - meldsAsThree)) {
      return { error: `構成エラー: 2文字1組＋3文字${4 - meldsAsThree}組が必要（メルド${meldsAsThree}個分は3文字組扱い）` };
    }

    const usedIds = new Set();
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const tileIds = tileGroups[i];
      if (!tileIds || tileIds.length !== Array.from(word).length) {
        return { error: `単語「${word}」に対応する牌の数が一致しません` };
      }
      const tilesArr = [];
      for (const tid of tileIds) {
        if (usedIds.has(tid)) return { error: '同じ牌を複数の単語に使えません' };
        const t = virtualHand.find(x => x.id === tid);
        if (!t) return { error: `牌ID ${tid} が手札にありません` };
        usedIds.add(tid);
        tilesArr.push(t);
      }
      const wordChars = Array.from(word);
      for (let j = 0; j < wordChars.length; j++) {
        if (tilesArr[j].char !== wordChars[j]) {
          return { error: `単語「${word}」の${j+1}文字目「${wordChars[j]}」と牌「${tilesArr[j].char}」が一致しません` };
        }
      }
    }

    const wordResults = [];
    for (const w of words) {
      const r = await checkWord(w);
      wordResults.push(r);
    }

    // 点数計算
    const allTiles = virtualHand.concat(...virtualMelds.map(m => m.tiles));
    const scoreCtx = {
      words,
      allTiles,
      melds: virtualMelds.filter(m => m.type !== 'ankan'), // 暗カンは門前扱い
      isRon,
      isTsumo: !isRon,
      isRiichi: player.riichi,
      isIppatsu: player.ippatsuAvailable,
      isHaitei: !isRon && this.wall.length === 0,
      isHoutei: isRon && this.wall.length === 0,
      isRinshan: !isRon && this.lastActionWasKan,
      isDaburi: player.doubleRiichi,
      isTenhou: player.firstTurn && !isRon && this.turn === 0 && this.players.every(p => p.firstTurn),
      kanCount: this.kanCountTotal,
    };
    const score = calculateScore(scoreCtx);

    this.state = 'judging';
    this.pendingWin = {
      playerId,
      playerName: player.name,
      words,
      tileGroups,
      melds: virtualMelds,
      wordResults,
      isRon,
      score,
      approvals: new Set([playerId]),
      rejections: new Set(),
      loserId: isRon ? this.lastDiscard.fromId : null,
    };
    this.log.push(`✨ ${player.name} が ${isRon ? 'ロン' : 'ツモ'} を宣言！ [${score.yaku.map(y => y.name).join('・')}] ${score.points}点`);
    return { ok: true };
  }

  voteWin(playerId, approve) {
    if (!this.pendingWin) return { error: '判定中の上がりがありません' };
    if (approve) {
      this.pendingWin.approvals.add(playerId);
      this.pendingWin.rejections.delete(playerId);
    } else {
      this.pendingWin.rejections.add(playerId);
      this.pendingWin.approvals.delete(playerId);
    }
    const totalVoters = this.players.filter(p => p.connected).length;
    const decided = this.pendingWin.approvals.size + this.pendingWin.rejections.size;
    if (decided >= totalVoters) {
      if (this.pendingWin.approvals.size > this.pendingWin.rejections.size) {
        // 点数授受
        const winner = this.players.find(p => p.id === this.pendingWin.playerId);
        const pts = this.pendingWin.score.points;
        if (this.pendingWin.isRon) {
          const loser = this.players.find(p => p.id === this.pendingWin.loserId);
          loser.score -= pts;
          winner.score += pts;
        } else {
          // ツモ：全員から均等
          const others = this.players.filter(p => p.id !== winner.id);
          const each = Math.ceil(pts / others.length);
          for (const o of others) {
            o.score -= each;
            winner.score += each;
          }
        }
        // 供託リーチ棒は勝者へ
        winner.score += this.riichiBets;
        this.riichiBets = 0;

        this.state = 'ended';
        this.log.push(`🎊 ${winner.name} のあがり成立！ +${pts}点`);
        return { decided: true, win: true };
      } else {
        this.log.push(`❌ ${this.pendingWin.playerName} の上がり否認（チョンボ -1000点）`);
        const player = this.players.find(p => p.id === this.pendingWin.playerId);
        player.score -= 1000;
        this.pendingWin = null;
        this.state = 'playing';
        return { decided: true, win: false };
      }
    }
    return { decided: false };
  }

  getStateFor(playerId) {
    return {
      code: this.code,
      hostId: this.hostId,
      state: this.state,
      turn: this.turn,
      currentPlayerId: this.players[this.turn]?.id,
      wallCount: this.wall.length,
      lastDiscard: this.lastDiscard,
      riichiBets: this.riichiBets,
      pendingWin: this.pendingWin ? {
        playerId: this.pendingWin.playerId,
        playerName: this.pendingWin.playerName,
        words: this.pendingWin.words,
        wordResults: this.pendingWin.wordResults,
        melds: this.pendingWin.melds,
        approvals: Array.from(this.pendingWin.approvals),
        rejections: Array.from(this.pendingWin.rejections),
        isRon: this.pendingWin.isRon,
        score: this.pendingWin.score,
      } : null,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        handCount: p.hand.length,
        score: p.score,
        riichi: p.riichi,
        hand: p.id === playerId ? p.hand : null,
        discards: p.discards,
        melds: p.melds,
      })),
      log: this.log.slice(-30),
    };
  }
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerName = null;

  socket.on('createRoom', ({ name }, cb) => {
    playerName = (name || '名無し').slice(0, 12);
    const code = genRoomCode();
    const room = new Room(code, socket.id, playerName);
    rooms.set(code, room);
    currentRoom = room;
    socket.join(code);
    cb({ ok: true, code });
    broadcast(room);
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    playerName = (name || '名無し').slice(0, 12);
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ error: '部屋が見つかりません' });
    if (room.state !== 'lobby') return cb({ error: '既にゲームが始まっています' });
    if (!room.addPlayer(socket.id, playerName)) return cb({ error: '満員です' });
    currentRoom = room;
    socket.join(room.code);
    cb({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('startGame', (cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    if (currentRoom.hostId !== socket.id) return cb({ error: 'ホストのみ開始できます' });
    const r = currentRoom.start();
    if (r.error) return cb(r);
    cb({ ok: true });
    broadcast(currentRoom);
  });

  socket.on('discard', ({ tileId }, cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    const r = currentRoom.discard(socket.id, tileId);
    if (r.error) return cb(r);
    cb({ ok: true });
    broadcast(currentRoom);
    setTimeout(() => {
      if (currentRoom && currentRoom.state === 'playing' && currentRoom.lastDiscard) {
        currentRoom.drawNext();
        currentRoom.lastDiscard = null;
        broadcast(currentRoom);
      }
    }, 2800);
  });

  socket.on('pon', (cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    const r = currentRoom.pon(socket.id);
    if (r.error) return cb(r);
    cb({ ok: true });
    broadcast(currentRoom);
  });

  socket.on('kan', (cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    const r = currentRoom.kan(socket.id);
    if (r.error) return cb(r);
    cb({ ok: true });
    broadcast(currentRoom);
  });

  socket.on('ankan', ({ char }, cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    const r = currentRoom.ankan(socket.id, char);
    if (r.error) return cb(r);
    cb({ ok: true });
    broadcast(currentRoom);
  });

  socket.on('riichi', (cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    const r = currentRoom.riichi(socket.id);
    if (r.error) return cb(r);
    cb({ ok: true });
    broadcast(currentRoom);
  });

  socket.on('declareWin', async ({ words, tileGroups, isRon }, cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    const r = await currentRoom.declareWin(socket.id, words, tileGroups, isRon);
    if (r.error) return cb(r);
    cb({ ok: true });
    broadcast(currentRoom);
  });

  socket.on('voteWin', ({ approve }, cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    const r = currentRoom.voteWin(socket.id, approve);
    cb(r);
    broadcast(currentRoom);
  });

  socket.on('newGame', (cb) => {
    if (!currentRoom) return cb({ error: '部屋にいません' });
    if (currentRoom.hostId !== socket.id) return cb({ error: 'ホストのみ操作できます' });
    currentRoom.state = 'lobby';
    currentRoom.pendingWin = null;
    currentRoom.lastDiscard = null;
    currentRoom.log = [];
    currentRoom.riichiBets = 0;
    for (const p of currentRoom.players) {
      p.hand = []; p.discards = []; p.melds = [];
      p.riichi = false; p.riichiTurn = -1;
      p.ippatsuAvailable = false; p.doubleRiichi = false;
      p.firstTurn = true;
    }
    cb({ ok: true });
    broadcast(currentRoom);
  });

  socket.on('chat', ({ msg }) => {
    if (!currentRoom) return;
    const text = String(msg || '').slice(0, 100);
    currentRoom.log.push(`💬 ${playerName}: ${text}`);
    broadcast(currentRoom);
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
      if (currentRoom.players.length === 0 || currentRoom.players.every(p => !p.connected)) {
        rooms.delete(currentRoom.code);
      } else {
        broadcast(currentRoom);
      }
    }
  });
});

function broadcast(room) {
  for (const p of room.players) {
    if (p.connected) {
      io.to(p.id).emit('state', room.getStateFor(p.id));
    }
  }
}

server.listen(PORT, () => {
  console.log(`🀄 ひらがじゃん サーバー起動: http://localhost:${PORT}`);
});
