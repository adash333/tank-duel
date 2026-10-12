/* Browser presentation and input. All game rules live in engine.js. */
(() => {
  'use strict';
  const { Game, MAPS, WIDTH, HEIGHT } = TankEngine;
  const $ = id => document.getElementById(id);
  const canvas = $('arena'), ctx = canvas.getContext('2d');
  let game = new Game(), paused = false, sound = false, audioContext, lastTime = 0, uiKey = '';
  const keys = new Set(), particles = [], colors = ['#c5f277', '#f2a164'];
  const touch = [{ moveX: 0, moveY: 0, fire: false }, { moveX: 0, moveY: 0, fire: false }];
  const touchCleanups = [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bindings = new Set(['KeyW','KeyA','KeyS','KeyD','Space','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','ShiftRight']);
  function inputs() {
    const keyboard = [
      { forward: keys.has('KeyW'), backward: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD'), fire: keys.has('Space') || keys.has('KeyF') },
      { forward: keys.has('ArrowUp'), backward: keys.has('ArrowDown'), left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), fire: keys.has('Enter') || keys.has('ShiftRight') }
    ];
    return keyboard.map((input, id) => Math.hypot(touch[id].moveX, touch[id].moveY) > 0
      ? { ...touch[id], fire: touch[id].fire || input.fire }
      : { ...input, fire: touch[id].fire || input.fire });
  }
  function clearInput() {
    keys.clear(); touchCleanups.forEach(clear => clear());
    touch.forEach(input => { input.moveX = 0; input.moveY = 0; input.fire = false; });
  }
  document.querySelectorAll('.joystick').forEach(pad => {
    const id = Number(pad.dataset.player), stick = pad.querySelector('.stick');
    let pointer = null;
    const clear = () => { pointer = null; touch[id].moveX = 0; touch[id].moveY = 0; stick.style.transform = ''; pad.classList.remove('active'); };
    touchCleanups.push(clear);
    function move(event) {
      const rect = pad.getBoundingClientRect(), radius = rect.width * .33;
      let x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
      const distance = Math.hypot(x,y);
      if(distance>radius){x=x/distance*radius;y=y/distance*radius;}
      touch[id].moveX = x / radius; touch[id].moveY = y / radius;
      stick.style.transform = `translate(${x}px, ${y}px)`;
    }
    pad.addEventListener('pointerdown', event => {
      if(pointer!==null || paused || !['playing','countdown'].includes(game.phase))return;
      event.preventDefault();pointer=event.pointerId;pad.setPointerCapture(pointer);pad.classList.add('active');move(event);
    });
    pad.addEventListener('pointermove',event=>{if(event.pointerId===pointer){event.preventDefault();move(event);}});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,event=>{if(event.pointerId===pointer)clear();});
  });
  document.querySelectorAll('.fire-button').forEach(button=>{
    const id=Number(button.dataset.player), pointers=new Set();
    const clear=()=>{pointers.clear();touch[id].fire=false;button.classList.remove('pressed');};touchCleanups.push(clear);
    button.addEventListener('pointerdown',event=>{
      if(paused || !['playing','countdown'].includes(game.phase))return;
      event.preventDefault();pointers.add(event.pointerId);button.setPointerCapture(event.pointerId);touch[id].fire=true;button.classList.add('pressed');
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,event=>{
      pointers.delete(event.pointerId);touch[id].fire=pointers.size>0;button.classList.toggle('pressed',pointers.size>0);
    });
    button.addEventListener('contextmenu',event=>event.preventDefault());
  });
  function tone(freq, duration, type = 'square', volume = .04) {
    if (!sound || !audioContext) return;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, freq / 3), audioContext.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  }
  function emit(event) {
    if (event.type === 'round') { tone(420,.35,'triangle'); return; }
    if (event.type === 'go') { tone(750,.2,'sine'); return; }
    const amount = reduceMotion ? 0 : event.type === 'explosion' ? 45 : event.type === 'break' ? 22 : event.type === 'shot' ? 4 : 12;
    const color = event.type === 'hit' || event.type === 'explosion' ? colors[event.owner] : event.type === 'break' ? '#bc9570' : '#f1d695';
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 25 + Math.random() * (event.type === 'explosion' ? 180 : 100);
      particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .3 + Math.random() * .5, max: .8, color, size: 2 + Math.random() * 3 });
    }
    if (event.type === 'shot') tone(130,.07);
    else if (event.type === 'hit' || event.type === 'explosion') tone(70,.22,'sawtooth',.055);
    else if (event.type === 'break') tone(100,.13,'triangle');
  }
  function start() {
    clearInput(); particles.length = 0; paused = false; game.start();
    document.activeElement?.blur();
    if (audioContext) audioContext.resume();
    uiKey = ''; updateUI();
  }
  function reset(map = game.map) {
    game = new Game(map); paused = false; clearInput(); particles.length = 0; uiKey = ''; updateUI();
  }
  function pause(force) {
    if (!['playing','countdown','round-over'].includes(game.phase)) return;
    paused = force === undefined ? !paused : force;
    clearInput(); uiKey = ''; updateUI();
  }
  document.addEventListener('keydown', event => {
    const focusedControl = event.target instanceof HTMLElement && ['BUTTON','A','INPUT','SELECT'].includes(event.target.tagName);
    if (focusedControl && !['playing','countdown','round-over'].includes(game.phase)) return;
    if (bindings.has(event.code) && !paused && game.phase !== 'ready' && game.phase !== 'finished') {
      event.preventDefault(); keys.add(event.code);
    }
    if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) { event.preventDefault(); pause(); }
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); pause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); pause(true); } });
  $('start-button').addEventListener('click', () => paused ? pause(false) : start());
  $('pause-button').addEventListener('click', () => { pause(); document.activeElement?.blur(); });
  $('reset-button').addEventListener('click', () => reset());
  $('focus-button').addEventListener('click', () => {
    const focus = document.body.classList.toggle('play-focus');
    $('focus-button').setAttribute('aria-pressed', String(focus));
    $('focus-button').innerHTML = focus ? '⛶ <span>元に戻す</span>' : '⛶ <span>画面を広げる</span>';
    if(focus) window.scrollTo(0,0);
  });
  $('sound-button').addEventListener('click', () => {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume(); sound = !sound;
      $('sound-button').setAttribute('aria-pressed', String(sound));
      $('sound-button').innerHTML = `♪ <span>音 ${sound ? 'ON' : 'OFF'}</span>`;
      if (sound) tone(440,.12,'sine');
    } catch { $('sound-button').innerHTML = '♪ <span>音声未対応</span>'; }
    document.activeElement?.blur();
  });
  document.querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => {
    if (game.phase !== 'ready' && game.phase !== 'finished') return;
    reset(button.dataset.map);
    document.querySelectorAll('[data-map]').forEach(item => {
      item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button));
    });
  }));
  function updateUI() {
    const signature = [game.phase, paused, Math.ceil(game.phaseTime || 0), Math.ceil(game.remaining), game.round, ...game.scores, ...game.tanks.map(t => t.hp), game.map].join('/');
    if (signature === uiKey) return; uiKey = signature;
    $('timer').innerHTML = `${String(Math.ceil(game.remaining)).padStart(2,'0')}<span>SEC</span>`;
    $('round-label').textContent = game.phase === 'ready' ? 'READY TO DUEL' : `ROUND ${String(game.round).padStart(2,'0')}`;
    $('map-label').textContent = MAPS[game.map].label;
    for (let id = 0; id < 2; id++) {
      $('health-' + id).innerHTML = [0,1,2].map(i => `<i class="${i >= game.tanks[id].hp ? 'empty' : ''}"></i>`).join('');
      $('health-' + id).setAttribute('aria-label', `${id + 1}Pの耐久力：${game.tanks[id].hp} / 3`);
      $('wins-' + id).innerHTML = [0,1,2].map(i => `<i class="${i < game.scores[id] ? 'filled' : ''}"></i>`).join('');
      $('wins-' + id).setAttribute('aria-label', `${id + 1}Pの勝利数：${game.scores[id]}`);
    }
    const active = ['playing','countdown','round-over'].includes(game.phase);
    $('pause-button').disabled = !active;
    $('pause-button').innerHTML = paused ? '▶ <span>再開</span>' : 'Ⅱ <span>一時停止</span>';
    document.querySelectorAll('[data-map]').forEach(button => button.disabled = active);
    const overlay = $('overlay'); overlay.className = 'overlay';
    $('start-button').hidden = false; $('overlay-description').hidden = false; $('overlay-hint').hidden = false;
    if (paused) {
      $('overlay-kicker').textContent = 'TAKE A BREATHER'; $('overlay-title').textContent = '一時停止中';
      $('overlay-description').innerHTML = 'ひと息ついたら、戦場へ。<br>ボタンをタッチして再開できます。';
      $('start-button').innerHTML = '対戦を再開する <span>↗</span>';
    } else if (game.phase === 'ready') {
      $('overlay-kicker').textContent = 'THE ARENA IS YOURS'; $('overlay-title').textContent = '準備はいい？';
      $('overlay-description').innerHTML = '3ラウンド先取で勝利。<br>画面の左右を分け合って、いざ勝負。';
      $('start-button').innerHTML = '対戦をはじめる <span>↗</span>';
    } else if (game.phase === 'countdown') {
      overlay.classList.add('countdown'); $('overlay-kicker').textContent = `ROUND ${game.round}`;
      $('overlay-title').textContent = Math.max(1, Math.ceil(game.phaseTime));
      $('start-button').hidden = true; $('overlay-description').hidden = true; $('overlay-hint').hidden = true;
    } else if (game.phase === 'round-over' || game.phase === 'finished') {
      const finished = game.phase === 'finished', winner = finished ? game.winner : game.roundWinner;
      $('overlay-kicker').textContent = finished ? 'MATCH COMPLETE' : 'ROUND COMPLETE';
      $('overlay-title').textContent = winner === null ? '引き分け！' : `PLAYER ${winner + 1} ${finished ? 'の勝利！' : 'が先取！'}`;
      $('overlay-title').style.color = winner === null ? '#eeeede' : colors[winner];
      $('overlay-description').textContent = finished ? `${game.scores[0]} − ${game.scores[1]}  お疲れさま！もう一戦、どう？` : 'まもなく次のラウンドが始まります。';
      $('start-button').hidden = !finished; $('overlay-hint').hidden = true;
      $('start-button').innerHTML = 'もう一度対戦する <span>↗</span>';
    } else overlay.classList.add('hidden');
    if (!['round-over','finished'].includes(game.phase) || paused) $('overlay-title').style.color = '';
    const message = paused ? '一時停止中' : game.phase === 'finished' ? `プレイヤー${game.winner + 1}の勝利。${game.scores.join('対')}` : game.phase === 'round-over' ? game.roundWinner === null ? '引き分け' : `プレイヤー${game.roundWinner + 1}がラウンド勝利` : game.phase === 'playing' ? `ラウンド${game.round}対戦中` : '';
    if ($('announcement').textContent !== message) $('announcement').textContent = message;
  }
  function drawTank(tank) {
    if (tank.hp <= 0) return;
    ctx.save(); ctx.translate(tank.x, tank.y); ctx.rotate(tank.angle);
    ctx.fillStyle = '#11190b66'; ctx.fillRect(-21, -19, 44, 41);
    ctx.fillStyle = '#20291d'; ctx.fillRect(-22,-21,42,10); ctx.fillRect(-22,11,42,10);
    ctx.strokeStyle = '#82906b'; ctx.lineWidth = 1;
    for (let i = -18; i < 20; i += 7) { ctx.beginPath(); ctx.moveTo(i,-20); ctx.lineTo(i,-12); ctx.moveTo(i,12); ctx.lineTo(i,20); ctx.stroke(); }
    ctx.fillStyle = tank.id === 0 ? '#859e50' : '#b27547'; ctx.fillRect(-18,-13,35,26);
    ctx.strokeStyle = colors[tank.id]; ctx.lineWidth = 2; ctx.strokeRect(-17,-12,33,24);
    ctx.fillStyle = colors[tank.id]; ctx.fillRect(-8,-10,18,20);
    ctx.fillStyle = tank.id === 0 ? '#8da458' : '#be814f'; ctx.fillRect(-5,-7,11,14);
    ctx.fillStyle = colors[tank.id]; ctx.fillRect(4,-4,28,8);
    ctx.fillStyle = '#28301e'; ctx.fillRect(28,-3,5,6);
    ctx.restore();
    ctx.fillStyle = colors[tank.id]; ctx.font = 'bold 10px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${tank.id + 1}P`,tank.x,tank.y - 33);
    ctx.fillStyle = '#172010'; ctx.fillRect(tank.x - 15,tank.y + 29,30,3);
    ctx.fillStyle = colors[tank.id]; ctx.fillRect(tank.x - 15,tank.y + 29,30 * (1 - tank.cooldown / .55),3);
  }
  // Stable decoration keeps rendering deterministic without asset downloads.
  const random = (() => { let seed = 73; return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; })();
  const speckles = Array.from({length:180}, () => ({x:random()*WIDTH,y:random()*HEIGHT,s:1+random()*3}));
  function draw(dt) {
    ctx.fillStyle = '#35432f'; ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.strokeStyle = '#b3c38609'; ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,HEIGHT); ctx.stroke(); }
    for (let y = 0; y < HEIGHT; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WIDTH,y); ctx.stroke(); }
    ctx.fillStyle = '#cad79914'; speckles.forEach(s => ctx.fillRect(s.x,s.y,s.s,s.s));
    ctx.strokeStyle = '#76875e'; ctx.lineWidth = 2; ctx.strokeRect(12,12,WIDTH-24,HEIGHT-24);
    ctx.strokeStyle = '#76875e45'; ctx.setLineDash([6,9]); ctx.beginPath(); ctx.moveTo(WIDTH/2,25); ctx.lineTo(WIDTH/2,HEIGHT-25); ctx.stroke(); ctx.setLineDash([]);
    for (const [x,y] of [[110,270],[850,270]]) { ctx.strokeStyle = '#a3b77a22'; ctx.beginPath(); ctx.arc(x,y,52,0,Math.PI*2); ctx.stroke(); }
    ctx.font = '9px monospace'; ctx.fillStyle = '#a0b57b77'; ctx.textAlign = 'left'; ctx.fillText('SECTOR 01 / ' + MAPS[game.map].label, 29, 34); ctx.textAlign = 'right'; ctx.fillText('960 × 540',WIDTH-29,HEIGHT-27);
    for (const b of game.blocks) {
      ctx.fillStyle = '#15201055'; ctx.fillRect(b.x+5,b.y+6,b.w,b.h);
      if (b.type === 'brick') {
        ctx.fillStyle = b.hp === 1 ? '#806147' : '#9b7853'; ctx.fillRect(b.x,b.y,b.w,b.h);
        ctx.strokeStyle = '#584932'; ctx.lineWidth = 2;
        for (let y = b.y+15; y < b.y+b.h; y += 15) { ctx.beginPath(); ctx.moveTo(b.x,y); ctx.lineTo(b.x+b.w,y); ctx.stroke(); }
        for (let row=0;row<Math.ceil(b.h/15);row++) for(let x=b.x+((row%2)?12:24);x<b.x+b.w;x+=24){ctx.beginPath();ctx.moveTo(x,b.y+row*15);ctx.lineTo(x,Math.min(b.y+b.h,b.y+(row+1)*15));ctx.stroke();}
        ctx.strokeStyle = '#b89b6a'; ctx.lineWidth=1;ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);
        if(b.hp===1){ctx.strokeStyle='#3e3426';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.x+b.w*.5,b.y);ctx.lineTo(b.x+b.w*.4,b.y+b.h*.4);ctx.lineTo(b.x+b.w*.6,b.y+b.h*.6);ctx.lineTo(b.x+b.w*.5,b.y+b.h);ctx.stroke();}
      } else {
        ctx.fillStyle='#64715b';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle='#78866b';ctx.fillRect(b.x+3,b.y+3,b.w-6,5);
        ctx.strokeStyle='#94a07f';ctx.lineWidth=1;ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);
        ctx.strokeStyle='#4b5742';ctx.strokeRect(b.x+7,b.y+10,b.w-14,b.h-17);
        ctx.fillStyle='#adb895';for(const x of [b.x+5,b.x+b.w-6])for(const y of [b.y+5,b.y+b.h-6])ctx.fillRect(x,y,2,2);
      }
    }
    game.tanks.forEach(drawTank);
    for (const bullet of game.bullets) {
      ctx.strokeStyle=colors[bullet.owner]+'66';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(bullet.x-bullet.vx*.025,bullet.y-bullet.vy*.025);ctx.lineTo(bullet.x,bullet.y);ctx.stroke();
      ctx.fillStyle='#fff4c5';ctx.beginPath();ctx.arc(bullet.x,bullet.y,3,0,Math.PI*2);ctx.fill();
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(!paused){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}if(p.life<=0){particles.splice(i,1);continue;}ctx.globalAlpha=Math.min(1,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}
    ctx.globalAlpha=1;
    const shade=ctx.createRadialGradient(WIDTH/2,HEIGHT/2,160,WIDTH/2,HEIGHT/2,570);shade.addColorStop(0,'#00000000');shade.addColorStop(1,'#10190c40');ctx.fillStyle=shade;ctx.fillRect(0,0,WIDTH,HEIGHT);
  }
  function frame(time) {
    const dt = lastTime ? Math.min((time-lastTime)/1000,.05) : 0; lastTime=time;
    if (!paused) game.update(dt,inputs()); game.drainEvents().forEach(emit); draw(dt); updateUI(); requestAnimationFrame(frame);
  }
  updateUI(); requestAnimationFrame(frame);
})();
