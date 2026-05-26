// ひらがじゃん クライアント v2
// Renderのスリープ復帰待ちを考慮してタイムアウトを延長
const socket = io({
  timeout: 60000,
  reconnectionAttempts: 30,
  reconnectionDelay: 1000,
});

// 起動中表示
let wakeupTimer = setTimeout(() => {
  if (!socket.connected) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div id="wakeup-banner" style="position:fixed;top:0;left:0;right:0;background:#ffd96b;color:#2a2218;padding:10px;text-align:center;z-index:9999;font-weight:bold;">' +
      '⚡ サーバー起動中です…もう少しお待ちください（30秒程度）</div>');
  }
}, 3000);
socket.on('connect', () => {
  clearTimeout(wakeupTimer);
  const b = document.getElementById('wakeup-banner');
  if (b) b.remove();
});

let myId = null;
let currentState = null;
let selectedTileId = null;
let declareState = null;

const $ = (id) => document.getElementById(id);
const lobby = $('lobby');
const game = $('game');

socket.on('connect', () => {
  myId = socket.id;
  // URLに ?room=ABCDE があれば自動入力
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    $('code-input').value = roomParam.toUpperCase();
    // 名前入力欄にフォーカス
    $('name-input').focus();
  }
});

// ========= ロビー =========
$('create-btn').onclick = () => {
  const name = $('name-input').value.trim() || '名無し';
  socket.emit('createRoom', { name }, (res) => {
    if (res.error) return alert(res.error);
    enterGame(res.code);
  });
};

$('join-btn').onclick = () => {
  const name = $('name-input').value.trim() || '名無し';
  const code = $('code-input').value.trim().toUpperCase();
  if (!code) return alert('部屋コードを入力してください');
  socket.emit('joinRoom', { name, code }, (res) => {
    if (res.error) return alert(res.error);
    enterGame(res.code);
  });
};

function enterGame(code) {
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  $('room-code-display').textContent = code;
}

$('copy-code').onclick = () => {
  const code = $('room-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => {
    $('copy-code').textContent = '✓';
    setTimeout(() => $('copy-code').textContent = '📋', 1500);
  });
};

$('show-qr').onclick = () => openQrModal();

function openQrModal() {
  const code = $('room-code-display').textContent;
  const url = `${location.origin}/?room=${code}`;
  $('invite-url').textContent = url;
  $('invite-code').textContent = code;
  $('qr-display').innerHTML = '';
  if (window.QRCode) {
    QRCode.toCanvas(url, { width: 220, margin: 2 }, (err, canvas) => {
      if (!err) $('qr-display').appendChild(canvas);
    });
  }
  $('qr-modal').classList.remove('hidden');
}

$('qr-close').onclick = () => $('qr-modal').classList.add('hidden');
$('qr-copy-url').onclick = () => {
  const url = $('invite-url').textContent;
  navigator.clipboard.writeText(url).then(() => {
    $('qr-copy-url').textContent = '✓ コピー済';
    setTimeout(() => $('qr-copy-url').textContent = 'URLをコピー', 1500);
  });
};

// ========= 状態受信 =========
socket.on('state', (state) => {
  currentState = state;
  render();
});

