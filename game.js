(() => {
"use strict";

/*
 GORILLA MOTOCROSS
 Phase 1~6 vertical slice
 - Phase 1: Canvas / game loop / state / camera
 - Phase 2: original pixel-art gorilla + motocross bike
 - Phase 3: scrolling terrain + parallax background
 - Phase 4: acceleration / braking / speed HUD
 - Phase 5: ramps + jump physics
 - Phase 6: air rotation / landing-ready posture

 No external libraries or assets are required.
 GitHub Pages compatible: static HTML/CSS/JS only.
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha:false });
ctx.imageSmoothingEnabled = false;

const W = canvas.width, H = canvas.height;
const TAU = Math.PI * 2;

const CONFIG = {
  gravity: 1450,
  maxSpeed: 840,
  turboMaxSpeed: 1000,
  acceleration: 980,
  brakeAcceleration: 420,
  friction: 80,
  airRotationAcceleration: 9,
  maxAngularVelocity: 5,
  angularDamping: 0.94,
  laneSpeed: 280,
  groundY: 545,
  playerScreenX: 0.35,
  wheelRadius: 16,
  bikeLength: 120,
  jumpVelocity: -650,
  megaJumpVelocity: -920,
};

const keys = new Set();
const touchKeys = new Set();

const input = {
  held(name) { return keys.has(name) || touchKeys.has(name); },
  anyStart() { return this.held("enter") || this.held("space") || this.held("accelerate"); }
};

addEventListener("keydown", e => {
  const k = keyName(e.key);
  keys.add(k);
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Enter"].includes(e.key)) e.preventDefault();
});
addEventListener("keyup", e => keys.delete(keyName(e.key)));
addEventListener("blur", () => { keys.clear(); touchKeys.clear(); });

document.querySelectorAll("[data-key]").forEach(btn => {
  const name = btn.dataset.key;
  const down = e => {
    e.preventDefault();
    btn.classList.add("active");
    touchKeys.add(name);
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const up = e => {
    e.preventDefault();
    btn.classList.remove("active");
    touchKeys.delete(name);
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
});

function keyName(k) {
  return ({
    ArrowLeft:"left", ArrowRight:"right", ArrowUp:"accelerate",
    ArrowDown:"nose", a:"accelerate", A:"accelerate",
    b:"brake", B:"brake", Enter:"enter", " ":"space",
    p:"pause", P:"pause", Escape:"pause"
  })[k] || k.toLowerCase();
}

// ---------- world ----------
const course = {
  length: 15000,
  ramps: [
    {x:900, w:180, h:80, mega:false},
    {x:1750, w:210, h:100, mega:false},
    {x:2850, w:230, h:130, mega:false},
    {x:4150, w:300, h:170, mega:false},
    {x:5600, w:360, h:220, mega:true},
    {x:7600, w:220, h:110, mega:false},
    {x:9300, w:280, h:150, mega:false},
    {x:11200, w:360, h:220, mega:true},
    {x:13200, w:250, h:130, mega:false}
  ]
};

const state = {
  mode:"TITLE",
  time:0,
  courseTime:0,
  best: null,
  cameraX:0,
  cameraY:0,
  shake:0,
  lastPause:false
};

const player = {
  x:320, y:CONFIG.groundY - CONFIG.wheelRadius,
  vx:0, vy:0,
  rotation:0,
  angularVelocity:0,
  grounded:true,
  accelerating:false,
  braking:false,
  wheelie:false,
  jumpState:"ground",
  lastGroundY:CONFIG.groundY,
  airTime:0,
  distance:0
};

function resetRace() {
  player.x=320;
  player.y=CONFIG.groundY-CONFIG.wheelRadius;
  player.vx=0; player.vy=0;
  player.rotation=0; player.angularVelocity=0;
  player.grounded=true;
  player.accelerating=false;
  player.braking=false;
  player.wheelie=false;
  player.jumpState="ground";
  player.lastGroundY=CONFIG.groundY;
  player.airTime=0;
  state.cameraX=0; state.cameraY=0; state.courseTime=0; state.shake=0;
}

// ---------- terrain ----------
function rampAt(x) {
  for (const r of course.ramps) {
    if (x >= r.x && x <= r.x+r.w) return r;
  }
  return null;
}

function terrainY(x) {
  const r = rampAt(x);
  if (!r) return CONFIG.groundY;
  const t=(x-r.x)/r.w;
  // smooth ramp: rises to peak near 78%, then descends toward the end
  if (t < 0.72) return CONFIG.groundY - r.h * (t/0.72);
  return CONFIG.groundY - r.h * (1-(t-0.72)/0.28);
}

function slopeAngle(x) {
  const e=2;
  const dy=terrainY(x+e)-terrainY(x-e);
  return Math.atan2(dy, 2*e);
}

// ---------- update ----------
function update(dt) {
  state.time += dt;

  if (input.held("pause") && !state.lastPause) {
    if (state.mode==="RACING") state.mode="PAUSED";
    else if (state.mode==="PAUSED") state.mode="RACING";
    else if (state.mode==="TITLE") startRace();
  }
  state.lastPause=input.held("pause");

  if (state.mode==="TITLE") {
    if (input.anyStart()) startRace();
    return;
  }
  if (state.mode==="PAUSED") return;
  if (state.mode!=="RACING") return;

  state.courseTime += dt;

  updatePlayer(dt);
  updateCamera(dt);

  if (player.x >= course.length) {
    state.mode="FINISH";
    state.best = state.best === null ? state.courseTime : Math.min(state.best,state.courseTime);
  }
}

function startRace() {
  resetRace();
  state.mode="RACING";
}

function updatePlayer(dt) {
  const acc=input.held("accelerate");
  const brake=input.held("brake");
  const left=input.held("left");
  const right=input.held("right");

  player.accelerating=acc;
  player.braking=brake;

  if (player.grounded) {
    if (acc) player.vx += CONFIG.acceleration*dt;
    else player.vx -= CONFIG.friction*dt;
    if (brake) player.vx -= CONFIG.brakeAcceleration*dt;
    player.vx=Math.max(0,Math.min(CONFIG.maxSpeed,player.vx));

    const rearX=player.x;
    const frontX=player.x+CONFIG.bikeLength;
    const rearY=terrainY(rearX);
    const frontY=terrainY(frontX);
    const groundAngle=Math.atan2(frontY-rearY,CONFIG.bikeLength);
    player.y=Math.max(rearY,frontY)-CONFIG.wheelRadius;
    player.rotation=groundAngle;

    player.wheelie=left && player.vx>120;
    if(player.wheelie){
      const target=-0.62;
      player.rotation += (target-player.rotation)*Math.min(1,dt*14);
      player.y -= 28;
    }

    const r=rampAt(frontX);
    if(r && frontX>=r.x+r.w-6){
      const angle=slopeAngle(frontX);
      const launchSpeed=Math.max(player.vx,560);
      const jumpBoost=r.mega ? 520 : 390;
      player.grounded=false;
      player.jumpState=r.mega ? "mega" : "jump";
      player.airTime=0;
      player.vx=Math.cos(angle)*launchSpeed;
      player.vy=Math.sin(angle)*launchSpeed-jumpBoost;
      player.rotation=angle;
      player.angularVelocity=0;
      player.y=terrainY(frontX)-CONFIG.wheelRadius-2;
    }
  } else {
    // Air controls affect trajectory directly: LEFT=higher, RIGHT=farther.
    if(left){ player.vy -= 1250*dt; player.angularVelocity -= 1.6*dt; }
    if(right){ player.vx += 560*dt; player.angularVelocity += 0.9*dt; }
    if(acc) player.vx += 90*dt;
    player.vx=Math.max(80,Math.min(CONFIG.maxSpeed+180,player.vx));
    player.vy += CONFIG.gravity*dt;
    player.y += player.vy*dt;
    player.angularVelocity=Math.max(-CONFIG.maxAngularVelocity,Math.min(CONFIG.maxAngularVelocity,player.angularVelocity));
    player.angularVelocity*=Math.pow(CONFIG.angularDamping,dt*60);
    player.rotation += player.angularVelocity*dt;
    const support=supportPoint();
    const wheelBottom=player.y+CONFIG.wheelRadius;
    if(wheelBottom>=support.y && player.vy>0){
      player.y=support.y-CONFIG.wheelRadius;
      land(support.angle);
    }
  }
  }

  player.x += player.vx*dt;
  player.distance=player.x;
}

function supportPoint() {
  // approximate chassis center over terrain. This is deliberately simple for Phase 1~6.
  const rearX=player.x;
  const frontX=player.x+CONFIG.bikeLength;
  const rearY=terrainY(rearX);
  const frontY=terrainY(frontX);
  const angle=Math.atan2(frontY-rearY, CONFIG.bikeLength);
  return {y:Math.max(rearY,frontY), angle};
}

function land(groundAngle) {
  let diff=normalizeAngle(player.rotation-groundAngle);
  const abs=Math.abs(diff);

  if (abs <= Math.PI/8) {
    player.grounded=true;
    player.vy=0;
    player.angularVelocity=0;
    player.rotation=groundAngle;
    player.jumpState="landed";
    state.shake=abs<0.10 ? 0 : 2;
  } else if (abs <= Math.PI/6) {
    player.grounded=true;
    player.vy=0;
    player.angularVelocity=0;
    player.rotation=groundAngle;
    player.jumpState="rough";
    state.shake=5;
  } else {
    player.grounded=true;
    player.vy=0;
    player.angularVelocity=0;
    player.rotation=groundAngle;
    player.jumpState="rough";
    player.vx*=0.72;
    state.shake=10;
  }
}

function normalizeAngle(a) {
  while(a>Math.PI) a-=TAU;
  while(a<-Math.PI) a+=TAU;
  return a;
}

function updateCamera(dt) {
  const target=player.x-W*CONFIG.playerScreenX;
  state.cameraX += (target-state.cameraX)*(1-Math.pow(0.0005,dt));
  const jumpOffset=Math.max(0, (CONFIG.groundY-50)-player.y);
  const targetY=Math.max(0, jumpOffset*0.18);
  state.cameraY += (targetY-state.cameraY)*(1-Math.pow(0.001,dt));

  state.shake *= Math.pow(0.01,dt);
}

// ---------- rendering ----------
function render() {
  ctx.fillStyle="#75c9e9";
  ctx.fillRect(0,0,W,H);

  drawBackground();
  drawWorld();
  drawPlayer();
  drawHud();

  if (state.mode==="TITLE") drawTitle();
  if (state.mode==="PAUSED") drawPause();
  if (state.mode==="FINISH") drawFinish();
}

function drawBackground() {
  // Sky bands
  ctx.fillStyle="#75c9e9"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#bce8ef"; ctx.fillRect(0,130,W,180);
  ctx.fillStyle="#e9f0d0"; ctx.fillRect(0,260,W,110);

  // Sun
  const sx=1040-(state.cameraX*0.05)%1400;
  ctx.fillStyle="#ffe36e";
  ctx.fillRect(sx,90,52,52);
  ctx.fillRect(sx-10,105,72,22);
  ctx.fillRect(sx+15,80,22,72);

  // Mountains
  drawMountains(0.15, 360, "#6fa6a0", 120);
  drawMountains(0.30, 410, "#568c7b", 90);

  // Showa-ish distant buildings
  const par=state.cameraX*0.55;
  for(let i=-2;i<14;i++){
    const x=i*150-(par%150);
    const h=70+(i%4)*18;
    ctx.fillStyle=i%2 ? "#9b8f7b" : "#aa9b86";
    ctx.fillRect(x,430-h,112,h);
    ctx.fillStyle="#625c50";
    for(let yy=445-h; yy<430; yy+=22){
      for(let xx=x+14; xx<x+100; xx+=24){
        ctx.fillRect(xx,yy,12,10);
      }
    }
    ctx.fillStyle="#766e62"; ctx.fillRect(x+48,430-h,16,h);
  }

  // foreground shrubs
  ctx.fillStyle="#39725a";
  for(let i=-1;i<22;i++){
    const x=i*75-(state.cameraX*0.8%75);
    ctx.fillRect(x,505-(i%3)*8,35,40+(i%3)*8);
    ctx.fillRect(x-10,515-(i%3)*8,55,12);
  }
}

function drawMountains(parallax, baseY, color, h) {
  const off=-(state.cameraX*parallax)%500;
  ctx.fillStyle=color;
  for(let i=-2;i<5;i++){
    const x=off+i*500;
    ctx.beginPath();
    ctx.moveTo(x,baseY);
    ctx.lineTo(x+140,baseY-h);
    ctx.lineTo(x+280,baseY);
    ctx.lineTo(x+380,baseY-h*0.55);
    ctx.lineTo(x+500,baseY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWorld() {
  // course ground
  const start=Math.floor(state.cameraX/32)*32-80;
  for(let x=start;x<state.cameraX+W+80;x+=32){
    const y=terrainY(x);
    ctx.fillStyle="#6a4b2c";
    ctx.fillRect(x-state.cameraX,y-state.cameraY,32,H);
    ctx.fillStyle="#8db34f";
    ctx.fillRect(x-state.cameraX,y-state.cameraY-5,32,5);
    ctx.fillStyle="#4f7d36";
    if(((x/32)|0)%3===0) ctx.fillRect(x-state.cameraX+8,y-state.cameraY-9,5,4);
  }

  // ramp edge accents
  for(const r of course.ramps){
    if(r.x+r.w < state.cameraX-50 || r.x>state.cameraX+W+50) continue;
    const x=r.x-state.cameraX, y=terrainY(r.x)-state.cameraY;
    ctx.fillStyle=r.mega ? "#e05a3f" : "#d8a33e";
    ctx.fillRect(x,y-8,r.w,8);
    ctx.fillStyle="#222";
    for(let p=0;p<r.w;p+=32) ctx.fillRect(x+p,y-16,16,8);
  }

  // Start / finish sign
  if(state.cameraX<450){
    ctx.fillStyle="#333"; ctx.fillRect(170-state.cameraX,410-state.cameraY,8,135);
    ctx.fillStyle="#fff"; ctx.fillRect(178-state.cameraX,420-state.cameraY,125,60);
    ctx.fillStyle="#111"; ctx.font="bold 22px monospace";
    ctx.fillText("START",195-state.cameraX,458-state.cameraY);
  }

  // Mega apartment landmark behind the largest ramp
  const ax=5450-state.cameraX;
  if(ax>-360 && ax<W+360) drawApartment(ax,terrainY(5450)-185-state.cameraY);
}

function drawApartment(x,y) {
  ctx.save();

  // Very shabby Showa-era apartment, deliberately placed as a jump-over obstacle.
  ctx.fillStyle="#3a332d";
  ctx.fillRect(x+8,y+158,270,18);

  ctx.fillStyle="#665a4d";
  ctx.fillRect(x,y,270,165);
  ctx.fillStyle="#87735f";
  ctx.fillRect(x+8,y+8,254,149);

  // Weathered patches
  ctx.fillStyle="#6b5c4d";
  ctx.fillRect(x+18,y+18,35,22);
  ctx.fillRect(x+185,y+12,48,18);
  ctx.fillRect(x+95,y+96,45,25);
  ctx.fillStyle="#9a8268";
  ctx.fillRect(x+62,y+42,22,35);
  ctx.fillRect(x+212,y+72,28,28);

  // Old windows
  for(let row=0;row<3;row++){
    for(let col=0;col<5;col++){
      const wx=x+20+col*47, wy=y+32+row*38;
      ctx.fillStyle="#393633";
      ctx.fillRect(wx,wy,30,24);
      ctx.fillStyle=(row+col)%3===0 ? "#d7b75e" : "#56606a";
      ctx.fillRect(wx+4,wy+4,22,16);
      ctx.fillStyle="#665a4d";
      ctx.fillRect(wx+14,wy,3,24);
    }
  }

  // Rusty balconies
  ctx.fillStyle="#383632";
  for(let row=0;row<3;row++){
    const by=y+60+row*38;
    ctx.fillRect(x+4,by,262,5);
    for(let bx=x+10;bx<x+262;bx+=18) ctx.fillRect(bx,by,3,20);
  }

  // Pipes
  ctx.fillStyle="#4a4741";
  ctx.fillRect(x+245,y+8,8,150);
  ctx.fillRect(x+252,y+40,17,6);
  ctx.fillRect(x+252,y+104,17,6);

  // Roof, tank and antenna
  ctx.fillStyle="#4b4842";
  ctx.fillRect(x-6,y-8,282,12);
  ctx.fillStyle="#3d403d";
  ctx.fillRect(x+205,y-32,38,24);
  ctx.fillRect(x+221,y-54,5,22);
  ctx.fillRect(x+208,y-52,34,3);

  // Laundry
  ctx.fillStyle="#e7e1cf";
  ctx.fillRect(x+28,y+112,34,6);
  ctx.fillStyle="#d04d4d";
  ctx.fillRect(x+69,y+114,28,6);
  ctx.fillStyle="#4d7ea8";
  ctx.fillRect(x+106,y+111,31,6);

  ctx.restore();
}
function drawPlayer() {
  const sx=player.x-state.cameraX;
  const sy=player.y-state.cameraY;
  const shakeX=(Math.random()-.5)*state.shake;
  const shakeY=(Math.random()-.5)*state.shake;
  ctx.save();
  ctx.translate(Math.round(sx+shakeX),Math.round(sy+shakeY));
  ctx.rotate(player.rotation);

  drawBike();
  drawGorilla();

  ctx.restore();
}

function drawBike() {
  const rear=0, front=CONFIG.bikeLength;
  function wheel(x){
    ctx.fillStyle="#141414"; ctx.beginPath(); ctx.arc(x,0,21,0,TAU); ctx.fill();
    ctx.fillStyle="#292929";
    for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.fillRect(Math.round(x+Math.cos(a)*18-2),Math.round(Math.sin(a)*18-2),5,5);}
    ctx.fillStyle="#aaa"; ctx.beginPath(); ctx.arc(x,0,8,0,TAU); ctx.fill();
    ctx.fillStyle="#555"; ctx.beginPath(); ctx.arc(x,0,3,0,TAU); ctx.fill();
    ctx.strokeStyle="#777"; ctx.lineWidth=2;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+Math.cos(a)*7,Math.sin(a)*7);ctx.stroke();}
  }
  wheel(rear); wheel(front);
  ctx.strokeStyle="#333"; ctx.lineWidth=8; ctx.beginPath();ctx.moveTo(12,-5);ctx.lineTo(54,-31);ctx.lineTo(96,-13);ctx.lineTo(118,-2);ctx.stroke();
  ctx.strokeStyle="#777";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(15,-5);ctx.lineTo(55,-28);ctx.lineTo(95,-11);ctx.lineTo(116,-2);ctx.stroke();
  ctx.fillStyle="#555";ctx.fillRect(48,-19,33,29);ctx.fillStyle="#8a8a8a";ctx.fillRect(54,-14,22,20);ctx.fillStyle="#333";for(let i=0;i<4;i++)ctx.fillRect(57+i*4,-11,2,15);
  ctx.fillStyle="#b43b32";ctx.beginPath();ctx.moveTo(49,-35);ctx.lineTo(82,-35);ctx.lineTo(91,-18);ctx.lineTo(56,-18);ctx.closePath();ctx.fill();
  ctx.fillStyle="#202020";ctx.fillRect(75,-44,33,9);ctx.fillRect(82,-48,22,5);
  ctx.strokeStyle="#d1a04a";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(38,-3);ctx.lineTo(56,-29);ctx.stroke();
  ctx.strokeStyle="#c8c8c8";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(97,-4);ctx.lineTo(117,-43);ctx.stroke();ctx.strokeStyle="#666";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(103,-4);ctx.lineTo(120,-43);ctx.stroke();
  ctx.strokeStyle="#333";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(112,-43);ctx.lineTo(122,-51);ctx.lineTo(130,-49);ctx.stroke();
  ctx.fillStyle="#eee";ctx.beginPath();ctx.moveTo(112,-48);ctx.lineTo(127,-46);ctx.lineTo(124,-31);ctx.lineTo(113,-34);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#777";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(69,4);ctx.lineTo(94,8);ctx.lineTo(112,5);ctx.stroke();ctx.fillStyle="#999";ctx.fillRect(109,1,18,8);
  ctx.fillStyle="#b43b32";ctx.beginPath();ctx.moveTo(-1,-8);ctx.quadraticCurveTo(17,-29,38,-16);ctx.lineTo(34,-10);ctx.quadraticCurveTo(17,-21,4,-3);ctx.closePath();ctx.fill();
  ctx.fillStyle="#555";ctx.fillRect(49,0,15,4);
}
function drawGorilla() {
  const bob=player.grounded ? Math.sin(state.time*10)*1.2 : -2;
  ctx.translate(55,-60+bob);

  // Massive gorilla body.
  ctx.fillStyle="#3a241d";
  ctx.fillRect(-12,30,22,27); ctx.fillRect(22,30,22,27);
  ctx.fillStyle="#181818";
  ctx.fillRect(-17,53,29,8); ctx.fillRect(18,53,30,8);

  ctx.fillStyle="#45291f";
  ctx.fillRect(-25,-10,80,53);
  ctx.fillRect(-37,-2,21,39); ctx.fillRect(50,-2,21,39);
  ctx.fillStyle="#714534";
  ctx.fillRect(-31,-7,88,29);
  ctx.fillRect(-9,-4,30,20); ctx.fillRect(22,-4,30,20);

  // Thick arms.
  ctx.fillStyle="#3b241c";
  ctx.fillRect(-45,7,18,42); ctx.fillRect(54,7,18,42);
  ctx.fillRect(-49,39,24,14); ctx.fillRect(52,39,24,14);

  // Gorilla neck/head: heavy brow, wide muzzle and strong jaw.
  ctx.fillStyle="#332019"; ctx.fillRect(8,-15,34,18);
  ctx.fillStyle="#3b241c"; ctx.fillRect(2,-49,45,31);
  ctx.fillRect(-8,-37,10,17); ctx.fillRect(47,-37,10,17);

  ctx.fillStyle="#241713";
  ctx.fillRect(6,-37,39,10); ctx.fillRect(11,-42,30,7);

  ctx.fillStyle="#0c0a09";
  ctx.fillRect(13,-34,8,5); ctx.fillRect(31,-34,8,5);
  ctx.fillStyle="#b18a55";
  ctx.fillRect(16,-33,3,2); ctx.fillRect(34,-33,3,2);

  // Broad protruding muzzle and gorilla nose.
  ctx.fillStyle="#8a5a3e";
  ctx.fillRect(8,-27,37,19); ctx.fillRect(13,-22,29,17);
  ctx.fillStyle="#2a1a15";
  ctx.fillRect(13,-27,29,9); ctx.fillRect(10,-24,7,6); ctx.fillRect(38,-24,7,6);
  ctx.fillStyle="#080707";
  ctx.fillRect(17,-24,6,4); ctx.fillRect(33,-24,6,4);

  ctx.fillStyle="#6b432f"; ctx.fillRect(12,-10,33,10);
  ctx.fillStyle="#111"; ctx.fillRect(20,-7,18,4);

  ctx.fillStyle="#f1eee5"; ctx.fillRect(16,5,28,21);
  ctx.fillStyle="#111"; ctx.font="bold 14px monospace"; ctx.fillText("1",26,20);
}
function poly(points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
  ctx.closePath(); ctx.fill();
}

function drawHud() {
  if(state.mode==="TITLE") return;
  ctx.fillStyle="rgba(0,0,0,.55)";
  ctx.fillRect(18,18,330,86);
  ctx.fillStyle="#fff";
  ctx.font="bold 24px monospace";
  ctx.fillText(`SPEED ${String(Math.round(player.vx)).padStart(3," ")}`,32,48);
  ctx.font="18px monospace";
  ctx.fillText(`DIST ${Math.min(100,Math.floor(player.x/course.length*100))}%`,32,76);
  ctx.fillText(`TIME ${state.courseTime.toFixed(1)}`,180,76);

  // state label
  const label = player.grounded ? (player.wheelie ? "WHEELIE" : "GROUND") :
                (player.jumpState==="mega" ? "MEGA JUMP!" : "AIR");
  ctx.fillStyle="#ffe36e";
  ctx.font="bold 20px monospace";
  ctx.fillText(label, W-220,42);

  ctx.fillStyle="#fff";
  ctx.font="16px monospace";
  ctx.fillText("A/ACCEL  ←→ AIR ROTATE  (→ = NOSE DOWN)  ← GROUND WHEELIE  P PAUSE",W-610,H-24);
}

function drawTitle() {
  ctx.fillStyle="rgba(0,0,0,.45)";
  ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  ctx.fillStyle="#ffe36e";
  ctx.font="bold 68px monospace";
  ctx.fillText("GORILLA MOTOCROSS",W/2,205);
  ctx.fillStyle="#fff";
  ctx.font="bold 28px monospace";
  ctx.fillText("SUPER JUMP RACING",W/2,255);

  // decorative gorilla
  ctx.save();
  ctx.translate(W/2,360);
  ctx.scale(2.2,2.2);
  drawGorilla();
  ctx.restore();

  ctx.fillStyle="#fff";
  ctx.font="bold 24px monospace";
  const blink=Math.floor(state.time*2)%2;
  if(blink) ctx.fillText("PRESS ENTER / ACCEL TO START",W/2,585);
  ctx.font="16px monospace";
  ctx.fillText("Original browser game • Phase 1~6 prototype",W/2,625);
  ctx.textAlign="left";
}

function drawPause() {
  ctx.fillStyle="rgba(0,0,0,.58)";
  ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  ctx.fillStyle="#fff";
  ctx.font="bold 58px monospace";
  ctx.fillText("PAUSED",W/2,330);
  ctx.font="20px monospace";
  ctx.fillText("P / ESC で再開",W/2,375);
  ctx.textAlign="left";
}

function drawFinish() {
  ctx.fillStyle="rgba(0,0,0,.58)";
  ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  ctx.fillStyle="#ffe36e";
  ctx.font="bold 58px monospace";
  ctx.fillText("GOAL!",W/2,290);
  ctx.fillStyle="#fff";
  ctx.font="26px monospace";
  ctx.fillText(`TIME  ${state.courseTime.toFixed(2)} sec`,W/2,345);
  ctx.font="18px monospace";
  ctx.fillText("ENTER / ACCEL でリスタート",W/2,400);
  ctx.textAlign="left";

  if(input.anyStart()) startRace();
}

// ---------- loop ----------
let last=performance.now();
function frame(now) {
  let dt=(now-last)/1000;
  last=now;
  dt=Math.min(dt,0.05); // tab resume / slow device protection
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose a tiny debug API for future phases.
window.GorillaMotocross = {
  player, state, course, resetRace, startRace,
  config:CONFIG
};

})();
