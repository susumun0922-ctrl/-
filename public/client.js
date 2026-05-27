// ひらがじゃん クライアント v3 - 雀魂風レイアウト + 牌並べ替え対応
const socket = io({
  timeout: 60000,
  reconnectionAttempts: 30,
  reconnectionDelay: 1000,
});

// 起動中バナー
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
let selectedTileId = null;       // 捨牌用の選択
let swapSourceId = null;         // 並べ替え用の選択
let handOrder = [];              // 手牌の表示順（牌ID配列）
let declareState = null;

const $ = (id) => document.getElementById(id);
const lobby = $('lobby');
const game = $('game');

socket.on('connect', () => {
  myId = socket.id;
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    $('code-input').value = roomParam.toUpperCase();
    $('name-input').focus();
  }
});

// ========= ロビー =========
$('create-btn').onclick = () => {
  const name = $('name-input').value.trim();
  if (!name) { alert('ニックネームを入力してください'); $('name-input').focus(); return; }
  socket.emit('createRoom', { name }, (res) => {
    if (res.error) return alert(res.error);
    enterGame(res.code);
  });
};

$('join-btn').onclick = () => {
  const name = $('name-input').value.trim();
  if (!name) { alert('ニックネームを入力してください'); $('name-input').focus(); return; }
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
  const prevState = currentState;
  currentState = state;
  syncHandOrder(prevState);
  render();
});

// 手牌の表示順を維持する（サーバーからの新しい牌のみ追加、無くなった牌は削除）
function syncHandOrder(prev) {
  const me = currentState.players.find(p => p.id === myId);
  if (!me || !me.hand) { handOrder = []; return; }
  const currentIds = new Set(me.hand.map(t => t.id));
  // 既存の順序を保ちつつ、無い牌を除去
  handOrder = handOrder.filter(id => currentIds.has(id));
  // 新しい牌（順序にない牌）を末尾に追加
  for (const t of me.hand) {
    if (!handOrder.includes(t.id)) handOrder.push(t.id);
  }
}