function render() {
  if (!currentState) return;
  const s = currentState;

  $('wall-count').textContent = `🀫 ${s.wallCount}`;
  $('riichi-bet-display').textContent = s.riichiBets > 0 ? `🎌×${s.riichiBets / 1000}` : '';
  $('game-state-display').textContent = stateLabel(s.state);

  renderGuidance();
  renderPlayers();
  renderDiscards();
  renderMyHand();
  renderActions();

  if (s.state === 'lobby') {
    $('lobby-controls').classList.remove('hidden');
    const isHost = s.hostId === myId;
    $('start-btn').classList.toggle('hidden', !isHost || s.players.length < 2);
    $('lobby-info').textContent = isHost
      ? (s.players.length >= 2 ? `✅ ${s.players.length}人揃いました！「ゲーム開始」を押してね` : '⏳ もう一人以上の参加を待っています…\n右上の「📱 QR」で友達を招待できます')
      : `⏳ ホストの開始を待っています… (${s.players.length}人)`;
    // ロビーにQR表示
    if (isHost && s.players.length < 4) {
      const code = $('room-code-display').textContent;
      const url = `${location.origin}/?room=${code}`;
      $('qr-area').innerHTML = '';
      if (window.QRCode) {
        QRCode.toCanvas(url, { width: 180, margin: 2 }, (err, canvas) => {
          if (!err) {
            $('qr-area').appendChild(canvas);
            const p = document.createElement('p');
            p.style.fontSize = '12px';
            p.style.color = '#5a4a30';
            p.innerHTML = `👆 スマホでQRをスキャン<br>または部屋コード <b style="color:#c8392a">${code}</b> を共有`;
            $('qr-area').appendChild(p);
          }
        });
      }
    }
  } else {
    $('lobby-controls').classList.add('hidden');
  }

  if (s.pendingWin && s.state === 'judging') {
    showVoteModal(s.pendingWin);
  } else {
    $('vote-modal').classList.add('hidden');
  }

  if (s.state === 'ended') {
    showResultModal();
  }

  $('game-log').innerHTML = s.log.map(l => `<div>${escape(l)}</div>`).join('');
  $('game-log').scrollTop = $('game-log').scrollHeight;
}

function stateLabel(st) {
  return { lobby: '待機中', playing: 'プレイ中', judging: '🔔 判定中', ended: '終局' }[st] || st;
}

