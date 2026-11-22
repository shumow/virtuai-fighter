"use strict";

const roster = [
  { name: "Codex", color: "#9fffd3", speed: 3.05, weight: 1, power: 1,
    special: { name: "Hotfix", damage: 27, windup: .25, duration: .69, reach: 2.55, shove: .83, lunge: .64 } },
  { name: "Claude Crab", color: "#ffa96b", speed: 2.52, weight: 1.23, power: 1.20,
    special: { name: "Claw Clamp", damage: 31, windup: .38, duration: .85, reach: 2.48, shove: 1.35, lunge: .31 } },
  { name: "Copilot", color: "#a5dcff", speed: 3.62, weight: .85, power: .89,
    special: { name: "Paperclip Rocket", damage: 25, windup: .20, duration: .64, reach: 2.88, shove: .72, lunge: 1.18 } },
  { name: "Gemini", color: "#c2aaff", speed: 3.26, weight: .93, power: .95,
    quick: { reach: 1.68 },
    heavy: { damage: 17, windup: .33, duration: .71, reach: 1.93, shove: 1.26 },
    special: { name: "Parallax", damage: 24, windup: .29, duration: .82, reach: 1.84, shove: .86, lunge: .44, sidestep: 1.18 } },
];
const standard = {
  quick: { damage: 10, windup: .11, duration: .32, reach: 1.55, shove: .28, lunge: .12 },
  heavy: { damage: 20, windup: .26, duration: .59, reach: 1.79, shove: .78, lunge: .28 },
};
const buttons = { KeyJ: "quick", KeyK: "heavy", KeyL: "special" };
const movement = {
  ArrowLeft: [-1,0], KeyA: [-1,0], ArrowRight: [1,0], KeyD: [1,0],
  ArrowUp: [0,-1], KeyW: [0,-1], ArrowDown: [0,1], KeyS: [0,1],
};
const $ = id => document.getElementById(id);
const menu = $("menu"), match = $("match"), rival = $("rival"), controls = $("controls");
const stage = new Arena($("arena"));
const cards = [...document.querySelectorAll("[data-fighter]")];
const pad = [...document.querySelectorAll("[data-key]")];
const specialButton = $("special");
const specialCooldown = 2.6;
const pressed = new Set();
const pointerKeys = new Map();
const stored = { get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage can be disabled. */ } } };

let selected = 0, enemy = 1;
let fighters = [], sparks = [], queued = null;
let clock = 45, round = 1, phase = "menu", phaseTime = 0, pause = false;
let worldTime = 0, lastFrame = 0, animation = 0, banner = "";
let brain = { time: 0, intent: "approach", step: 1 };
let audio, sound = stored.get("virtuai-sound") !== "off";

function selectFighter(id) {
  selected = id;
  const options = roster.flatMap((fighter, index) => {
    if (index === id) return [];
    const option = new Option(fighter.name, index);
    return [option];
  });
  rival.replaceChildren(...options);
  if (enemy === id) enemy = Number(options[0].value);
  rival.value = enemy;
  cards.forEach((card, index) => card.setAttribute("aria-pressed", index === id));
}

function updateSound() {
  $("sound").setAttribute("aria-pressed", sound);
  $("sound").querySelector("span").textContent = sound ? "Sound on" : "Sound off";
}
function unlockAudio() {
  if (!sound) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  audio ??= new Audio();
  if (audio.state === "suspended") audio.resume().catch(() => {});
}
function tone(start, end, volume, seconds, type, delay = 0) {
  if (!sound || !audio || audio.state !== "running") return;
  const time = audio.currentTime + delay;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(start, time);
  oscillator.frequency.exponentialRampToValueAtTime(end, time + seconds);
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(.001, time + seconds);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(time);
  oscillator.stop(time + seconds);
}
function fx(kind) {
  if (kind === "block") tone(570, 210, .14, .15, "triangle");
  if (kind === "quick") tone(120, 52, .25, .14, "square");
  if (kind === "heavy") tone(160, 40, .30, .22, "triangle");
  if (kind === "special") {
    tone(520, 75, .20, .26, "sawtooth");
    tone(133, 40, .21, .30, "triangle");
  }
  if (kind === "start") {
    tone(330, 420, .11, .15, "triangle");
    tone(495, 670, .12, .24, "triangle", .12);
  }
  if (kind === "end") {
    tone(216, 90, .16, .32, "sawtooth");
    tone(110, 53, .14, .5, "triangle", .18);
  }
}

