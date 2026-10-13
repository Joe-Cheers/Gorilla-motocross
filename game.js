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
  maxSpeed: 420,
  turboMaxSpeed: 600,
  acceleration: 240,
  brakeAcceleration: 360,
  friction: 80,
  airRotationAcceleration: 8,
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
  const nose=input.held("nose");
  const left=input.held("left");
  const right=input.held("right");

  player.accelerating=acc;
  player.braking=brake;

  if (player.grounded) {
    if (acc) player.vx += CONFIG.acceleration*dt;
    else player.vx -= CONFIG.friction*dt;

    if (brake) player.vx -= CONFIG.brakeAcceleration*dt;
    player.vx=Math.max(0,Math.min(CONFIG.maxSpeed,player.vx));

    const ground=supportPoint();
    player.y=ground.y-CONFIG.wheelRadius;
    player.rotation=ground.angle;

    // A small front-wheel lift when the rider is moving quickly.
    player.wheelie = (right || left) && player.vx > 160;
    if (player.wheelie) {
      player.rotation += (right ? -0.22 : 0.22);
    }

    const r=rampAt(player.x+CONFIG.bikeLength*0.55);
    if (r && player.x+CONFIG.bikeLength*0.55 >= r.x+r.w*0.60) {
      const launch= r.mega ? CONFIG.megaJumpVelocity : CONFIG.jumpVelocity;
      player.vy=launch;
      player.grounded=false;
      player.jumpState=r.mega ? "mega" : "jump";
      player.airTime=0;
      // launch angle follows ramp, but remains controllable in air
      player.rotation=ground.angle;
    }
  } else {
    // air
    player.airTime += dt;
    player.vy += CONFIG.gravity*dt;
    player.y += player.vy*dt;

    let rotInput=0;
    if (left) rotInput -= 1;
    if (right || nose) rotInput += 1;
    player.angularVelocity += rotInput*CONFIG.airRotationAcceleration*dt;
    player.angularVelocity *= Math.pow(CONFIG.angularDamping, dt*60);
    player.angularVelocity=Math.max(-CONFIG.maxAngularVelocity,
                                   Math.min(CONFIG.maxAngularVelocity,player.angularVelocity));
    player.rotation += player.angularVelocity*dt;

    // Horizontal control is intentionally modest in air.
    if (acc) player.vx += 70*dt;
    player.vx=Math.max(80,Math.min(CONFIG.maxSpeed,player.vx));

    const support=supportPoint();
    const wheelBottom=player.y+CONFIG.wheelRadius;

    if (wheelBottom >= support.y && player.vy > 0) {
      player.y=support.y-CONFIG.wheelRadius;
      land(support.angle);
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
  return {y:Math.min(rearY,frontY), angle};
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
  const ax=5480-state.cameraX*0.55;
  if(ax>-300 && ax<W+300) drawApartment(ax,350-state.cameraY*0.55);
}

function drawApartment(x,y) {
  // Original shabby Showa apartment, background scale.
  ctx.fillStyle="#7e6c5b"; ctx.fillRect(x,y,250,170);
  ctx.fillStyle="#b69a75"; ctx.fillRect(x+12,y+12,226,146);
  ctx.fillStyle="#5b554b"; ctx.fillRect(x+20,y+24,210,12);
  ctx.fillStyle="#413e39";
  for(let row=0;row<3;row++){
    for(let col=0;col<5;col++){
      ctx.fillRect(x+28+col*40,y+50+row*34,24,20);
      ctx.fillStyle="#d8c87a";
      if((row+col)%3===0) ctx.fillRect(x+32+col*40,y+54+row*34,16,12);
      ctx.fillStyle="#413e39";
    }
  }
  ctx.fillStyle="#6b5b4c";
  ctx.fillRect(x+100,y+125,50,33);
  // rooftop water tank / antenna
  ctx.fillStyle="#4f5148"; ctx.fillRect(x+180,y-25,35,25);
  ctx.fillRect(x+196,y-50,4,25);
  ctx.fillRect(x+184,y-48,30,3);
  // laundry
  ctx.fillStyle="#f3eee0";
  ctx.fillRect(x+12,y+100,32,5);
  ctx.fillStyle="#d84f4f"; ctx.fillRect(x+48,y+101,28,5);
  ctx.fillStyle="#4f86b7"; ctx.fillRect(x+80,y+99,25,6);
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
  // rear/front wheel
  const rear=0, front=CONFIG.bikeLength;
  for(const wx of [rear,front]){
    ctx.fillStyle="#171717";
    ctx.beginPath(); ctx.arc(wx,0,CONFIG.wheelRadius,0,TAU); ctx.fill();
    ctx.fillStyle="#aaa";
    ctx.fillRect(wx-2,-12,4,24);
    ctx.fillRect(wx-12,-2,24,4);
    ctx.fillStyle="#333"; ctx.beginPath(); ctx.arc(wx,0,5,0,TAU); ctx.fill();
  }

  // frame
  ctx.fillStyle="#d83c32";
  poly([[10,-8],[42,-32],[78,-18],[101,-5],[72,0],[42,0]]);
  ctx.fillStyle="#f2c43d";
  ctx.fillRect(48,-31,28,7);
  ctx.fillStyle="#252525";
  ctx.fillRect(72,-38,38,6); // handlebar
  ctx.fillRect(88,-36,5,14);
  ctx.fillStyle="#1d1d1d";
  ctx.fillRect(31,-37,38,7); // seat
  ctx.fillStyle="#bbb";
  ctx.fillRect(99,-5,5,18); // front fork
  ctx.fillRect(103,-6,4,20);
}

function drawGorilla() {
  // Comical muscular gorilla: deliberately original pixel-art construction.
  const bob = player.grounded ? Math.sin(state.time*10)*1.5 : -2;
  ctx.translate(55,-58+bob);

  // legs
  ctx.fillStyle="#4b3024";
  ctx.fillRect(-8,28,18,25);
  ctx.fillRect(18,28,18,25);
  ctx.fillStyle="#252525";
  ctx.fillRect(-12,50,25,7);
  ctx.fillRect(14,50,25,7);

  // huge torso
  ctx.fillStyle="#4b3024";
  ctx.fillRect(-18,-8,70,48);
  ctx.fillRect(-28,2,18,34);
  ctx.fillRect(48,2,18,34);
  // chest highlights
  ctx.fillStyle="#694433";
  ctx.fillRect(-7,-1,24,16);
  ctx.fillRect(21,-1,24,16);

  // arms
  ctx.fillStyle="#3d281f";
  ctx.fillRect(-34,4,14,42);
  ctx.fillRect(58,4,14,42);
  ctx.fillRect(-38,40,20,10);
  ctx.fillRect(56,40,20,10);

  // head
  ctx.fillStyle="#4b3024";
  ctx.fillRect(2,-43,44,38);
  ctx.fillRect(-5,-34,8,18);
  ctx.fillRect(45,-34,8,18);

  // helmet
  ctx.fillStyle="#f2c43d";
  ctx.fillRect(-2,-50,50,10);
  ctx.fillRect(6,-57,36,9);
  ctx.fillStyle="#d83c32";
  ctx.fillRect(20,-55,10,7);

  // face
  ctx.fillStyle="#c18455";
  ctx.fillRect(12,-34,25,19);
  ctx.fillStyle="#111";
  ctx.fillRect(17,-29,4,4);
  ctx.fillRect(29,-29,4,4);
  ctx.fillRect(21,-20,14,4);

  // neck
  ctx.fillStyle="#3d281f"; ctx.fillRect(13,-9,22,10);

  // racing number patch
  ctx.fillStyle="#f2f2e9"; ctx.fillRect(20,4,20,18);
  ctx.fillStyle="#111"; ctx.font="bold 13px monospace"; ctx.fillText("1",27,18);
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
  ctx.fillText("A/ACCEL  ←→ AIR ROTATE  ↓ NOSE  P PAUSE",W-560,H-24);
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
