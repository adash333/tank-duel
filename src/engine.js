(function (root) {
  'use strict';
  const WIDTH = 960, HEIGHT = 540, RADIUS = 19;
  const MAPS = {
    depot: { name: '補給基地', label: 'DEPOT', blocks: [
      [225, 95, 90, 45, 'steel'], [645, 400, 90, 45, 'steel'],
      [225, 400, 90, 45, 'steel'], [645, 95, 90, 45, 'steel'],
      [435, 105, 90, 80, 'brick'], [435, 355, 90, 80, 'brick'],
      [285, 235, 55, 70, 'brick'], [620, 235, 55, 70, 'brick']
    ] },
    crossfire: { name: '交差戦線', label: 'CROSSFIRE', blocks: [
      [325, 90, 45, 145, 'steel'], [590, 305, 45, 145, 'steel'],
      [325, 305, 45, 145, 'steel'], [590, 90, 45, 145, 'steel'],
      [435, 245, 90, 50, 'brick'], [190, 155, 60, 45, 'brick'], [710, 340, 60, 45, 'brick'],
      [190, 340, 60, 45, 'brick'], [710, 155, 60, 45, 'brick']
    ] },
    courtyard: { name: '中庭', label: 'COURTYARD', blocks: [
      [325, 175, 310, 40, 'brick'], [325, 325, 310, 40, 'brick'],
      [210, 85, 55, 55, 'steel'], [695, 400, 55, 55, 'steel'],
      [210, 400, 55, 55, 'steel'], [695, 85, 55, 55, 'steel']
    ] }
  };
  function circleRect(x, y, radius, b) {
    const dx = x - Math.max(b.x, Math.min(x, b.x + b.w));
    const dy = y - Math.max(b.y, Math.min(y, b.y + b.h));
    return dx * dx + dy * dy < radius * radius;
  }
  class Game {
    constructor(map = 'depot') {
      this.map = MAPS[map] ? map : 'depot';
      this.scores = [0, 0]; this.round = 1; this.events = []; this.phase = 'ready';
      this.resetArena();
    }
    resetArena() {
      this.blocks = MAPS[this.map].blocks.map(([x, y, w, h, type], id) => ({ x, y, w, h, type, id, hp: type === 'brick' ? 2 : Infinity }));
      this.tanks = [
        { x: 110, y: 270, angle: 0, hp: 3, cooldown: 0, id: 0 },
        { x: 850, y: 270, angle: Math.PI, hp: 3, cooldown: 0, id: 1 }
      ];
      this.bullets = []; this.remaining = 60; this.winner = null; this.roundWinner = null;
    }
    start() { this.scores = [0, 0]; this.round = 1; this.events = []; this.resetArena(); this.phase = 'countdown'; this.phaseTime = 3; }
    canMove(x, y, tank) {
      if (x < RADIUS + 12 || x > WIDTH - RADIUS - 12 || y < RADIUS + 12 || y > HEIGHT - RADIUS - 12) return false;
      if (this.blocks.some(b => circleRect(x, y, RADIUS, b))) return false;
      return !this.tanks.some(t => t.id !== tank.id && t.hp > 0 && Math.hypot(t.x - x, t.y - y) < RADIUS * 2);
    }
    fire(tank) {
      if (tank.cooldown > 0 || tank.hp <= 0) return;
      const x = tank.x + Math.cos(tank.angle) * 30, y = tank.y + Math.sin(tank.angle) * 30;
      tank.cooldown = 0.55;
      const blocking = this.blocks.find(b => circleRect(x, y, 4, b));
      this.events.push({ type: 'shot', x, y, owner: tank.id });
      if (blocking) { this.hitBlock(blocking, x, y); return; }
      this.bullets.push({ x, y, vx: Math.cos(tank.angle) * 400, vy: Math.sin(tank.angle) * 400, owner: tank.id, bounces: 0, life: 4 });
    }
    hitBlock(block, x, y) {
      this.events.push({ type: 'spark', x, y });
      if (block.type === 'brick') {
        block.hp--;
        if (block.hp <= 0) {
          this.blocks = this.blocks.filter(b => b !== block);
          this.events.push({ type: 'break', x: block.x + block.w / 2, y: block.y + block.h / 2 });
        }
      }
    }
    finishRound(winner) {
      this.roundWinner = winner;
      if (winner !== null) this.scores[winner]++;
      this.events.push({ type: 'round', winner });
      if (this.scores.some(score => score >= 3)) {
        this.winner = this.scores.findIndex(score => score >= 3); this.phase = 'finished';
      } else { this.phase = 'round-over'; this.phaseTime = 2.6; }
    }
    update(dt, inputs = [{}, {}]) {
      dt = Math.min(Math.max(dt, 0), 0.05);
      if (this.phase === 'countdown' || this.phase === 'round-over') {
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) {
          if (this.phase === 'round-over') { this.round++; this.resetArena(); this.phase = 'countdown'; this.phaseTime = 3; }
          else { this.phase = 'playing'; this.events.push({ type: 'go' }); }
        }
        return;
      }
      if (this.phase !== 'playing') return;
      this.remaining = Math.max(0, this.remaining - dt);
      for (const tank of this.tanks) {
        const input = inputs[tank.id] || {};
        tank.cooldown = Math.max(0, tank.cooldown - dt);
        let velocity;
        if (Number.isFinite(input.moveX) && Number.isFinite(input.moveY)) {
          const magnitude = Math.min(1, Math.hypot(input.moveX, input.moveY));
          if (magnitude > .12) tank.angle = Math.atan2(input.moveY, input.moveX);
          velocity = magnitude > .12 ? magnitude * 145 * dt : 0;
        } else {
          tank.angle += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 2.8 * dt;
          velocity = ((input.forward ? 1 : 0) - (input.backward ? 1 : 0)) * 145 * dt;
        }
        const x = tank.x + Math.cos(tank.angle) * velocity, y = tank.y + Math.sin(tank.angle) * velocity;
        if (this.canMove(x, tank.y, tank)) tank.x = x;
        if (this.canMove(tank.x, y, tank)) tank.y = y;
        if (input.fire) this.fire(tank);
      }
      const survivors = [];
      for (const bullet of this.bullets) {
        bullet.life -= dt; let dead = bullet.life <= 0;
        const steps = Math.max(1, Math.ceil(Math.hypot(bullet.vx, bullet.vy) * dt / 4));
        for (let i = 0; i < steps && !dead; i++) {
          const oldX = bullet.x, oldY = bullet.y;
          bullet.x += bullet.vx * dt / steps; bullet.y += bullet.vy * dt / steps;
          let reflectX = false, reflectY = false;
          if (bullet.x < 16 || bullet.x > WIDTH - 16) reflectX = true;
          if (bullet.y < 16 || bullet.y > HEIGHT - 16) reflectY = true;
          const block = this.blocks.find(b => circleRect(bullet.x, bullet.y, 4, b));
          if (block) {
            this.hitBlock(block, bullet.x, bullet.y);
            if (block.type === 'brick') dead = true;
            else {
              reflectX = !circleRect(bullet.x, oldY, 4, block) ? false : true;
              reflectY = !reflectX;
            }
          }
          if (!dead && (reflectX || reflectY)) {
            this.events.push({ type: 'spark', x: bullet.x, y: bullet.y });
            if (bullet.bounces >= 1) dead = true;
            else {
              if (reflectX) bullet.vx *= -1;
              if (reflectY) bullet.vy *= -1;
              bullet.x = oldX; bullet.y = oldY; bullet.bounces++;
            }
          }
          if (!dead) {
            const target = this.tanks.find(t => t.id !== bullet.owner && t.hp > 0 && Math.hypot(t.x - bullet.x, t.y - bullet.y) < RADIUS + 4);
            if (target) {
              target.hp--; dead = true;
              this.events.push({ type: target.hp === 0 ? 'explosion' : 'hit', x: target.x, y: target.y, owner: target.id });
            }
          }
        }
        if (!dead) survivors.push(bullet);
      }
      this.bullets = survivors;
      const alive = this.tanks.filter(t => t.hp > 0);
      if (alive.length < 2) this.finishRound(alive.length === 1 ? alive[0].id : null);
      else if (this.remaining === 0) this.finishRound(this.tanks[0].hp === this.tanks[1].hp ? null : this.tanks[0].hp > this.tanks[1].hp ? 0 : 1);
    }
    drainEvents() { const events = this.events; this.events = []; return events; }
  }
  const api = { Game, MAPS, WIDTH, HEIGHT, RADIUS, circleRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TankEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