function resetFighter(id, side, wins = 0) {
  return {
    id, wins, health: 100, x: side * 1.70, z: side * -.17, angle: -side * Math.PI * .47,
    attack: null, cooldown: 0, stun: 0, guard: false, moving: false, fall: 0, ko: false,
    nextTwin: -1,
  };
}
function setBanner(message) {
  if (banner === message) return;
  banner = message;
  $("banner").textContent = message;
}
function setHUD() {
  const special = roster[fighters[0].id].special.name;
  specialButton.title = special;
  specialButton.setAttribute("aria-label", "Special attack: " + special);
  fighters.forEach((fighter, index) => {
    const n = index + 1, data = roster[fighter.id];
    $("p" + n + "name").textContent = data.name.toUpperCase();
    const hp = $("p" + n + "hp");
    hp.parentElement.parentElement.style.setProperty("--hp", data.color);
    hp.parentElement.setAttribute("role", "meter");
    hp.parentElement.setAttribute("aria-label", data.name + " health");
    hp.parentElement.setAttribute("aria-valuemin", 0);
    hp.parentElement.setAttribute("aria-valuemax", 100);
  });
}
function drawHUD() {
  for (let i = 0; i < fighters.length; i++) {
    const fighter = fighters[i], n = i + 1;
    const hp = $("p" + n + "hp");
    const health = Math.ceil(fighter.health);
    if (hp.parentElement.getAttribute("aria-valuenow") !== String(health)) {
      hp.style.width = health + "%";
      hp.parentElement.setAttribute("aria-valuenow", health);
    }
    const wins = $("p" + n + "wins");
    if (wins.dataset.wins !== String(fighter.wins)) {
      wins.dataset.wins = fighter.wins;
      wins.setAttribute("aria-label", fighter.wins + " rounds won");
      wins.replaceChildren(...[0, 1].map(index => {
        const dot = document.createElement("i");
        dot.classList.toggle("won", index < fighter.wins);
        return dot;
      }));
    }
  }
  const time = String(Math.ceil(clock)).padStart(2, "0");
  if ($("timer").textContent !== time) $("timer").textContent = time;
  const cooldown = fighters[0].cooldown;
  specialButton.classList.toggle("cooldown", cooldown > 0);
  if (cooldown > 0) specialButton.style.setProperty("--charge", (1 - cooldown / specialCooldown) * 100 + "%");
}

function newRound() {
  fighters = [resetFighter(selected, -1, fighters[0]?.wins), resetFighter(enemy, 1, fighters[1]?.wins)];
  brain = { time: 0, intent: "approach", step: 1 };
  sparks = [];
  queued = null;
  clock = 45;
  phase = "ready";
  phaseTime = 1.35;
  $("round").textContent = "ROUND " + round;
  setHUD();
  drawHUD();
  setBanner("ROUND " + round);
}
function startMatch() {
  clearInput();
  unlockAudio();
  cancelAnimationFrame(animation);
  menu.hidden = true;
  match.hidden = false;
  $("result").hidden = true;
  $("exit").focus();
  pause = false;
  $("pause").disabled = false;
  $("pause").textContent = "Pause";
  round = 1;
  fighters = [];
  stage.cameraX = 0;
  lastFrame = 0;
  newRound();
  animation = requestAnimationFrame(frame);
}
function exitMatch() {
  clearInput();
  phase = "menu";
  pause = false;
  cancelAnimationFrame(animation);
  match.hidden = true;
  menu.hidden = false;
  cards[selected].focus();
}
function finishRound(winner, reason) {
  if (winner) winner.wins++;
  phase = "between";
  phaseTime = 2.15;
  setBanner(reason);
  fx("end");
}
function showResult() {
  phase = "result";
  setBanner("");
  $("pause").disabled = true;
  const [player, cpu] = fighters;
  $("result-title").textContent = player.wins > cpu.wins ? "YOU WIN" : "CPU WINS";
  $("result-detail").textContent = roster[player.id].name.toUpperCase() + " " + player.wins + " – " + cpu.wins + " " + roster[cpu.id].name.toUpperCase();
  $("result").hidden = false;
  $("rematch").focus();
}
function togglePause() {
  if (!["ready", "fight", "between"].includes(phase)) return;
  pause = !pause;
  $("pause").textContent = pause ? "Resume" : "Pause";
  clearInput();
  if (pause) setBanner("PAUSED");
  else if (phase === "ready") setBanner("ROUND " + round);
  else if (phase === "between") setBanner(roundResult);
  else setBanner("");
}

