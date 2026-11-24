"use strict";

class Arena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.copilotLogo = new Image();
    this.copilotLogo.src = "assets/copilot-logo.svg";
    this.cameraX = 0;
    this.cameraZ = 11.9;
    this.faces = [];
    this.shades = new Map();
    this.pitch = .27;
    this.cosPitch = Math.cos(this.pitch);
    this.sinPitch = Math.sin(this.pitch);
  }

  project([x, y, z]) {
    const distance = this.cameraZ - z;
    const height = y - 4.35;
    const depth = distance * this.cosPitch - height * this.sinPitch;
    if (depth <= .1) return null;
    const scale = this.focal / depth;
    return [this.width / 2 + (x - this.cameraX) * scale,
      this.height * .49 - (height * this.cosPitch + distance * this.sinPitch) * scale, depth];
  }

  polygon(points, color, stroke = "") {
    const projected = points.map(point => this.project(point));
    if (projected.some(point => !point)) return;
    const depth = projected.reduce((sum, point) => sum + point[2], 0) / points.length;
    this.faces.push({ projected, depth, color, stroke });
  }

  decal(image, topLeft, topRight, bottomLeft) {
    if (!image.naturalWidth) return;
    const origin = this.project(topLeft);
    const right = this.project(topRight);
    const bottom = this.project(bottomLeft);
    if (!origin || !right || !bottom) return;
    const across = [right[0] - origin[0], right[1] - origin[1]];
    const down = [bottom[0] - origin[0], bottom[1] - origin[1]];
    if (across[0] * down[1] - across[1] * down[0] <= 0) return;
    const depth = (right[2] + bottom[2]) / 2;
    this.faces.push({ depth, image, transform: [...across, ...down, origin[0], origin[1]] });
  }

  flush() {
    const ctx = this.ctx;
    this.faces.sort((a, b) => b.depth - a.depth);
    for (const { projected, color, stroke, image, transform } of this.faces) {
      if (image) {
        ctx.save();
        ctx.transform(...transform);
        ctx.drawImage(image, 0, 0, 1, 1);
        ctx.restore();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(projected[0][0], projected[0][1]);
      for (const point of projected.slice(1)) ctx.lineTo(point[0], point[1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = stroke || color;
      ctx.lineWidth = stroke ? 1 : .65;
      ctx.stroke();
    }
    this.faces.length = 0;
  }

  shade(color, value) {
    const key = color + value;
    if (!this.shades.has(key)) {
      const number = parseInt(color.slice(1), 16);
      const channels = [number >> 16, (number >> 8) & 255, number & 255];
      this.shades.set(key, "rgb(" + channels.map(v => Math.min(255, Math.round(v * value))).join(",") + ")");
    }
    return this.shades.get(key);
  }

  mesh(vertices, faces, color, emissive = false) {
    for (const indices of faces) {
      const points = indices.map(index => vertices[index]);
      const [a, b, c] = points;
      const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const eye = [this.cameraX - a[0], 4.35 - a[1], this.cameraZ - a[2]];
      if (normal.reduce((sum, n, i) => sum + n * eye[i], 0) <= 0) continue;
      const light = (-normal[0] * .47 + normal[1] * .84 + normal[2] * .27) / Math.hypot(...normal);
      this.polygon(points, emissive ? color : this.shade(color, Math.round((.71 + light * .35) * 20) / 20));
    }
  }

  prism(transform, rings, color, emissive = false) {
    const vertices = rings.flatMap(([y, x, z, width, depth, bevel]) => [
      [-width + bevel, y, -depth], [-width, y, -depth + bevel],
      [-width, y, depth - bevel], [-width + bevel, y, depth],
      [width - bevel, y, depth], [width, y, depth - bevel],
      [width, y, -depth + bevel], [width - bevel, y, -depth],
    ].map(([vx, vy, vz]) => transform([vx + x, vy, vz + z])));
    const end = (rings.length - 1) * 8;
    const faces = [[7,6,5,4,3,2,1,0], [0,1,2,3,4,5,6,7].map(i => i + end)];
    for (let j = 0; j < end; j += 8) {
      for (let i = 0; i < 8; i++) {
        const a = j + i, b = j + (i + 1) % 8;
        faces.push([a, b, b + 8, a + 8]);
      }
    }
    this.mesh(vertices, faces, color, emissive);
  }

  box(transform, x, y, z, width, height, depth, color, bevel = .065, emissive = false) {
    const w = width / 2, h = height / 2, d = depth / 2;
    const cut = Math.min(bevel, w * .45, d * .45, h * .45);
    this.prism(transform, [
      [y - h, x, z, w - cut, d - cut, cut * .48],
      [y - h + cut, x, z, w, d, cut],
      [y + h - cut, x, z, w, d, cut],
      [y + h, x, z, w - cut, d - cut, cut * .48],
    ], color, emissive);
  }

  beam(transform, a, b, width, depth, color) {
    const delta = b.map((v, i) => v - a[i]);
    const length = Math.hypot(...delta);
    if (length < .001) return;
    const up = delta.map(v => v / length);
    const sideLength = Math.hypot(up[1], up[2]);
    const side = sideLength > .01 ? [0, up[2] / sideLength, -up[1] / sideLength] : [0, 0, 1];
    const forward = [side[1] * up[2] - side[2] * up[1], side[2] * up[0] - side[0] * up[2], side[0] * up[1] - side[1] * up[0]];
    const local = ([x, y, z]) => transform(a.map((v, i) => v + side[i] * x + up[i] * y + forward[i] * z));
    this.box(local, 0, length / 2, 0, width, length + .035, depth, color, width * .25);
  }

  ellipse(transform, x, y, z, width, height, depth, color) {
    const rings = [-75, -45, 0, 45, 75].map(degrees => {
      const angle = degrees * Math.PI / 180;
      const size = Math.cos(angle);
      return [y + Math.sin(angle) * height / 2, x, z, width * size / 2, depth * size / 2,
        Math.min(width, depth) * size * .13];
    });
    this.prism(transform, rings, color);
  }

  line(a, b, color, width = 1) {
    const p = this.project(a), q = this.project(b);
    if (!p || !q) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  scenery(time) {
    const ctx = this.ctx, width = this.width, height = this.height;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#121621");
    sky.addColorStop(.34, "#312b32");
    sky.addColorStop(.62, "#805041");
    sky.addColorStop(1, "#171b25");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .73, height * .37, 5, width * .73, height * .37, width * .4);
    glow.addColorStop(0, "#ea82524d");
    glow.addColorStop(1, "#ea825200");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    for (let layer = 0; layer < 2; layer++) {
      for (let i = -3; i < 22; i++) {
        const x = (i - this.cameraX * (.08 + layer * .07)) * width / 18;
        const w = width * (.026 + ((i + 3) * 17 % 7) / 204);
        const h = height * (.045 + ((i + 3) * (19 + layer * 4) % 13) / 75);
        const y = height * (.49 + layer * .045) - h;
        ctx.fillStyle = layer ? "#212430" : "#3c333a";
        ctx.fillRect(x, y, w, h);
        ctx.fillRect(x + w * .2, y - height * .012, w * .6, height * .012);
        ctx.fillStyle = layer ? "#e786575f" : "#f1a67438";
        for (let j = 1; j < 5; j++) {
          if ((i + j * 3) % 5 !== 0) ctx.fillRect(x + w * .19, y + h * j / 6, w * .56, 1.5);
        }
      }
    }
    for (const x of [-9.1, -6.7, 6.7, 9.1]) {
      const world = ([a,b,c]) => [a + x,b,c - 6.5];
      this.box(world, 0, 1.9, 0, .42, 5.5, .4, "#333641");
      this.box(world, 0, 3.82, .21, .22, .19, .055, "#fa9e5a", .025, true);
      this.beam(world, [0,.15,0], [x > 0 ? .95 : -.95, 2.7, 0], .17, .17, "#3c3d47");
    }
    const identity = point => point;
    this.box(identity, 0, 3.85, -6.5, 19, .17, .22, "#3d3b43");
    this.box(identity, 0, .95, -5.1, 16, .11, .15, "#353b48");
    this.box(identity, 0, .4, -5.1, 16, .1, .13, "#3b404b");
    for (let x = -7; x <= 7; x++) this.box(identity, x, .45, -5.1, .07, 1.05, .09, "#53555e", .02);
    this.flush();

    const min = -5.5, max = 5.5, back = -3.5, front = 3.5;
    this.box(identity, 0, -.29, 0, 11, .49, 7, "#323640", .1);
    for (let x = -5; x <= 5; x++) {
      for (let z = -3; z <= 3; z++) {
        const shade = (x + z) % 2 ? "#484a52" : "#4f5159";
        this.polygon([[x-.5,0,z-.5],[x+.5,0,z-.5],[x+.5,0,z+.5],[x-.5,0,z+.5]], shade, "#3b414a");
      }
    }
    this.flush();

    for (const z of [back + .09, front - .09]) {
      this.line([min + .1,.01,z], [max - .1,.01,z], "#e8a454", 2);
      for (let x = -5.3; x < 5.2; x += .37) {
        const inner = z < 0 ? z + .13 : z - .13;
        this.line([x,.012,z], [x + .15,.012,inner], "#a77855", 2);
      }
    }
    for (const x of [min + .1,max - .1]) this.line([x,.01,back + .09], [x,.01,front - .09], "#e8a454", 2);
    for (const radius of [.87, 1.12]) {
      let last = [radius, .012, 0];
      for (let i = 1; i <= 28; i++) {
        const angle = i * Math.PI * 2 / 28;
        const next = [Math.cos(angle) * radius, .012, Math.sin(angle) * radius];
        this.line(last, next, "#a0a597", 1);
        last = next;
      }
    }
    this.line([-.22,.015,0], [.22,.015,0], "#a0a597", 1);
    this.line([0,.015,-.22], [0,.015,.22], "#a0a597", 1);

    for (let i = 0; i < 30; i++) {
      const x = ((i * .1187 + time * .007) % 1) * width;
      const y = (.66 - (i * .376 + time * (.022 + i % 3 * .009)) % .57) * height;
      ctx.fillStyle = i % 2 ? "#f8b87855" : "#f8b87826";
      ctx.fillRect(x, y, i % 3 + 1, 1);
    }
  }

  shadow(fighter) {
    if (fighter.fall > 0) return;
    const p = this.project([fighter.x, .015, fighter.z]);
    if (!p) return;
    const ctx = this.ctx;
    const r = this.focal / p[2] * (fighter.id === 1 ? .9 : .64);
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.scale(1, .30);
    const glow = ctx.createRadialGradient(0, 0, r * .13, 0, 0, r * 1.32);
    glow.addColorStop(0, "#080c13ce");
    glow.addColorStop(1, "#080c1300");
    ctx.fillStyle = glow;
    ctx.fillRect(-r * 1.32,-r * 1.32,r * 2.64,r * 2.64);
    ctx.restore();
  }

  fighter(fighter, time) {
    const angle = fighter.angle;
    const c = Math.cos(angle), s = Math.sin(angle);
    const rock = fighter.ko ? 1.18 : fighter.stun > 0 ? -.17 : 0;
    const cr = Math.cos(rock), sr = Math.sin(rock);
    const fall = fighter.fall > 0 ? fighter.fall ** 2 * 7 : 0;
    const transform = ([x, y, z]) => {
      const py = y * cr - z * sr;
      const pz = y * sr + z * cr;
      return [fighter.x + x * c + pz * s, py - fall, fighter.z + pz * c - x * s];
    };
    const attack = fighter.attack;
    const extent = attack ? attack.elapsed <= attack.windup
      ? -.23 * attack.elapsed / attack.windup
      : Math.max(0, 1 - (attack.elapsed - attack.windup - .06) / (attack.duration - attack.windup - .06)) : 0;
    const pose = {
      bob: fighter.ko ? 0 : Math.sin(time * 6 + fighter.id) * .045,
      gait: fighter.moving ? Math.sin(time * 19) : 0,
      extent, guard: fighter.guard, special: attack?.kind === "special",
      heavy: attack?.kind === "heavy", flash: fighter.stun > .12,
    };
    if (fighter.id === 0) this.robot(transform, pose);
    if (fighter.id === 1) this.crab(transform, pose);
    if (fighter.id === 2) this.paperclip(transform, pose);
    if (fighter.id === 3) this.gemini(transform, pose, attack, time);
  }

  robot(t, { bob, gait, extent, guard, heavy, special, flash }) {
    const shell = flash ? "#ffffff" : "#e0e6df", joint = "#333d42", mint = "#7bffd0";
    for (const sign of [-1, 1]) {
      const stride = gait * sign * .16;
      const hip = [sign * .23,.89 + bob,.0];
      const knee = [sign * .31,.47, .13 + stride * .4];
      const foot = [sign * .35,.14, sign * .13 + stride];
      this.beam(t, hip, knee, .33,.33, shell);
      this.ellipse(t, ...knee, .29,.29,.30, joint);
      this.beam(t, knee, foot, .36,.34, shell);
      this.box(t, foot[0], .11, foot[2] + .10, .43,.23,.53, joint);
      this.box(t, foot[0], .18, foot[2] + .12, .42,.19,.48, shell);
    }
    this.box(t,0,.9+bob,0,.61,.34,.51,joint);
    this.box(t,0,1.25+bob,0,.82,.53,.59,shell,.12);
    this.box(t,0,1.28+bob,.309,.31,.20,.058,joint,.04);
    this.box(t,0,1.28+bob,.344,.19,.10,.022,mint,.015,true);
    this.box(t,0,1.6+bob,0,.42,.18,.40,joint);
    this.box(t,0,1.94+bob,.035,.88,.65,.73,shell,.16);
    this.box(t,0,1.92+bob,.40,.74,.41,.07,joint,.067);
    this.box(t,0,1.92+bob,.438,.64,.33,.029,"#121d21",.042);
    for (const sign of [-1,1]) {
      this.box(t,sign*.16,1.93+bob,.46,.098,.112,.02,mint,.012,true);
      this.box(t,sign*.45,1.96+bob,.01,.08,.31,.34,joint,.065);
      this.box(t,sign*.496,1.96+bob,.01,.032,.17,.18,mint,.02,true);
      const active = (heavy ? sign === 1 : sign === -1) || special;
      const reach = active ? extent : 0;
      const shoulder = [sign*.44,1.38+bob,0];
      const elbow = [sign*(.61 - reach*.08),1.04+bob,.21+reach*.26];
      const hand = [sign*(guard ? .26 : .47), (guard ? 1.78 : 1.28) + bob + reach*.12,.49+reach*(special ? 1.02 : .75)];
      this.beam(t,shoulder,elbow,.28,.27,joint);
      this.ellipse(t,...shoulder,.40,.39,.41,shell);
      this.beam(t,elbow,hand,.34,.33,shell);
      this.box(t,...hand,.43,.39,.40,shell,.08);
      this.box(t,hand[0],hand[1],hand[2]+.205,.32,.28,.052,joint,.035);
      for (const offset of [-.092,0,.092]) this.box(t,hand[0]+offset,hand[1]+.02,hand[2]+.236,.063,.18,.024,special ? mint : "#697578",.01,special);
    }
  }

  crab(t, { bob, gait, extent, guard, heavy, special, flash }) {
    const body = flash ? "#ff9675" : "#b8523c", claw = "#ed8038", joint = "#453333", yellow = "#ffe178";
    const y = .87 + bob;
    for (const sign of [-1,1]) {
      for (const i of [-1,0,1]) {
        const lift = Math.max(0,gait * sign * (i ? 1 : -1))*.17;
        const knee = [sign*(.96-Math.abs(i)*.05),.55+lift,i*.41];
        const toe = [sign*(1.15-Math.abs(i)*.08),.065+lift,i*.51+gait*.05];
        this.beam(t,[sign*.52,.58,i*.34],knee,.235,.23,body);
        this.ellipse(t,...knee,.27,.27,.28,joint);
        this.beam(t,knee,toe,.195,.19,body);
      }
    }
    this.box(t,0,y-.25,0,1.07,.25,.77,joint);
    this.box(t,0,y,0,1.22,.60,.96,body,.14);
    this.box(t,0,y,.48,.80,.35,.09,"#9d493a",.05);
    for (const x of [-.18,0,.18]) this.box(t,x,y,.535,.066,.20,.026,joint,.012);
    for (const sign of [-1,1]) {
      this.beam(t,[sign*.23,y+.23,.14],[sign*.27,y+.61,.23],.105,.11,joint);
      this.box(t,sign*.27,y+.60,.24,.24,.27,.22,body,.05);
      this.box(t,sign*.27,y+.60,.36,.14,.17,.04,yellow,.025,true);
      const reach = (heavy ? sign === 1 : sign === -1) || special ? extent : 0;
      const elbow = [sign*.82,y+.10,.14+reach*.38];
      const hand = [sign*(guard ? .40 : .79-reach*.16),y+(guard ? .49 : .29)+sign*.10+reach*.20,.51+reach*.94];
      this.beam(t,[sign*.56,y,0],elbow,.28,.28,joint);
      this.beam(t,elbow,hand,.34,.30,body);
      this.box(t,...hand,.40,.37,.36,claw,.085);
      const [hx,hy,hz] = hand;
      for (const split of [-1,1]) {
        const base = [hx+split*.15,hy+.025,hz+.08];
        const bend = [hx+split*(.21-Math.max(0,reach)*.05),hy+.12,hz+.30];
        const tip = [hx+split*(.11-Math.max(0,reach)*.065),hy+.16,hz+.48];
        this.beam(t,base,bend,.20,.20,claw);
        this.beam(t,bend,tip,.13,.15,claw);
      }
    }
  }

  paperclip(t, { bob, gait, extent, guard, heavy, special, flash }) {
    const steel = flash ? "#ffffff" : "#c2d7e0", blue = "#4bcee9", dark = "#242f3e";
    const bounce = bob * 2 + Math.abs(gait) * .05;
    const lower = .30 + bounce, upper = 2.00 + bounce - (special ? extent*.16 : 0);
    const wire = [[.19,lower+.34,.03],[.19,upper-.26,.03]];
    const arc = (cx, cy, radius, start, end) => {
      for (let i = 0; i <= 7; i++) {
        const a = start + (end - start) * i / 7;
        wire.push([cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,.03]);
      }
    };
    arc(-.075,upper-.26,.265,0,Math.PI);
    arc(-.02,lower+.20,.32,Math.PI,Math.PI*2);
    arc(.06,upper-.18,.22,0,Math.PI);
    wire.push([-.16,lower+.41,.03]);
    arc(.02,lower+.41,.18,Math.PI,Math.PI*2);
    wire.push([.20,upper-.61,.03]);
    for (let i = 1; i < wire.length; i++) {
      if (Math.hypot(...wire[i].map((v,j) => v - wire[i-1][j])) > .018) {
        this.beam(t,wire[i-1],wire[i],.101,.113,steel);
      }
    }
    for (const sign of [-1,1]) {
      const x = sign*.134-.025, y = upper-.52 + sign*.023;
      this.ellipse(t,x,y,.12,.205,.29,.20,"#ecf8fa");
      this.ellipse(t,x+sign*.016,y-.012,.215,.081,.123,.045,dark);
      this.ellipse(t,x+sign*.007,y+.02,.24,.030,.037,.022,"#ffffff");
      this.beam(t,[x-sign*.084,y+.105,.156],[x+sign*.10,y+.168,.145],.06,.052,dark);
      const reach = (heavy ? sign === 1 : sign === -1) || special ? extent : 0;
      const shoulder = [sign*.23,1+bounce,.01];
      const elbow = [sign*.50,.92+bounce,.20+reach*.34];
      const hand = [sign*(guard ? .22 : .45-reach*.11),(guard ? 1.51 : 1.20)+bounce+reach*.16,.38+reach*(special ? 1.23 : .8)];
      this.beam(t,shoulder,elbow,.11,.12,steel);
      this.beam(t,elbow,hand,.13,.13,steel);
      this.box(t,...hand,.40,.36,.42,blue,.08);
      this.box(t,hand[0],hand[1]-.04,hand[2]+.21,.32,.23,.045,dark,.045);
      this.box(t,hand[0],hand[1]+.02,hand[2]+.237,.20,.04,.025,"#a5f5ff",.015,true);
      const [hx, hy, hz] = hand;
      this.box(t, hx + sign * .197, hy, hz, .037, .26, .30, dark, .017);
      const badgeX = hx + sign * .217;
      this.decal(this.copilotLogo,
        t([badgeX, hy + .105, hz + sign * .112]),
        t([badgeX, hy + .105, hz - sign * .112]),
        t([badgeX, hy - .105, hz + sign * .112]));
    }
  }

  gemini(t, { bob, extent, guard, heavy, special, flash }, attack, time) {
    const orbit = Math.sin(time * 3.5);
    const coreY = 1.34 + bob * 2;
    const track = (angle, radius) => {
      const x = Math.cos(angle) * radius;
      return t([x, coreY + Math.sin(angle) * radius, x * .61 - .07]);
    };
    for (let i = 0; i < 16; i++) {
      if (i % 4 === 3) continue;
      const start = i * Math.PI / 8, end = start + Math.PI / 8;
      this.polygon([track(start,.56),track(end,.56),track(end,.517),track(start,.517)],
        i < 4 || i >= 12 ? "#9473d4" : "#4b90dd");
    }
    const rim = [[0,.42],[.10,.11],[.33,0],[.10,-.11],[0,-.42],[-.10,-.11],[-.33,0],[-.10,.11]];
    const corners = rim.map(([x,y]) => t([x,coreY+y,0]));
    const front = t([0,coreY,.17]);
    const back = t([0,coreY,-.17]);
    const facets = ["#edf9ff", "#a8e4ff", "#b19bff", "#7565f1"];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i], b = corners[(i + 1) % corners.length];
      this.mesh([front, a, b], [[0,2,1]], facets[i % 4], true);
      this.mesh([back, a, b], [[0,1,2]], facets[(i + 2) % 4], true);
    }

    const feint = special && !attack.resolved ? Math.sin(Math.PI * attack.elapsed / attack.windup) : 0;
    for (const sign of [-1, 1]) {
      const shell = flash ? "#eceaff" : sign < 0 ? "#4779df" : "#9c63df";
      const trim = sign < 0 ? "#91dfff" : "#edc5ff";
      const frame = "#30334a";
      const striking = heavy || attack?.twin === sign;
      const extension = striking ? extent : feint * .58;
      const x = sign * (.45 + orbit * .045);
      const y = coreY + .19 + sign * (.13 + orbit * .064);
      const z = sign * (.29 + orbit * .052) + extension * .30;
      this.prism(t, [
        [y - .24, x, z + .025, .11, .13, .045],
        [y - .10, x, z, .21, .18, .055],
        [y + .15, x, z, .218, .175, .050],
        [y + .24, x, z - .02, .15, .13, .040],
      ], shell);
      this.box(t, x,y+.035,z+.171,.34,.105,.058,frame,.018);
      this.box(t, x,y+.043,z+.203,.247,.029,.013,trim,.005,true);
      this.box(t, x+sign*.214,y+.02,z-.014,.062,.19,.22,frame,.022);
      this.box(t, x+sign*.25,y+.045,z-.014,.019,.07,.12,trim,.007,true);

      const braced = guard || (attack && !striking && !feint);
      const gloveX = sign * (braced ? .31 : .48 - Math.max(0, extension) * .13);
      const gloveY = y - (braced ? .21 : .48) + extension * .11;
      const gloveZ = z + .37 + extension * (special ? .77 : .58);
      this.box(t,gloveX,gloveY,gloveZ,.31,.28,.36,shell,.069);
      this.box(t,gloveX,gloveY,gloveZ+.174,.24,.17,.044,frame,.028);
      this.box(t,gloveX,gloveY+.01,gloveZ+.202,.145,.048,.014,trim,.010,true);
    }
  }

  draw(fighters, sparks, time) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    if (!this.width || !this.height) return;
    const width = Math.round(this.width * pixelRatio), height = Math.round(this.height * pixelRatio);
    if (width !== this.canvas.width || height !== this.canvas.height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const compact = this.width < 420;
    this.focal = Math.min(this.width * (compact ? .80 : .91), this.height * 1.29);
    // Keep both ring edges visible when the touch controls leave a narrow canvas.
    const target = compact ? 0 : Math.max(-2.4, Math.min(2.4, (fighters[0].x + fighters[1].x) / 2));
    this.cameraX += (target - this.cameraX) * .095;
    this.scenery(time);
    for (const fighter of fighters) this.shadow(fighter);
    for (const fighter of fighters) this.fighter(fighter, time);
    this.flush();
    for (const spark of sparks) {
      this.line([spark.x,spark.y,spark.z],
        [spark.x-spark.vx*.035,spark.y-spark.vy*.035,spark.z-spark.vz*.035], spark.color, 1 + spark.life * 6);
    }
    const shade = this.ctx.createLinearGradient(0,0,0,this.height);
    shade.addColorStop(0,"#080b17c4");
    shade.addColorStop(.26,"#080b1700");
    shade.addColorStop(.84,"#080b1700");
    shade.addColorStop(1,"#080b1744");
    this.ctx.fillStyle = shade;
    this.ctx.fillRect(0,0,this.width,this.height);
  }
}