function escape(s) {
  return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

// ========= ガイダンス =========
function renderGuidance() {
  const s = currentState;
  const g = $('guidance');
  const me = s.players.find(p => p.id === myId);
  if (!me) { g.textContent = ''; return; }

  let msg = '';
  let isAction = false;
  if (s.state === 'lobby') {
    msg = s.hostId === myId
      ? (s.players.length >= 2 ? '🎲 「ゲーム開始」を押してね' : '👥 友達を待っているよ。QRコードで招待しよう！')
      : '⏳ ホストの開始を待ってね';
  } else if (s.state === 'playing') {
    const isMyTurn = s.currentPlayerId === myId;
    const lastIsMine = s.lastDiscard && s.lastDiscard.fromId === myId;
    const handCount = me.hand?.length || 0;
    if (isMyTurn && handCount === 14 + me.melds.filter(m => m.type === 'minkan' || m.type === 'ankan').length) {
      if (selectedTileId == null) {
        msg = '👆 捨てたい牌を1枚タップ → 「捨てる」を押して';
      } else {
        msg = '✅ 牌を選択中。「捨てる」or「ツモ上がり」を押して！';
      }
      isAction = true;
    } else if (s.lastDiscard && !lastIsMine) {
      const ch = s.lastDiscard.tile.char;
      const myCount = (me.hand || []).filter(t => t.char === ch).length;
      if (myCount >= 2) {
        msg = `🔔 ${s.lastDiscard.fromName} が「${ch}」を捨てた！ポン/ロンができるよ`;
        isAction = true;
      } else {
        msg = `⏳ ${s.players[s.turn]?.name} の番`;
      }
    } else {
      msg = `⏳ ${s.players[s.turn]?.name} の番`;
    }
  } else if (s.state === 'judging') {
    msg = '🗳️ あがり判定中。みんなで投票してね';
    isAction = true;
  } else if (s.state === 'ended') {
    msg = '🎊 終局！';
  }
  g.textContent = msg;
  g.classList.toggle('waiting', !isAction);
}

function renderPlayers() {
  const s = currentState;
  const area = $('players-area');
  area.innerHTML = '';
  s.players.forEach((p) => {
    const isCurrent = s.state === 'playing' && p.id === s.currentPlayerId;
    const card = document.createElement('div');
    card.className = 'player-card' + (isCurrent ? ' current' : '') + (!p.connected ? ' disconnected' : '') + (p.riichi ? ' riichi' : '');
    const isMe = p.id === myId;
    const isHost = p.id === s.hostId;
    card.innerHTML = `
      <div class="player-name">${escape(p.name)}${isMe ? ' (あなた)' : ''}${isHost ? ' 👑' : ''}</div>
      <div class="player-score">${p.score}点</div>
      <div class="player-meta">手 ${p.handCount} / 捨 ${p.discards.length} / 鳴 ${p.melds.length}</div>
      ${!isMe ? `<div class="player-tiles-back">${'<div class="tile-back"></div>'.repeat(Math.min(p.handCount, 14))}</div>` : ''}
      ${p.melds.length ? `<div class="player-melds-display">${p.melds.map(m =>
        `<div class="meld-group">${m.tiles.map(t => tileHtml(m.type === 'ankan' ? { ...t, char: '🀫' } : t, true)).join('')}</div>`
      ).join('')}</div>` : ''}
    `;
    area.appendChild(card);
  });
}

function renderDiscards() {
  const s = currentState;
  const allDiscards = [];
  s.players.forEach(p => p.discards.forEach(t => allDiscards.push({...t, from: p.name})));
  $('discards-display').innerHTML = allDiscards.map(t => tileHtml(t, true)).join('') || '<span style="color:#7a8a7a;font-size:12px">まだ捨て牌はありません</span>';

  const last = s.lastDiscard;
  if (last && s.state === 'playing') {
    $('last-discard-section').innerHTML = `
      <div class="discard-label">🆕 ${escape(last.fromName)} さんが捨てた牌:</div>
      ${tileHtml(last.tile, false)}
    `;
  } else {
    $('last-discard-section').innerHTML = '';
  }
}

function renderMyHand() {
  const s = currentState;
  const me = s.players.find(p => p.id === myId);
  if (!me) return;
  $('my-name-display').textContent = `（${me.name} / ${me.score}点 / ${me.hand?.length || 0}枚）`;

  const handDiv = $('my-hand');
  const meldsDiv = $('my-melds');

  if (!me.hand) {
    handDiv.innerHTML = '<span style="color:#8a7a5a">配牌待ち...</span>';
    meldsDiv.innerHTML = '';
    return;
  }

  handDiv.innerHTML = me.hand.map((t, i) => {
    const isTsumo = me.hand.length === 14 && i === me.hand.length - 1 && s.currentPlayerId === myId;
    return tileHtml(t, false, selectedTileId === t.id, isTsumo);
  }).join('');

  meldsDiv.innerHTML = me.melds.length
    ? '<span style="font-size:12px;color:#5a4a30">副露：</span>' + me.melds.map(m =>
        `<div class="meld-group">${m.tiles.map(t => tileHtml(m.type === 'ankan' ? { ...t, char: '🀫' } : t, false)).join('')}</div>`
      ).join('')
    : '';

  handDiv.querySelectorAll('.tile').forEach(el => {
    el.onclick = () => {
      const id = parseInt(el.dataset.tileId, 10);
      selectedTileId = (selectedTileId === id) ? null : id;
      render();
    };
  });
}

function tileHtml(tile, small = false, selected = false, tsumo = false) {
  if (!tile) return '';
  const cls = ['tile', tile.type || '', small ? 'small' : '', selected ? 'selected' : '', tsumo ? 'tsumo' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-tile-id="${tile.id}">${escape(tile.char)}</div>`;
}

function renderActions() {
  const s = currentState;
  const bar = $('action-bar');
  bar.innerHTML = '';
  if (s.state !== 'playing') return;
  const me = s.players.find(p => p.id === myId);
  if (!me) return;
  const isMyTurn = s.currentPlayerId === myId;
  const handCount = me.hand?.length || 0;
  const meldKan = me.melds.filter(m => m.type === 'minkan' || m.type === 'ankan').length;
  const expectedFull = 14 + meldKan;
  const isFullHand = isMyTurn && (handCount + me.melds.reduce((s, m) => s + m.tiles.length, 0)) === expectedFull;

  if (isFullHand) {
    // 捨て / ツモ / リーチ / 暗カン
    const discardBtn = selectedTileId == null
      ? `<button id="discard-btn" disabled>🀫 牌を選んで</button>`
      : `<button class="primary highlight" id="discard-btn">🀫 捨てる</button>`;
    bar.innerHTML += discardBtn;
    bar.innerHTML += `<button class="primary" id="tsumo-btn">🎉 ツモ上がり</button>`;
    if (!me.riichi && me.melds.filter(m => m.type === 'pon' || m.type === 'minkan').length === 0) {
      bar.innerHTML += `<button class="secondary" id="riichi-btn">🎌 リーチ</button>`;
    }
    // 暗カン候補
    const counts = {};
    me.hand.forEach(t => counts[t.char] = (counts[t.char] || 0) + 1);
    const ankanCands = Object.entries(counts).filter(([_, c]) => c >= 4).map(([c]) => c);
    if (ankanCands.length > 0 && !me.riichi) {
      bar.innerHTML += `<button class="secondary" id="ankan-btn">📣 暗カン</button>`;
    }
  }

  if (s.lastDiscard && s.lastDiscard.fromId !== myId && !me.riichi) {
    const ch = s.lastDiscard.tile.char;
    const myCount = (me.hand || []).filter(t => t.char === ch).length;
    if (myCount >= 2) bar.innerHTML += `<button class="secondary" id="pon-btn">🔊 ポン</button>`;
    if (myCount >= 3) bar.innerHTML += `<button class="secondary" id="kan-btn">📣 カン</button>`;
  }
  // ロンは別ロジック（牌が揃っていなくてもボタンは出す、判定はサーバー）
  if (s.lastDiscard && s.lastDiscard.fromId !== myId) {
    bar.innerHTML += `<button class="primary" id="ron-btn">🎯 ロン</button>`;
  }

  if ($('discard-btn')) $('discard-btn').onclick = () => {
    if (selectedTileId == null) return;
    socket.emit('discard', { tileId: selectedTileId }, (res) => {
      if (res.error) alert(res.error);
      selectedTileId = null;
    });
  };
  if ($('tsumo-btn')) $('tsumo-btn').onclick = () => openDeclareModal(false);
  if ($('ron-btn')) $('ron-btn').onclick = () => openDeclareModal(true);
  if ($('riichi-btn')) $('riichi-btn').onclick = () => {
    if (!confirm('リーチ宣言しますか？（-1000点供託・以降は捨て牌のみ可能）')) return;
    socket.emit('riichi', (res) => { if (res.error) alert(res.error); });
  };
  if ($('pon-btn')) $('pon-btn').onclick = () => {
    socket.emit('pon', (res) => { if (res.error) alert(res.error); });
  };
  if ($('kan-btn')) $('kan-btn').onclick = () => {
    socket.emit('kan', (res) => { if (res.error) alert(res.error); });
  };
  if ($('ankan-btn')) $('ankan-btn').onclick = () => openAnkanModal();
}

// ========= 開始 =========
$('start-btn').onclick = () => {
  socket.emit('startGame', (res) => {
    if (res.error) alert(res.error);
  });
};

// ========= 暗カンモーダル =========
function openAnkanModal() {
  const me = currentState.players.find(p => p.id === myId);
  const counts = {};
  me.hand.forEach(t => counts[t.char] = (counts[t.char] || 0) + 1);
  const cands = Object.entries(counts).filter(([_, c]) => c >= 4).map(([c]) => c);
  $('ankan-choices').innerHTML = cands.map(c =>
    `<button class="primary" onclick="doAnkan('${c}')">「${c}」 ×4</button>`
  ).join('');
  $('ankan-modal').classList.remove('hidden');
}
$('ankan-cancel').onclick = () => $('ankan-modal').classList.add('hidden');
window.doAnkan = (ch) => {
  socket.emit('ankan', { char: ch }, (res) => {
    if (res.error) alert(res.error);
    $('ankan-modal').classList.add('hidden');
  });
};

// ========= 上がり宣言モーダル =========
function openDeclareModal(isRon) {
  const s = currentState;
  const me = s.players.find(p => p.id === myId);
  if (!me) return;
  let source = me.hand.slice();
  if (isRon) {
    if (!s.lastDiscard) return alert('捨て牌がありません');
    source = source.concat([s.lastDiscard.tile]);
  }
  declareState = {
    isRon,
    source: source.slice(),
    pickedGroups: [[]],
    completedGroups: [],
    completedWords: [],
  };
  $('declare-modal').classList.remove('hidden');
  renderDeclare();
}

function renderDeclare() {
  const ds = declareState;
  $('declare-source').innerHTML = '<span style="font-size:11px;color:#8a7a5a;width:100%;">残り牌（タップして単語に追加）:</span>' + ds.source.map(t => tileHtml(t)).join('');
  $('declare-source').querySelectorAll('.tile').forEach(el => {
    el.onclick = () => {
      const id = parseInt(el.dataset.tileId, 10);
      const idx = ds.source.findIndex(t => t.id === id);
      if (idx === -1) return;
      const tile = ds.source.splice(idx, 1)[0];
      ds.pickedGroups[ds.pickedGroups.length - 1].push(tile);
      renderDeclare();
    };
  });

  const groupsHtml = [];
  ds.completedGroups.forEach((g, i) => {
    groupsHtml.push(`<div class="word-group complete">
      <span class="word-group-label">${i+1}個目</span>
      ${g.map(t => tileHtml(t, true)).join('')}
      <span class="word-text">${escape(ds.completedWords[i])}</span>
    </div>`);
  });
  const cur = ds.pickedGroups[ds.pickedGroups.length - 1];
  groupsHtml.push(`<div class="word-group">
    <span class="word-group-label">${ds.completedGroups.length + 1}個目<br>(編集中)</span>
    ${cur.map(t => tileHtml(t, true)).join('')}
    <span class="word-text">${cur.map(t => t.char).join('')}</span>
  </div>`);
  $('declare-words').innerHTML = groupsHtml.join('');

  const lastGroupEl = $('declare-words').children[$('declare-words').children.length - 1];
  lastGroupEl.querySelectorAll('.tile').forEach((el, i) => {
    el.onclick = () => {
      const removed = cur.splice(i, 1)[0];
      ds.source.push(removed);
      ds.source.sort((a, b) => a.char.localeCompare(b.char, 'ja'));
      renderDeclare();
    };
  });
}

$('declare-separator').onclick = () => {
  const ds = declareState;
  const cur = ds.pickedGroups[ds.pickedGroups.length - 1];
  if (cur.length < 2) return alert('単語は2文字以上必要です');
  if (cur.length > 4) return alert('単語は最大4文字までです');
  const word = cur.map(t => t.char).join('');
  ds.completedGroups.push(cur);
  ds.completedWords.push(word);
  ds.pickedGroups.push([]);
  renderDeclare();
};

$('declare-undo').onclick = () => {
  const ds = declareState;
  const cur = ds.pickedGroups[ds.pickedGroups.length - 1];
  if (cur.length > 0) {
    const t = cur.pop();
    ds.source.push(t);
    ds.source.sort((a, b) => a.char.localeCompare(b.char, 'ja'));
  } else if (ds.completedGroups.length > 0) {
    const lastGroup = ds.completedGroups.pop();
    ds.completedWords.pop();
    ds.pickedGroups[ds.pickedGroups.length - 1] = lastGroup;
  }
  renderDeclare();
};

$('declare-submit').onclick = () => {
  const ds = declareState;
  const groups = ds.completedGroups.slice();
  const words = ds.completedWords.slice();
  const cur = ds.pickedGroups[ds.pickedGroups.length - 1];
  if (cur.length > 0) {
    groups.push(cur);
    words.push(cur.map(t => t.char).join(''));
  }
  if (ds.source.length > 0) {
    return alert(`まだ ${ds.source.length} 個の牌が残っています`);
  }
  const tileGroups = groups.map(g => g.map(t => t.id));
  socket.emit('declareWin', { words, tileGroups, isRon: ds.isRon }, (res) => {
    if (res.error) return alert(res.error);
    $('declare-modal').classList.add('hidden');
    declareState = null;
  });
};

$('declare-cancel').onclick = () => {
  $('declare-modal').classList.add('hidden');
  declareState = null;
};

// ========= 投票モーダル =========
function showVoteModal(pw) {
  $('vote-modal').classList.remove('hidden');
  $('vote-player-name').textContent = pw.playerName;
  $('vote-type').textContent = pw.isRon ? 'ロン' : 'ツモ';
  $('vote-words').innerHTML = pw.words.map(w => `<span class="vote-word">${escape(w)}</span>`).join('');
  // 点数表示
  $('vote-score').innerHTML = `
    <div class="points">${pw.score.points}点</div>
    <div class="yaku-list">${pw.score.yaku.map(y => `<b>${y.name}</b>${y.han > 0 ? `(${y.han}飜)` : ''}`).join(' / ') || '無役'}</div>
    ${pw.score.isYakuman ? '<div style="color:#c8392a;font-size:18px;margin-top:6px">★ 役満 ★</div>' : ''}
  `;
  $('vote-dict-result').innerHTML = pw.wordResults.map(r =>
    `<div class="${r.valid ? 'dict-ok' : 'dict-ng'}">${r.valid ? '✅' : '❓'} 「${escape(r.word)}」 — ${
      r.valid ? (r.source === 'wiki' ? '辞書/百科にあり' : '基本単語') : '辞書に見つかりません（人間判定でOK）'
    }</div>`
  ).join('');

  const voted = pw.approvals.includes(myId) || pw.rejections.includes(myId);
  $('vote-approve').disabled = voted;
  $('vote-reject').disabled = voted;
  $('vote-status').innerHTML = `投票状況: 承認 ${pw.approvals.length} / 否認 ${pw.rejections.length}`;
}

$('vote-approve').onclick = () => socket.emit('voteWin', { approve: true }, () => {});
$('vote-reject').onclick = () => socket.emit('voteWin', { approve: false }, () => {});

// ========= 結果モーダル =========
function showResultModal() {
  const s = currentState;
  const lastLogs = s.log.slice(-8).join('\n');
  const winLog = s.log.find(l => l.includes('あがり成立'));
  const ryukyoku = s.log.find(l => l.includes('流局'));
  $('result-title').textContent = ryukyoku ? '🏳️ 流局' : (winLog ? '🎊 あがり！' : '終局');
  // スコアランキング
  const sortedPlayers = s.players.slice().sort((a, b) => b.score - a.score);
  const scoreHtml = sortedPlayers.map((p, i) => `
    <div style="display:flex;justify-content:space-between;padding:6px 10px;background:${i===0?'#fff5d8':'#fff'};border-radius:6px;margin:4px 0;">
      <span>${['🥇','🥈','🥉','4位'][i]} ${escape(p.name)}</span>
      <b>${p.score}点</b>
    </div>`).join('');
  $('result-body').innerHTML = `
    <h3 style="margin-bottom:8px;">最終スコア</h3>
    ${scoreHtml}
    <details style="margin-top:10px;font-size:12px;">
      <summary>ログ詳細</summary>
      <pre style="white-space:pre-wrap;margin-top:6px;">${escape(lastLogs)}</pre>
    </details>
  `;
  $('result-modal').classList.remove('hidden');
  const isHost = s.hostId === myId;
  $('result-new-game').classList.toggle('hidden', !isHost);
}

$('result-new-game').onclick = () => {
  socket.emit('newGame', (res) => {
    if (res.error) return alert(res.error);
    $('result-modal').classList.add('hidden');
  });
};

$('result-close').onclick = () => $('result-modal').classList.add('hidden');

// ========= チャット =========
$('chat-send').onclick = sendChat;
$('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const msg = $('chat-input').value.trim();
  if (!msg) return;
  socket.emit('chat', { msg });
  $('chat-input').value = '';
}