function distance(a, b) {
  const x = b.x - a.x, z = b.z - a.z;
  const length = Math.hypot(x, z);
  return { x: length ? x / length : 1, z: length ? z / length : 0, length };
}
function move(fighter, x, z, dt) {
  const length = Math.hypot(x, z);
  if (length < .01 || fighter.attack || fighter.stun > 0 || fighter.guard) {
    fighter.moving = false;
    return;
  }
  const speed = roster[fighter.id].speed * dt / Math.max(1, length);
  fighter.x += x * speed;
  fighter.z += z * speed;
  fighter.moving = true;
}
function beginAttack(fighter, kind, target, step = 0) {
  if (!kind || fighter.attack || fighter.stun > 0 || fighter.guard) return false;
  if (kind === "special" && fighter.cooldown > 0) return false;
  const profile = roster[fighter.id];
  const data = { ...standard[kind], ...profile[kind] };
  const attack = { ...data, kind, elapsed: 0, resolved: false, angle: fighter.angle };
  fighter.attack = attack;
  if (kind === "quick" && profile.quick) {
    attack.twin = fighter.nextTwin;
    fighter.nextTwin *= -1;
  }
  if (attack.sidestep) {
    const rightX = Math.cos(attack.angle), rightZ = -Math.sin(attack.angle);
    const towardCenter = -(fighter.x * rightX / 5.5 + fighter.z * rightZ / 3.5);
    const side = Math.sign(step * rightZ || towardCenter) || 1;
    attack.stepX = rightX * side * attack.sidestep;
    attack.stepZ = rightZ * side * attack.sidestep;
    attack.aimX = target.x;
    attack.aimZ = target.z;
    attack.twin = side;
  }
  if (kind === "special") {
    fighter.cooldown = specialCooldown;
    tone(240, 580, .075, data.windup, "triangle");
  }
  return true;
}
function updatePad() {
  pad.forEach(button => button.classList.toggle("active", held(button.dataset.key)));
}
function held(code) {
  return pressed.has(code) || [...pointerKeys.values()].includes(code);
}
function playerTick(fighter, opponent, dt) {
  fighter.guard = held("Space") && !fighter.attack && fighter.stun <= 0;
  const x = Number(held("ArrowRight") || held("KeyD")) - Number(held("ArrowLeft") || held("KeyA"));
  const z = Number(held("ArrowDown") || held("KeyS")) - Number(held("ArrowUp") || held("KeyW"));
  move(fighter, x, z, dt);
  if (queued && worldTime > queued.expires) queued = null;
  if (queued && beginAttack(fighter, queued.kind, opponent, z)) queued = null;
}
function cpuTick(cpu, player, dt) {
  const direction = distance(cpu, player);
  const edge = Math.abs(cpu.x) > 4.0 || Math.abs(cpu.z) > 2.45;
  brain.time -= dt;
  if (brain.time <= 0) {
    const roll = Math.random();
    brain.step = Math.random() < .5 ? -1 : 1;
    if (edge && direction.length > 1.9) brain.intent = "center";
    else if (direction.length > 2.35) {
      brain.intent = direction.length < 2.85 && cpu.id === 2 && roll < .34 ? "special" : "approach";
    } else if (cpu.id === 3 && player.attack && !player.attack.resolved && cpu.cooldown <= 0 && roll < .64) {
      brain.intent = "special";
    } else if (player.attack && roll < .42) brain.intent = "guard";
    else if (direction.length > 1.55 && roll < .43) brain.intent = "approach";
    else if (roll < .16) brain.intent = "step";
    else if (roll < .29) brain.intent = "guard";
    else if (roll < .49 && cpu.cooldown <= 0) brain.intent = "special";
    else brain.intent = roll < .69 ? "heavy" : "quick";
    brain.time = .18 + Math.random() * .24;
  }
  cpu.guard = brain.intent === "guard" && !cpu.attack && cpu.stun <= 0;
  if (brain.intent === "approach") move(cpu, direction.x, direction.z, dt);
  else if (brain.intent === "step") move(cpu, direction.z * brain.step, -direction.x * brain.step, dt);
  else if (brain.intent === "center") move(cpu, -cpu.x, -cpu.z, dt);
  else {
    cpu.moving = false;
    if (["quick", "heavy", "special"].includes(brain.intent) && beginAttack(cpu, brain.intent, player)) {
      brain.intent = "wait";
      brain.time = cpu.attack.duration + .08 + Math.random() * .25;
    }
  }
}
function attackTick(attacker, target, dt) {
  const attack = attacker.attack;
  if (!attack) return null;
  const before = attack.elapsed;
  attack.elapsed += dt;
  const advance = Math.min(attack.elapsed, attack.windup) - Math.min(before, attack.windup);
  attacker.x += Math.sin(attack.angle) * attack.lunge * advance / attack.windup;
  attacker.z += Math.cos(attack.angle) * attack.lunge * advance / attack.windup;
  if (attack.sidestep && !attack.resolved) {
    // Sell the feint first, then move most of the way before the counter lands.
    const slide = time => Math.max(0, Math.min(1, (time / attack.windup - .22) / .78));
    const fraction = slide(attack.elapsed) - slide(before);
    attacker.x += attack.stepX * fraction;
    attacker.z += attack.stepZ * fraction;
  }
  if (attack.resolved || attack.elapsed < attack.windup) {
    if (attack.elapsed >= attack.duration) attacker.attack = null;
    return null;
  }
  attack.resolved = true;
  if (attack.sidestep) {
    attack.angle = Math.atan2(attack.aimX - attacker.x, attack.aimZ - attacker.z);
    attacker.angle = attack.angle;
  }
  const direction = distance(attacker, target);
  const alignment = direction.x * Math.sin(attack.angle) + direction.z * Math.cos(attack.angle);
  const reach = attack.reach + (attacker.id === 1 && attack.kind !== "special" ? .14 : 0);
  if (direction.length > reach || alignment < .79) {
    tone(98, 52, .045, .11, "triangle");
    return null;
  }
  return { attack, attacker, target, direction, blocked: target.guard };
}
function land({ attack, attacker, target, direction, blocked }) {
  const { weight } = roster[target.id];
  const power = attack.kind === "special" ? 1 : roster[attacker.id].power;
  const damage = Math.round(attack.damage * power * (blocked ? .18 : 1));
  target.health = Math.max(0, target.health - damage);
  target.stun = blocked ? .085 : attack.kind === "quick" ? .18 : .30;
  if (!blocked) target.attack = null;
  const push = attack.shove / weight * (blocked ? .29 : 1);
  target.x += direction.x * push;
  target.z += direction.z * push;
  for (let i = 0; i < (blocked ? 9 : 19); i++) {
    sparks.push({
      x: target.x - direction.x * .47, y: target.id === 1 ? .98 : 1.33, z: target.z - direction.z * .47,
      vx: (Math.random() - .5) * 5, vy: Math.random() * 4.5, vz: (Math.random() - .5) * 5,
      life: .15 + Math.random() * .23,
      color: blocked ? "#a5dcff" : attack.kind === "special" ? roster[attacker.id].color : "#ffc580",
    });
  }
  fx(blocked ? "block" : attack.kind);
}
function spaceFighters(a, b) {
  const d = distance(a, b);
  const overlap = (.92 - d.length) * .5;
  if (overlap <= 0) return;
  a.x -= d.x * overlap;
  a.z -= d.z * overlap;
  b.x += d.x * overlap;
  b.z += d.z * overlap;
}

