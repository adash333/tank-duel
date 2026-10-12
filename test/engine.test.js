const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAPS } = require('../src/engine');
function playing(map) { const game = new Game(map); game.start(); game.phase = 'playing'; return game; }
function advance(game, seconds, inputs) { for(let i=0;i<seconds*100;i++) game.update(.01,inputs); }
test('all arenas have valid, unobstructed player spawns',()=>{
  for(const map of Object.keys(MAPS)){
    const game=playing(map);
    assert.deepEqual(game.tanks.map(({x,y,angle})=>({x,y,angle})),[
      {x:480,y:65,angle:Math.PI/2},
      {x:480,y:475,angle:-Math.PI/2}
    ],`${map} players face each other from opposite ends`);
    for(const tank of game.tanks)assert.ok(game.canMove(tank.x,tank.y,tank),`${map} player ${tank.id+1} spawn is clear`);
  }
});
test('both touchscreen inputs move and shoot at the same time',()=>{
  for(const map of Object.keys(MAPS)){
    const game=playing(map);
    game.update(.05,[{moveX:1,moveY:0,fire:true},{moveX:-1,moveY:0,fire:true}]);
    assert.ok(game.tanks[0].x>480);assert.ok(game.tanks[1].x<480);
    assert.equal(game.tanks[0].y,65);assert.equal(game.tanks[1].y,475);
    assert.equal(game.bullets.length,2);assert.equal(game.bullets[0].owner,0);assert.equal(game.bullets[1].owner,1);
  }
});
test('joystick aims and respects the arena boundary',()=>{
  const game=playing();game.blocks=[];
  advance(game,3,[{moveX:0,moveY:-1},{}]);assert.equal(game.tanks[0].angle,-Math.PI/2);assert.ok(game.tanks[0].y>=31);
});
test('tank cannot drive through steel walls or another tank',()=>{
  const game=playing();game.blocks=[{x:145,y:200,w:50,h:140,type:'steel',hp:Infinity}];
  Object.assign(game.tanks[0],{x:110,y:270,angle:0});
  Object.assign(game.tanks[1],{x:850,y:270,angle:Math.PI});
  advance(game,1,[{forward:true},{}]);assert.ok(game.tanks[0].x<=126);
  game.blocks=[];game.tanks[1].x=165;advance(game,1,[{forward:true},{}]);assert.ok(game.tanks[1].x-game.tanks[0].x>=38);
});
test('two hits destroy bricks, leaving steel intact',()=>{
  const game=playing();const brick=game.blocks.find(b=>b.type==='brick'),steel=game.blocks.find(b=>b.type==='steel');
  game.hitBlock(brick,0,0);assert.equal(brick.hp,1);game.hitBlock(brick,0,0);assert.ok(!game.blocks.includes(brick));
  game.hitBlock(steel,0,0);assert.ok(game.blocks.includes(steel));
});
test('projectiles ricochet once, then expire on a second impact',()=>{
  const game=playing();game.blocks=[];game.bullets=[{x:20,y:50,vx:-400,vy:0,owner:0,bounces:0,life:4}];
  advance(game,.05);assert.equal(game.bullets[0].bounces,1);assert.ok(game.bullets[0].vx>0);
  game.bullets[0].x=940;advance(game,.05);assert.equal(game.bullets.length,0);
});
test('a steel impact reflects the correct axis',()=>{
  const game=playing();game.blocks=[{x:200,y:100,w:60,h:100,type:'steel',hp:Infinity}];
  game.bullets=[{x:190,y:150,vx:400,vy:0,owner:0,bounces:0,life:4}];advance(game,.05);
  assert.ok(game.bullets[0].vx<0);assert.equal(game.bullets[0].vy,0);
});
test('three projectile hits award a round and three rounds win the match',()=>{
  const game=playing();game.blocks=[];
  Object.assign(game.tanks[1],{x:850,y:270});
  for(let round=0;round<3;round++){
    game.phase='playing';game.tanks[1].hp=3;
    for(let hit=0;hit<3;hit++){game.bullets=[{x:825,y:270,vx:400,vy:0,owner:0,bounces:0,life:4}];game.update(.02);}
    assert.equal(game.scores[0],round+1);
  }
  assert.equal(game.phase,'finished');assert.equal(game.winner,0);
  game.start();assert.deepEqual(game.scores,[0,0]);assert.equal(game.phase,'countdown');
});
test('simultaneous fatal hits are a draw',()=>{
  const game=playing();game.blocks=[];game.tanks.forEach(t=>t.hp=1);
  Object.assign(game.tanks[0],{x:110,y:270});
  Object.assign(game.tanks[1],{x:850,y:270});
  game.bullets=[{x:825,y:270,vx:400,vy:0,owner:0,bounces:0,life:4},{x:135,y:270,vx:-400,vy:0,owner:1,bounces:0,life:4}];
  game.update(.02);assert.equal(game.phase,'round-over');assert.deepEqual(game.scores,[0,0]);assert.equal(game.roundWinner,null);
});
test('timeout uses health, and equal health gives a draw',()=>{
  const game=playing();game.remaining=.01;game.tanks[1].hp=2;game.update(.02);assert.equal(game.roundWinner,0);
  const draw=playing();draw.remaining=.01;draw.update(.02);assert.equal(draw.roundWinner,null);assert.deepEqual(draw.scores,[0,0]);
});
test('countdown blocks movement and transitions to combat',()=>{
  const game=new Game();game.start();advance(game,2,[{moveX:1,moveY:0},{}]);assert.equal(game.tanks[0].x,480);assert.equal(game.tanks[0].y,65);
  advance(game,1.1);assert.equal(game.phase,'playing');
});
test('round transition resets damage and projectiles while preserving score',()=>{
  const game=playing();game.finishRound(0);advance(game,2.7);
  assert.equal(game.phase,'countdown');assert.equal(game.round,2);assert.deepEqual(game.scores,[1,0]);assert.deepEqual(game.tanks.map(t=>t.hp),[3,3]);assert.equal(game.bullets.length,0);
  assert.deepEqual(game.tanks.map(({x,y,angle})=>({x,y,angle})),[{x:480,y:65,angle:Math.PI/2},{x:480,y:475,angle:-Math.PI/2}]);
});