function render() {
  if (!currentState) return;
  const s = currentState;

  $('wall-count').textContent = s.wallCount;
  $('game-state-display').textContent = stateLabel(s.state);

  renderRiichiSticks(s.riichiBets);
  renderGuidance();
  renderPlayers();
  renderDiscards();
  renderMyHand();
  renderActions();

  // my-area sticky制御
  document.querySelector('.my-area').classList.toggle('in-game', s.state === 'playing' || s.state === 'judging');

  if (s.state === 'lobby') {
    $('lobby-controls').classList.remove('hidden');
    const isHost = s.hostId === myId;
    $('start-btn').classList.toggle('hidden', !isHost || s.players.length < 2);
    $('lobby-info').textContent = isHost
      ? (s.players.length >= 2 ? `✅ ${s.players.length}人揃いました！「ゲーム開始」を押してね` : '⏳ もう一人以上の参加を待っています…\nQRコードで友達を招待できます')
      : `⏳ ホストの開始を待っています… (${s.players.length}人)`;
    if (isHost && s.players.length < 4) {
      const code = $('room-code-display').textContent;
      const url = `${location.origin}/?room=${code}`;
      $('qr-area').innerHTML = '';
      if (window.QRCode) {
        QRCode.toCanvas(url, { width: 160, margin: 2 }, (err, canvas) => {
          if (!err) {
            $('qr-area').appendChild(canvas);
            const p = document.createElement('p');
            p.style.cssText = 'font-size:11px;color:#ffd96b;margin-top:6px;';
            p.innerHTML = `👆 スマホでQRをスキャン<br>または部屋コード <b>${code}</b> を共有`;
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

  if (s.state === 'ended') showResultModal();

  $('game-log').innerHTML = s.log.map(l => `<div>${escape(l)}</div>`).join('');
  $('game-log').scrollTop = $('game-log').scrollHeight;
}

function stateLabel(st) {
  return { lobby: '待機中', playing: 'プレイ中', judging: '🔔 判定中', ended: '終局' }[st] || st;
}

function escape(s) {
  return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

function renderRiichiSticks(bets) {
  const sticksEl = $('riichi-sticks');
  const n = Math.floor(bets / 1000);
  sticksEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'riichi-stick';
    sticksEl.appendChild(s);
  }
}

function renderGuidance() {
  const s = currentState;
  const g = $('guidance');
  const me = s.players.find(p => p.id === myId);
  if (!me) { g.textContent = ''; return; }

  let msg = '';
  let isAction = false;
  if (s.state === 'lobby') {
    msg = s.hostId === myId
      ? (s.players.length >= 2 ? '🎲 「ゲーム開始」を押してね' : '👥 友達を待っているよ。QRで招待しよう！')
      : '⏳ ホストの開始を待ってね';
  } else if (s.state === 'playing') {
    const isMyTurn = s.currentPlayerId === myId;
    const lastIsMine = s.lastDiscard && s.lastDiscard.fromId === myId;
    const handCount = me.hand?.length || 0;
    const meldKan = me.melds.filter(m => m.type === 'minkan' || m.type === 'ankan').length;
    const expectedFull = 14 + meldKan;
    if (isMyTurn && handCount === expectedFull) {
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

// プレイヤーを卓の4方向に配置（自分=下、左隣=右、対面=上、右隣=左）
function renderPlayers() {
  const s = currentState;
  const container = $('players-container');
  container.innerHTML = '';
  const winds = ['東', '南', '西', '北'];
  const positions = ['pos-bottom', 'pos-right', 'pos-top', 'pos-left'];

  // 自分のインデックスを起点に並べる
  const myIdx = s.players.findIndex(p => p.id === myId);
  const startIdx = myIdx >= 0 ? myIdx : 0;

  s.players.forEach((p, i) => {
    const relIdx = (i - startIdx + s.players.length) % s.players.length;
    const pos = positions[relIdx];
    const wind = winds[i];
    const isCurrent = s.state === 'playing' && p.id === s.currentPlayerId;
    const isMe = p.id === myId;
    const isHost = p.id === s.hostId;

    const card = document.createElement('div');
    card.className = 'player-card ' + pos
      + (isCurrent ? ' current' : '')
      + (!p.connected ? ' disconnected' : '')
      + (p.riichi ? ' riichi' : '');

    card.innerHTML = `
      <div class="player-wind">${wind}</div>
      <div class="player-name">${escape(p.name)}${isMe ? '⭐' : ''}${isHost ? '👑' : ''}</div>
      <div class="player-score">${p.score}</div>
      <div class="player-meta">手 ${p.handCount}${p.melds.length ? ` / 鳴 ${p.melds.length}` : ''}</div>
      ${!isMe ? `<div class="player-tiles-back">${'<div class="tile-back"></div>'.repeat(Math.min(p.handCount, 14))}</div>` : ''}
      ${p.melds.length ? `<div class="player-melds-display">${p.melds.map(m =>
        `<div class="meld-group">${m.tiles.map(t => tileHtml(m.type === 'ankan' ? { ...t, char: '🀫' } : t, 'tiny')).join('')}</div>`
      ).join('')}</div>` : ''}
    `;
    container.appendChild(card);
  });
}

// 河（捨て牌）を各プレイヤーの中央向きに配置
function renderDiscards() {
  const s = currentState;
  const container = $('discards-container');
  container.innerHTML = '';
  const positions = ['pos-bottom', 'pos-right', 'pos-top', 'pos-left'];
  const myIdx = s.players.findIndex(p => p.id === myId);
  const startIdx = myIdx >= 0 ? myIdx : 0;

  s.players.forEach((p, i) => {
    const relIdx = (i - startIdx + s.players.length) % s.players.length;
    const pos = positions[relIdx];
    const area = document.createElement('div');
    area.className = 'discards-area ' + pos + (p.discards.length === 0 ? ' empty' : '');
    area.innerHTML = p.discards.map((t, idx) => {
      const isLast = s.lastDiscard && s.lastDiscard.tile.id === t.id && s.lastDiscard.fromId === p.id;
      return tileHtml(t, 'small', false, false, isLast);
    }).join('');
    container.appendChild(area);
  });
}

function renderMyHand() {
  const s = currentState;
  const me = s.players.find(p => p.id === myId);
  if (!me) return;
  $('my-name-display').innerHTML = `<b>${escape(me.name)}</b>　${me.score}点　手牌 ${me.hand?.length || 0}枚`;

  const handDiv = $('my-hand');
  const meldsDiv = $('my-melds');

  if (!me.hand) {
    handDiv.innerHTML = '<span style="color:#c4a060">配牌待ち...</span>';
    meldsDiv.innerHTML = '';
    return;
  }

  // handOrder の順に並べる
  const handMap = new Map(me.hand.map(t => [t.id, t]));
  const orderedHand = handOrder.map(id => handMap.get(id)).filter(Boolean);

  const isMyTurn = s.currentPlayerId === myId;
  const isFullHand = isMyTurn && orderedHand.length === 14 + me.melds.filter(m => m.type === 'minkan' || m.type === 'ankan').length;

  handDiv.innerHTML = orderedHand.map((t, i) => {
    // 最後の牌（ツモ牌）は分けて表示
    const isTsumo = isFullHand && i === orderedHand.length - 1;
    return tileHtml(t, '', selectedTileId === t.id, isTsumo) + (isTsumo && i === orderedHand.length - 1 ? '' : '');
  }).join('');

  meldsDiv.innerHTML = me.melds.length
    ? '<span style="font-size:11px;color:#c4a060;align-self:center;">副露：</span>' + me.melds.map(m =>
        `<div class="meld-group" style="display:flex;gap:2px;">${m.tiles.map(t => tileHtml(m.type === 'ankan' ? { ...t, char: '🀫' } : t, 'small')).join('')}</div>`
      ).join('')
    : '';

  // クリック・ドラッグ処理を再バインド
  attachTileInteractions();
}

function tileHtml(tile, sizeClass = '', selected = false, tsumo = false, lastDiscard = false) {
  if (!tile) return '';
  const cls = ['tile', tile.type || '', sizeClass, selected ? 'selected' : '', tsumo ? 'tsumo' : '', lastDiscard ? 'last-discard-highlight' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-tile-id="${tile.id}">${escape(tile.char)}</div>`;
}

// ========= 牌の操作（タップ選択 + 並べ替え）=========
function attachTileInteractions() {
  const handDiv = $('my-hand');
  const tiles = handDiv.querySelectorAll('.tile');

  tiles.forEach(el => {
    const tileId = parseInt(el.dataset.tileId, 10);

    // タップ処理: シンプルタップ→選択（捨牌用）、選択中にもう一枚タップ→交換
    el.addEventListener('click', (e) => {
      if (el.dataset.didDrag === '1') {
        el.dataset.didDrag = '0';
        return;
      }
      if (swapSourceId !== null && swapSourceId !== tileId) {
        // 2枚目タップ → 交換
        swapTiles(swapSourceId, tileId);
        swapSourceId = null;
        selectedTileId = null;
        document.querySelectorAll('.tile.swap-target').forEach(t => t.classList.remove('swap-target'));
        render();
      } else if (selectedTileId === tileId) {
        // 同じ牌を再タップ → 選択解除
        selectedTileId = null;
        swapSourceId = null;
        document.querySelectorAll('.tile.swap-target').forEach(t => t.classList.remove('swap-target'));
        render();
      } else {
        selectedTileId = tileId;
        swapSourceId = tileId;
        document.querySelectorAll('.tile.swap-target').forEach(t => t.classList.remove('swap-target'));
        // 自分以外をスワップターゲットに
        document.querySelectorAll('#my-hand .tile').forEach(t => {
          if (parseInt(t.dataset.tileId, 10) !== tileId) t.classList.add('swap-target');
        });
        render();
        // renderで再描画されるので、再度スワップターゲット表示
        setTimeout(() => {
          document.querySelectorAll('#my-hand .tile').forEach(t => {
            if (parseInt(t.dataset.tileId, 10) !== tileId) t.classList.add('swap-target');
          });
        }, 0);
      }
    });

    // ドラッグ&ドロップ（長押しで開始）
    let dragStartX = 0, dragStartY = 0;
    let dragging = false;
    let pressTimer = null;
    let ghost = null;

    const onStart = (clientX, clientY) => {
      pressTimer = setTimeout(() => {
        dragging = true;
        el.classList.add('dragging');
        // ゴースト作成
        ghost = el.cloneNode(true);
        ghost.classList.add('floating');
        ghost.style.left = (clientX - 20) + 'px';
        ghost.style.top = (clientY - 30) + 'px';
        document.body.appendChild(ghost);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 250);
      dragStartX = clientX; dragStartY = clientY;
    };

    const onMove = (clientX, clientY) => {
      if (!dragging) {
        // ちょっと動いたら長押し判定キャンセル
        const dx = Math.abs(clientX - dragStartX), dy = Math.abs(clientY - dragStartY);
        if (dx > 8 || dy > 8) {
          clearTimeout(pressTimer);
        }
        return;
      }
      if (ghost) {
        ghost.style.left = (clientX - 20) + 'px';
        ghost.style.top = (clientY - 30) + 'px';
      }
      // ホバーしている牌をハイライト
      document.querySelectorAll('#my-hand .tile.drag-over').forEach(t => t.classList.remove('drag-over'));
      const elemBelow = document.elementFromPoint(clientX, clientY);
      const tileBelow = elemBelow?.closest('#my-hand .tile');
      if (tileBelow && tileBelow !== el) {
        tileBelow.classList.add('drag-over');
      }
    };

    const onEnd = (clientX, clientY) => {
      clearTimeout(pressTimer);
      if (dragging) {
        el.dataset.didDrag = '1';
        // ドロップ先を判定
        const elemBelow = document.elementFromPoint(clientX, clientY);
        const tileBelow = elemBelow?.closest('#my-hand .tile');
        if (tileBelow && tileBelow !== el) {
          const targetId = parseInt(tileBelow.dataset.tileId, 10);
          insertBefore(tileId, targetId);
          render();
        }
      }
      dragging = false;
      el.classList.remove('dragging');
      document.querySelectorAll('#my-hand .tile.drag-over').forEach(t => t.classList.remove('drag-over'));
      if (ghost) { ghost.remove(); ghost = null; }
    };

    // タッチ
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
      if (dragging) e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      onEnd(t.clientX, t.clientY);
    });

    // マウス
    el.addEventListener('mousedown', (e) => { onStart(e.clientX, e.clientY); });
    document.addEventListener('mousemove', (e) => {
      if (pressTimer || dragging) onMove(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', (e) => {
      if (pressTimer || dragging) onEnd(e.clientX, e.clientY);
    });
  });
}

function swapTiles(idA, idB) {
  const ia = handOrder.indexOf(idA);
  const ib = handOrder.indexOf(idB);
  if (ia === -1 || ib === -1) return;
  [handOrder[ia], handOrder[ib]] = [handOrder[ib], handOrder[ia]];
}

function insertBefore(movingId, targetId) {
  const im = handOrder.indexOf(movingId);
  if (im === -1) return;
  handOrder.splice(im, 1);
  const it = handOrder.indexOf(targetId);
  if (it === -1) { handOrder.push(movingId); return; }
  handOrder.splice(it, 0, movingId);
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
  const isFullHand = isMyTurn && handCount === expectedFull;

  if (isFullHand) {
    const discardBtn = selectedTileId == null
      ? `<button id="discard-btn" disabled>🀫 牌を選んで</button>`
      : `<button class="primary highlight" id="discard-btn">🀫 捨てる</button>`;
    bar.innerHTML += discardBtn;
    bar.innerHTML += `<button class="primary" id="tsumo-btn">🎉 ツモ和了</button>`;
    if (!me.riichi && me.melds.filter(m => m.type === 'pon' || m.type === 'minkan').length === 0) {
      bar.innerHTML += `<button class="secondary" id="riichi-btn">🎌 立直</button>`;
    }
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
  if (s.lastDiscard && s.lastDiscard.fromId !== myId) {
    bar.innerHTML += `<button class="primary" id="ron-btn">🎯 ロン</button>`;
  }

  if ($('discard-btn')) $('discard-btn').onclick = () => {
    if (selectedTileId == null) return;
    socket.emit('discard', { tileId: selectedTileId }, (res) => {
      if (res.error) alert(res.error);
      selectedTileId = null;
      swapSourceId = null;
    });
  };
  if ($('tsumo-btn')) $('tsumo-btn').onclick = () => openDeclareModal(false);
  if ($('ron-btn')) $('ron-btn').onclick = () => openDeclareModal(true);
  if ($('riichi-btn')) $('riichi-btn').onclick = () => {
    if (!confirm('リーチ宣言しますか？（-1000点供託・以降は捨て牌のみ可能）')) return;
    socket.emit('riichi', (res) => { if (res.error) alert(res.error); });
  };
  if ($('pon-btn')) $('pon-btn').onclick = () => socket.emit('pon', (res) => { if (res.error) alert(res.error); });
  if ($('kan-btn')) $('kan-btn').onclick = () => socket.emit('kan', (res) => { if (res.error) alert(res.error); });
  if ($('ankan-btn')) $('ankan-btn').onclick = () => openAnkanModal();
}

$('start-btn').onclick = () => {
  socket.emit('startGame', (res) => { if (res.error) alert(res.error); });
};

// 暗カンモーダル
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

// 上がり宣言モーダル
function openDeclareModal(isRon) {
  const s = currentState;
  const me = s.players.find(p => p.id === myId);
  if (!me) return;
  let source = me.hand.slice();
  if (isRon) {
    if (!s.lastDiscard) return alert('捨て牌がありません');
    source = source.concat([s.lastDiscard.tile]);
  }
  // 並べ替えた順を反映
  source.sort((a, b) => {
    const ai = handOrder.indexOf(a.id);
    const bi = handOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
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
  $('declare-source').innerHTML = '<span style="font-size:11px;color:#c4a060;width:100%;">残り牌（タップして単語に追加）:</span>' + ds.source.map(t => tileHtml(t)).join('');
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
      ${g.map(t => tileHtml(t, 'small')).join('')}
      <span class="word-text">${escape(ds.completedWords[i])}</span>
    </div>`);
  });
  const cur = ds.pickedGroups[ds.pickedGroups.length - 1];
  groupsHtml.push(`<div class="word-group">
    <span class="word-group-label">${ds.completedGroups.length + 1}個目<br>(編集中)</span>
    ${cur.map(t => tileHtml(t, 'small')).join('')}
    <span class="word-text">${cur.map(t => t.char).join('')}</span>
  </div>`);
  $('declare-words').innerHTML = groupsHtml.join('');

  const lastGroupEl = $('declare-words').children[$('declare-words').children.length - 1];
  lastGroupEl.querySelectorAll('.tile').forEach((el, i) => {
    el.onclick = () => {
      const removed = cur.splice(i, 1)[0];
      ds.source.push(removed);
      renderDeclare();
    };
  });
}

$('declare-separator').onclick = () => {
  const ds = declareState;
  const cur = ds.pickedGroups[ds.pickedGroups.length - 1];
  if (cur.length < 2) return alert('単語は2文字以上必要です');
  if (cur.length > 4) return alert('単語は最大4文字までです');
  ds.completedGroups.push(cur);
  ds.completedWords.push(cur.map(t => t.char).join(''));
  ds.pickedGroups.push([]);
  renderDeclare();
};

$('declare-undo').onclick = () => {
  const ds = declareState;
  const cur = ds.pickedGroups[ds.pickedGroups.length - 1];
  if (cur.length > 0) {
    const t = cur.pop();
    ds.source.push(t);
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

// 投票モーダル
function showVoteModal(pw) {
  $('vote-modal').classList.remove('hidden');
  $('vote-player-name').textContent = pw.playerName;
  $('vote-type').textContent = pw.isRon ? 'ロン' : 'ツモ';
  $('vote-words').innerHTML = pw.words.map(w => `<span class="vote-word">${escape(w)}</span>`).join('');
  $('vote-score').innerHTML = `
    <div class="points">${pw.score.points}点</div>
    <div class="yaku-list">${pw.score.yaku.map(y => `<b>${y.name}</b>${y.han > 0 ? `(${y.han}飜)` : ''}`).join(' / ') || '無役'}</div>
    ${pw.score.isYakuman ? '<div style="color:#6b1818;font-size:20px;margin-top:6px;font-weight:900;">★ 役満 ★</div>' : ''}
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

function showResultModal() {
  const s = currentState;
  const lastLogs = s.log.slice(-8).join('\n');
  const winLog = s.log.find(l => l.includes('あがり成立'));
  const ryukyoku = s.log.find(l => l.includes('流局'));
  $('result-title').textContent = ryukyoku ? '🏳️ 流局' : (winLog ? '🎊 和了！' : '終局');
  const sortedPlayers = s.players.slice().sort((a, b) => b.score - a.score);
  const scoreHtml = sortedPlayers.map((p, i) => `
    <div style="display:flex;justify-content:space-between;padding:8px 12px;background:${i===0?'rgba(255,217,107,0.15)':'rgba(255,255,255,0.05)'};border-radius:6px;margin:4px 0;border:1px solid ${i===0?'#ffd96b':'#4a3520'};">
      <span style="color:#fff8e8;">${['🥇','🥈','🥉','4位'][i]} ${escape(p.name)}</span>
      <b style="color:${i===0?'#ffd96b':'#fff8e8'};font-family:monospace;">${p.score}</b>
    </div>`).join('');
  $('result-body').innerHTML = `
    <h3 style="margin-bottom:8px;color:#ffd96b;font-family:'Yuji Syuku',serif;">最終スコア</h3>
    ${scoreHtml}
    <details style="margin-top:10px;font-size:12px;color:#c4a060;">
      <summary>ログ詳細</summary>
      <pre style="white-space:pre-wrap;margin-top:6px;color:#c4d8c8;">${escape(lastLogs)}</pre>
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

$('chat-send').onclick = sendChat;
$('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const msg = $('chat-input').value.trim();
  if (!msg) return;
  socket.emit('chat', { msg });
  $('chat-input').value = '';
}