let roundResult = "";
function simulate(dt) {
  phaseTime -= dt;
  for (const fighter of fighters) {
    if (fighter.fall > 0) fighter.fall += dt;
  }
  for (const particle of sparks) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
    particle.vy -= dt * 13;
  }
  sparks = sparks.filter(spark => spark.life > 0);
  if (phase === "ready" && phaseTime <= 0) {
    phase = "fight";
    phaseTime = .63;
    fx("start");
    setBanner("FIGHT!");
  } else if (phase === "between" && phaseTime <= 0) {
    if (fighters.some(fighter => fighter.wins === 2)) showResult();
    else {
      if (roundResult !== "DRAW") round++;
      newRound();
    }
  }
  if (phase !== "fight") return;
  if (phaseTime <= 0) setBanner("");
  clock = Math.max(0, clock - dt);
  const [player, cpu] = fighters;
  for (const [fighter, other] of [[player,cpu], [cpu,player]]) {
    fighter.cooldown = Math.max(0, fighter.cooldown - dt);
    fighter.stun = Math.max(0, fighter.stun - dt);
    if (!fighter.attack) fighter.angle = Math.atan2(other.x - fighter.x, other.z - fighter.z);
  }
  playerTick(player, cpu, dt);
  cpuTick(cpu, player, dt);
  const hits = [attackTick(player, cpu, dt), attackTick(cpu, player, dt)];
  for (const hit of hits) if (hit) land(hit);
  spaceFighters(player, cpu);

  const outs = fighters.map(fighter => Math.abs(fighter.x) > 5.55 || Math.abs(fighter.z) > 3.55);
  const kos = fighters.map(fighter => fighter.health <= 0);
  for (let i = 0; i < fighters.length; i++) {
    if (outs[i]) fighters[i].fall = .01;
    else if (kos[i]) fighters[i].ko = true;
  }
  if (outs.some(Boolean) || kos.some(Boolean) || clock === 0) {
    const scores = fighters.map((fighter, index) => outs[index] || kos[index] ? 0 : fighter.health);
    const winner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? player : cpu;
    roundResult = !winner ? "DRAW" : outs.some(Boolean) ? "RING OUT!" : kos.some(Boolean) ? "K.O.!" : "TIME!";
    finishRound(winner, roundResult);
  }
}

function frame(now) {
  if (phase === "menu") return;
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .033) : 0;
  lastFrame = now;
  if (!pause && phase !== "result") {
    worldTime += dt;
    simulate(dt);
    drawHUD();
  }
  stage.draw(fighters, sparks, worldTime);
  if (phase !== "result") animation = requestAnimationFrame(frame);
}
function queueAttack(code) {
  if (buttons[code] && phase === "fight" && !pause) queued = { kind: buttons[code], expires: worldTime + .16 };
}
function clearInput() {
  pressed.clear();
  pointerKeys.clear();
  queued = null;
  updatePad();
}

window.addEventListener("keydown", event => {
  if (phase === "menu" || controls.open || event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.code === "Escape" && !event.repeat) togglePause();
  const { code } = event;
  if (phase === "result" || !["Space", ...Object.keys(movement), ...Object.keys(buttons)].includes(code)) return;
  if (code === "Space" && event.target.closest("button") && event.target !== $("exit") && event.target.dataset.key === undefined) return;
  event.preventDefault();
  if (!event.repeat) queueAttack(code);
  pressed.add(code);
  updatePad();
});
window.addEventListener("keyup", event => {
  pressed.delete(event.code);
  updatePad();
});
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !pause) togglePause();
});
for (const button of pad) {
  const code = button.dataset.key;
  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointerKeys.set(event.pointerId, code);
    queueAttack(code);
    updatePad();
  });
  const release = event => {
    pointerKeys.delete(event.pointerId);
    updatePad();
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
for (const card of cards) card.addEventListener("click", () => selectFighter(Number(card.dataset.fighter)));
rival.addEventListener("change", () => { enemy = Number(rival.value); });
$("start").addEventListener("click", startMatch);
$("rematch").addEventListener("click", startMatch);
$("pause").addEventListener("click", togglePause);
$("exit").addEventListener("click", exitMatch);
$("back").addEventListener("click", exitMatch);
$("sound").addEventListener("click", () => {
  sound = !sound;
  stored.set("virtuai-sound", sound ? "on" : "off");
  unlockAudio();
  updateSound();
});
let pausedForHelp = false;
$("help").addEventListener("click", () => {
  pausedForHelp = !pause && ["ready", "fight", "between"].includes(phase);
  if (pausedForHelp) togglePause();
  controls.showModal();
});
$("close-help").addEventListener("click", () => controls.close());
controls.addEventListener("close", () => {
  if (pausedForHelp && pause) togglePause();
  pausedForHelp = false;
});
updateSound();
selectFighter(0);
