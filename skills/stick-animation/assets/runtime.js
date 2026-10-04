/*
 * Sticklore runtime
 *
 * Turns a storyboard and the shared library (poses, styles, icons) into SVG.
 * Every drawing function returns a string, so the same code draws the moving
 * animation in a browser and a single still frame anywhere else.
 *
 * Nothing here touches the network or reads anything except its arguments.
 */
(function (root) {
  "use strict";

  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers

  function rad(a) { return a * Math.PI / 180; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clamp01(v) { return clamp(v, 0, 1); }
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); }
  function easeOut(u) { var v = 1 - u; return 1 - v * v * v; }
  function backOut(u) { var c = 1.70158, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; }
  function f(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Deterministic randomness: the same key always wobbles the same way, so
  // lines do not jitter between frames unless the style asks them to "boil".
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function jit(r, k) { return (r() - 0.5) * 2 * k; }

  // ---------------------------------------------------------------- context

  function makeCtx(sb, lib, styleId, opts) {
    opts = opts || {};
    var style = lib.styles[styleId] || lib.styles.whiteboard;
    var T = opts.T || 0;
    return {
      sb: sb, lib: lib, style: style,
      W: lib.stage.width, H: lib.stage.height, ground: lib.stage.ground,
      boil: (style.boil && !opts.still) ? Math.floor(T * 7) % 4 : 0
    };
  }

  // Colors are always one of the style's named roles. This is what keeps a
  // chosen look consistent from the first scene to the last.
  function col(ctx, name) {
    var s = ctx.style;
    if (name === "accent" || name === "accent2" || name === "muted" || name === "bg" || name === "ink") {
      return s[name];
    }
    return s.ink;
  }

  // ---------------------------------------------------------------- paths

  function smooth(p, closed) {
    var n = p.length, d = "M" + f(p[0][0]) + " " + f(p[0][1]);
    var segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      var p0 = closed ? p[(i - 1 + n) % n] : p[Math.max(i - 1, 0)];
      var p1 = p[i % n];
      var p2 = p[(i + 1) % n];
      var p3 = closed ? p[(i + 2) % n] : p[Math.min(i + 2, n - 1)];
      d += "C" + f(p1[0] + (p2[0] - p0[0]) / 6) + " " + f(p1[1] + (p2[1] - p0[1]) / 6) +
        " " + f(p2[0] - (p3[0] - p1[0]) / 6) + " " + f(p2[1] - (p3[1] - p1[1]) / 6) +
        " " + f(p2[0]) + " " + f(p2[1]);
    }
    return d + (closed ? "Z" : "");
  }

  // Straight segments drawn as slightly bowed strokes. "pin" keeps the corner
  // points exact, which limbs need so that joints stay connected.
  function dPoly(ctx, pts, closed, key, pin) {
    var w = ctx.style.wobble, i, d;
    if (!w) {
      d = "";
      for (i = 0; i < pts.length; i++) d += (i ? "L" : "M") + f(pts[i][0]) + " " + f(pts[i][1]);
      return d + (closed ? "Z" : "");
    }
    var r = rng(hash(key + "|" + ctx.boil));
    var j = pin ? 0 : w * 0.45;
    var v = pts.map(function (p) { return [p[0] + jit(r, j), p[1] + jit(r, j)]; });
    if (closed) v.push(v[0]);
    d = "M" + f(v[0][0]) + " " + f(v[0][1]);
    for (i = 1; i < v.length; i++) {
      var a = v[i - 1], b = v[i];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var off = jit(r, w * clamp(len / 90, 0.35, 1.6));
      d += "Q" + f((a[0] + b[0]) / 2 - dy / len * off) + " " + f((a[1] + b[1]) / 2 + dx / len * off) +
        " " + f(b[0]) + " " + f(b[1]);
    }
    return d;
  }

  function dLine(ctx, x1, y1, x2, y2, key, pin) {
    return dPoly(ctx, [[x1, y1], [x2, y2]], false, key, pin);
  }

  function dCurve(ctx, pts, closed, key) {
    var w = ctx.style.wobble;
    if (!w) return smooth(pts, closed);
    var r = rng(hash(key + "|" + ctx.boil)), j = w * 0.5;
    return smooth(pts.map(function (q) { return [q[0] + jit(r, j), q[1] + jit(r, j)]; }), closed);
  }

  function dCircle(ctx, cx, cy, r0, key) {
    var w = ctx.style.wobble;
    if (!w) {
      return "M" + f(cx - r0) + " " + f(cy) + "a" + f(r0) + " " + f(r0) + " 0 1 0 " + f(r0 * 2) +
        " 0a" + f(r0) + " " + f(r0) + " 0 1 0 " + f(-r0 * 2) + " 0Z";
    }
    var r = rng(hash(key + "|c|" + ctx.boil)), n = 9, pts = [], a0 = r() * TAU;
    var k = Math.min(w * 0.7, r0 * 0.12);
    for (var i = 0; i < n; i++) {
      var a = a0 + i / n * TAU, rr = r0 + jit(r, k);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return smooth(pts, true);
  }

  // Draw a stroke the way the style asks: with a glow, with a second sketchy
  // pass, or plain. "build" receives a key and returns path data.
  function ink(ctx, build, key, color, width, o) {
    o = o || {};
    var s = ctx.style, out = "", op = o.opacity == null ? 1 : o.opacity;
    var attrs = ' fill="none" stroke="' + color + '" stroke-linecap="round" stroke-linejoin="round"';
    var d = build(key);
    if (s.glow) {
      out += '<path d="' + d + '"' + attrs + ' stroke-width="' + f(width * 3.6) + '" stroke-opacity="' + f2(0.13 * op) + '"/>';
      out += '<path d="' + d + '"' + attrs + ' stroke-width="' + f(width * 2) + '" stroke-opacity="' + f2(0.28 * op) + '"/>';
    }
    out += '<path d="' + d + '"' + attrs + ' stroke-width="' + f(width) + '"' +
      (op < 1 ? ' stroke-opacity="' + f2(op) + '"' : "") +
      (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + "/>";
    if (s.passes > 1 && s.wobble && !o.dash) {
      out += '<path d="' + build(key + "#2") + '"' + attrs + ' stroke-width="' + f(width * 0.7) +
        '" stroke-opacity="' + f2(0.55 * op) + '"/>';
    }
    return out;
  }

  // ---------------------------------------------------------------- fills

  function hatchPath(ctx, lines, color) {
    var s = ctx.style;
    return '<path d="' + lines.join("") + '" fill="none" stroke="' + color + '" stroke-linecap="round" stroke-width="' +
      f(Math.max(1.5, s.stroke * 0.45)) + '" stroke-opacity="' + f2(s.fillOpacity) + '"/>';
  }

  function fillRect(ctx, x0, y0, x1, y1, color, key) {
    var s = ctx.style;
    if (x1 - x0 < 2 || y1 - y0 < 2) return "";
    if (s.fill !== "hachure") {
      return '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(x1 - x0) + '" height="' + f(y1 - y0) +
        '" fill="' + color + '" fill-opacity="' + f2(s.fillOpacity) + '"/>';
    }
    var gap = Math.max(9, s.stroke * 2.4), lines = [], i = 0;
    for (var c = x0 + y0 + gap * 0.6; c < x1 + y1; c += gap) {
      var xa = Math.max(x0, c - y1), xb = Math.min(x1, c - y0);
      if (xb - xa > 1) lines.push(dLine(ctx, xa, c - xa, xb, c - xb, key + "h" + (i++)));
    }
    return hatchPath(ctx, lines, color);
  }

  function fillCircle(ctx, cx, cy, r, color, key) {
    var s = ctx.style;
    if (s.fill !== "hachure") {
      return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + color +
        '" fill-opacity="' + f2(s.fillOpacity) + '"/>';
    }
    var gap = Math.max(9, s.stroke * 2.4), lines = [], q = Math.SQRT1_2, i = 0, rr = r * 0.94;
    for (var dd = -rr + gap * 0.5; dd < rr; dd += gap) {
      var half = Math.sqrt(rr * rr - dd * dd);
      var mx = cx + dd * q, my = cy + dd * q;
      lines.push(dLine(ctx, mx - half * q, my + half * q, mx + half * q, my - half * q, key + "h" + (i++)));
    }
    return hatchPath(ctx, lines, color);
  }

  function fillPath(ctx, d, color) {
    var s = ctx.style;
    var op = s.fill === "solid" ? s.fillOpacity : 0.24;
    return '<path d="' + d + '" fill="' + color + '" fill-opacity="' + f2(op) + '" stroke="none"/>';
  }

  // ---------------------------------------------------------------- text

  function textWidth(ctx, str, size) { return String(str).length * size * ctx.style.charW; }

  function wrap(str, maxChars) {
    var words = String(str).split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= maxChars) cur += " " + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function txt(ctx, x, y, str, size, color, o) {
    o = o || {};
    var s = ctx.style;
    var a = ' x="' + f(x) + '" y="' + f(y) + '" font-size="' + f(size) + '" text-anchor="' + (o.anchor || "middle") +
      '" dominant-baseline="central" font-family="' + esc(s.font) + '" font-weight="' + (o.weight || s.weight) +
      '" fill="' + color + '"';
    if (o.opacity != null && o.opacity < 1) a += ' opacity="' + f2(o.opacity) + '"';
    if (s.glow) {
      a += ' stroke="' + color + '" stroke-opacity="0.22" stroke-width="' + f(size * 0.14) +
        '" paint-order="stroke" stroke-linejoin="round"';
    }
    else if (o.halo) {
      a += ' stroke="' + s.bg + '" stroke-width="' + f(size * 0.32) + '" paint-order="stroke" stroke-linejoin="round"';
    }
    return "<text" + a + ">" + esc(str) + "</text>";
  }

  // ---------------------------------------------------------------- poses

  function walkPose(ph) {
    var s = Math.sin(ph), c = Math.cos(ph);
    return {
      t: 5, h: 0,
      aF: [-22 * s, 16], aB: [22 * s, 16],
      lF: [26 * s, -24 * Math.max(0, c)], lB: [-26 * s, -24 * Math.max(0, -c)],
      dy: -3 * Math.abs(c)
    };
  }

  function poseAt(ctx, name, t) {
    var P = ctx.lib.poses[name] || ctx.lib.poses.stand;
    if (P.cycle) return walkPose(t * TAU * 1.1);
    var p = {
      t: P.t || 0, h: P.h || 0,
      aF: [P.aF[0], P.aF[1]], aB: [P.aB[0], P.aB[1]],
      lF: [P.lF[0], P.lF[1]], lB: [P.lB[0], P.lB[1]],
      dy: P.dy || 0
    };
    if (P.osc) {
      Object.keys(P.osc).forEach(function (k) {
        var amp = P.osc[k][0], s = Math.sin(t * TAU * P.osc[k][1]);
        if (k === "dy") p.dy -= Math.abs(s) * amp;
        else if (k === "t" || k === "h") p[k] += s * amp;
        else p[k.slice(0, 2)][+k.charAt(2)] += s * amp;
      });
    }
    return p;
  }

  function blend(a, b, w) {
    function m(x, y) { return x + (y - x) * w; }
    function m2(x, y) { return [m(x[0], y[0]), m(x[1], y[1])]; }
    return {
      t: m(a.t, b.t), h: m(a.h, b.h), dy: m(a.dy, b.dy),
      aF: m2(a.aF, b.aF), aB: m2(a.aB, b.aB), lF: m2(a.lF, b.lF), lB: m2(a.lB, b.lB)
    };
  }

  // Angles: 0 points straight down, positive swings toward the way the
  // figure faces. The lower foot always rests on the baseline.
  function skeleton(ctx, pose, x, baseY, facing, sc) {
    var D = ctx.lib.dims;
    function seg(p, ang, len) {
      return [p[0] + facing * Math.sin(rad(ang)) * len * sc, p[1] + Math.cos(rad(ang)) * len * sc];
    }
    function reach(l) { return D.thigh * Math.cos(rad(l[0])) + D.shin * Math.cos(rad(l[0] + l[1])); }
    var down = Math.max(reach(pose.lF), reach(pose.lB), 10);
    var hip = [x, baseY - down * sc + pose.dy * sc];
    var top = [hip[0] + facing * Math.sin(rad(pose.t)) * D.torso * sc, hip[1] - Math.cos(rad(pose.t)) * D.torso * sc];
    var sh = [top[0] + (hip[0] - top[0]) * 0.14, top[1] + (hip[1] - top[1]) * 0.14];
    var ha = pose.t + pose.h;
    var head = [top[0] + facing * Math.sin(rad(ha)) * (D.neck + D.head) * sc,
                top[1] - Math.cos(rad(ha)) * (D.neck + D.head) * sc];
    var kneeF = seg(hip, pose.lF[0], D.thigh), footF = seg(kneeF, pose.lF[0] + pose.lF[1], D.shin);
    var kneeB = seg(hip, pose.lB[0], D.thigh), footB = seg(kneeB, pose.lB[0] + pose.lB[1], D.shin);
    var elbF = seg(sh, pose.aF[0], D.upperArm), handF = seg(elbF, pose.aF[0] + pose.aF[1], D.foreArm);
    var elbB = seg(sh, pose.aB[0], D.upperArm), handB = seg(elbB, pose.aB[0] + pose.aB[1], D.foreArm);
    return {
      hip: hip, top: top, sh: sh, head: head,
      kneeF: kneeF, footF: footF, kneeB: kneeB, footB: footB,
      elbF: elbF, handF: handF, elbB: elbB, handB: handB
    };
  }

  // ---------------------------------------------------------------- actors

  // A key is an instruction issued at time "at": walk to x (if x changes),
  // then take the pose. Fields that are left out carry over from before.
  function resolveKeys(ctx, a) {
    var sc = a.scale || 1;
    var prev = {
      at: 0, x: a.x, fromX: a.x, pose: a.pose || "stand", face: a.face || "right",
      expression: a.expression || "neutral", say: a.say || "", dur: 0, moved: false, arrive: 0
    };
    var res = [prev];
    (a.keys || []).forEach(function (k) {
      var x = k.x != null ? k.x : prev.x, dx = x - prev.x;
      var dur = dx !== 0 ? (k.dur != null ? k.dur : Math.max(0.3, Math.abs(dx) / (ctx.lib.dims.walkSpeed * sc))) : 0;
      var cur = {
        at: k.at, x: x, fromX: prev.x,
        pose: k.pose || prev.pose,
        face: k.face || (dx !== 0 ? (dx > 0 ? "right" : "left") : prev.face),
        expression: k.expression || prev.expression,
        say: k.say || "", dur: dur, moved: dx !== 0, arrive: k.at + dur,
        walkAs: k.walk_as || ""
      };
      res.push(cur);
      prev = cur;
    });
    return res;
  }

  function actorState(ctx, a, t, key) {
    var ks = resolveKeys(ctx, a), i = 0;
    for (var j = 0; j < ks.length; j++) if (ks[j].at <= t) i = j;
    var cur = ks[i], prev = ks[i - 1];
    var sc = a.scale || 1, D = ctx.lib.dims, stride = D.stride * sc;
    var x = cur.x, pose, facing = cur.face === "left" ? -1 : 1;

    // Legs walk; with walk_as the arms and torso hold another pose (carry, push).
    function gait(dist) {
      var wp = walkPose(dist / stride * Math.PI);
      if (cur.walkAs) {
        var up = poseAt(ctx, cur.walkAs, t);
        wp.t = up.t; wp.h = up.h; wp.aF = up.aF; wp.aB = up.aB;
      }
      return wp;
    }

    if (!prev) {
      pose = poseAt(ctx, cur.pose, t);
    } else if (cur.moved && t < cur.arrive) {
      var e = ease((t - cur.at) / cur.dur);
      x = cur.fromX + (cur.x - cur.fromX) * e;
      facing = cur.x > cur.fromX ? 1 : -1;
      pose = blend(poseAt(ctx, prev.pose, t), gait(Math.abs(x - cur.fromX)), clamp01((t - cur.at) / 0.2));
    } else {
      var t0 = cur.moved ? cur.arrive : cur.at;
      var from = cur.moved ? gait(Math.abs(cur.x - cur.fromX)) : poseAt(ctx, prev.pose, t);
      pose = blend(from, poseAt(ctx, cur.pose, t), ease(clamp01((t - t0) / D.poseBlend)));
    }

    var baseY = a.y != null ? a.y : ctx.ground;
    return {
      actor: a, key: key, x: x, baseY: baseY, facing: facing, scale: sc,
      expression: cur.expression, say: cur.say, sayAt: cur.at,
      sk: skeleton(ctx, pose, x, baseY, facing, sc)
    };
  }

  function drawFace(ctx, st, color) {
    var e = st.expression;
    if (e === "none") return "";
    var D = ctx.lib.dims, sc = st.scale, fc = st.facing;
    var cx = st.sk.head[0] + fc * 6 * sc, cy = st.sk.head[1];
    var r = D.head * sc, out = "";
    var eyeY = cy - r * (e === "thinking" ? 0.3 : 0.16);
    var gap = r * 0.34, er = Math.max(1.6, r * 0.11);
    // A blink every few seconds keeps a still figure alive.
    var blink = !ctx.still && ((st.t + (hash(st.key) % 30) / 10) % 3.7) < 0.12;
    [-1, 1].forEach(function (sgn) {
      var ex = cx + sgn * gap;
      if (blink) {
        out += '<path d="M' + f(ex - er * 1.4) + " " + f(eyeY) + "L" + f(ex + er * 1.4) + " " + f(eyeY) +
          '" stroke="' + color + '" stroke-width="' + f(er * 0.9) + '" stroke-linecap="round"/>';
      } else {
        out += '<circle cx="' + f(ex) + '" cy="' + f(eyeY) + '" r="' + f(e === "surprised" ? er * 1.35 : er) +
          '" fill="' + color + '"/>';
      }
    });
    var my = cy + r * 0.4, mw = r * 0.38, sw = Math.max(1.6, ctx.style.stroke * 0.5 * Math.sqrt(sc));
    var m = "";
    if (e === "happy") m = "M" + f(cx - mw) + " " + f(my - 2) + "Q" + f(cx) + " " + f(my + r * 0.36) + " " + f(cx + mw) + " " + f(my - 2);
    else if (e === "sad") m = "M" + f(cx - mw) + " " + f(my + 4) + "Q" + f(cx) + " " + f(my - r * 0.26) + " " + f(cx + mw) + " " + f(my + 4);
    else if (e === "thinking") m = "M" + f(cx - mw * 0.2) + " " + f(my) + "L" + f(cx + mw) + " " + f(my - 2);
    if (m) {
      out += '<path d="' + m + '" fill="none" stroke="' + color + '" stroke-width="' + f(sw) + '" stroke-linecap="round"/>';
    }
    if (e === "surprised") {
      out += '<circle cx="' + f(cx) + '" cy="' + f(my + 1) + '" r="' + f(r * 0.15) + '" fill="none" stroke="' +
        color + '" stroke-width="' + f(sw) + '"/>';
    }
    return out;
  }

  function drawActor(ctx, st) {
    var a = st.actor, s = st.sk, sc = st.scale, D = ctx.lib.dims, k = st.key;
    var color = col(ctx, a.color || "ink");
    var w = ctx.style.stroke * (0.55 + 0.45 * sc);
    var foot = D.foot * sc * st.facing;
    function limb(pts, name) {
      return ink(ctx, function (key) { return dPoly(ctx, pts, false, key, true); }, k + name, color, w);
    }
    var out = "";
    out += limb([s.sh, s.elbB, s.handB], "aB");
    out += limb([s.hip, s.kneeB, s.footB, [s.footB[0] + foot, s.footB[1]]], "lB");
    out += limb([s.hip, s.top], "t");
    out += limb([s.hip, s.kneeF, s.footF, [s.footF[0] + foot, s.footF[1]]], "lF");
    var r = D.head * sc, filled = ctx.style.headFill === "ink";
    out += '<circle cx="' + f(s.head[0]) + '" cy="' + f(s.head[1]) + '" r="' + f(r) + '" fill="' +
      (filled ? color : ctx.style.bg) + '"/>';
    out += ink(ctx, function (key) { return dCircle(ctx, s.head[0], s.head[1], r, key); }, k + "hd", color, w);
    out += drawFace(ctx, st, filled ? ctx.style.bg : color);
    out += limb([s.sh, s.elbF, s.handF], "aF");
    return out;
  }

  function drawActorExtras(ctx, st, t) {
    var a = st.actor, D = ctx.lib.dims, out = "";
    if (a.label) {
      out += txt(ctx, st.x, st.baseY + 36, a.label, 28, col(ctx, a.color || "ink"), { opacity: 0.9 });
    }
    if (!st.say) return out;

    var size = 32, lines = wrap(st.say, 18).slice(0, 3), wmax = 0;
    lines.forEach(function (l) { wmax = Math.max(wmax, textWidth(ctx, l, size)); });
    var bw = Math.max(74, wmax + 44), bh = lines.length * size * 1.2 + 26;
    var hx = st.sk.head[0], hy = st.sk.head[1], hr = D.head * st.scale;
    var cx = clamp(hx + st.facing * (bw * 0.3 + 14), bw / 2 + 16, ctx.W - bw / 2 - 16);
    var top = Math.max(12, hy - hr - 30 - bh), by = top + bh;
    var x0 = cx - bw / 2, x1 = cx + bw / 2;
    var tx = clamp(hx + st.facing * 20, x0 + 22, x1 - 22);
    var tip = [hx + st.facing * hr * 0.55, hy - hr - 6];
    var p = backOut(clamp01((t - st.sayAt) / 0.22));
    var ink0 = ctx.style.ink, bg = ctx.style.bg, sw = Math.max(2, ctx.style.stroke * 0.7), k = st.key + "sb";
    var g = '<g transform="translate(' + f(tip[0]) + " " + f(tip[1]) + ") scale(" + f2(p) + ") translate(" +
      f(-tip[0]) + " " + f(-tip[1]) + ')">';
    g += '<rect x="' + f(x0) + '" y="' + f(top) + '" width="' + f(bw) + '" height="' + f(bh) + '" rx="6" fill="' + bg + '"/>';
    g += ink(ctx, function (key) { return dPoly(ctx, [[x0, top], [x1, top], [x1, by], [x0, by]], true, key); }, k, ink0, sw);
    g += '<path d="M' + f(tx - 11) + " " + f(by - 2) + "L" + f(tip[0]) + " " + f(tip[1]) + "L" + f(tx + 11) + " " + f(by - 2) +
      'Z" fill="' + bg + '"/>';
    g += '<path d="M' + f(tx - 9) + " " + f(by) + "L" + f(tx + 9) + " " + f(by) + '" stroke="' + bg + '" stroke-width="' +
      f(sw * 3) + '"/>';
    g += ink(ctx, function (key) { return dPoly(ctx, [[tx - 11, by], tip, [tx + 11, by]], false, key, true); }, k + "t", ink0, sw);
    lines.forEach(function (l, i) {
      g += txt(ctx, cx, top + 13 + size * 0.6 + i * size * 1.2, l, size, ink0);
    });
    return out + g + "</g>";
  }

  // ---------------------------------------------------------------- props

  var ENTER = { box: "pop", circle: "pop", icon: "pop", path: "pop", text: "fade", counter: "fade", line: "draw", arrow: "draw", bar: "grow" };
  var ENTER_DUR = { pop: 0.35, fade: 0.4, draw: 0.6, grow: 0.8, type: 0, none: 0 };
  var SIZES = { s: 28, m: 40, l: 56, xl: 80 };

  function sizeOf(v, dflt) {
    if (typeof v === "number") return v;
    return SIZES[v] || dflt;
  }

  function groupNumber(n, decimals) {
    var parts = n.toFixed(decimals).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  function drawIcon(ctx, name, x, y, size, color, key, spinDeg) {
    var shapes = ctx.lib.icons[name];
    if (!shapes) return "";
    var k = size / 100, cs = Math.cos(rad(spinDeg || 0)), sn = Math.sin(rad(spinDeg || 0));
    function P(px, py) {
      var dx = (px - 50) * k, dy = (py - 50) * k;
      return [x + dx * cs - dy * sn, y + dx * sn + dy * cs];
    }
    var w = Math.max(2, ctx.style.stroke * 0.8), out = "";
    shapes.forEach(function (sh, i) {
      var kk = key + "i" + i, kind = sh[0], pts, d;
      if (kind === "line") {
        var a = P(sh[1], sh[2]), b = P(sh[3], sh[4]);
        out += ink(ctx, function (q) { return dLine(ctx, a[0], a[1], b[0], b[1], q); }, kk, color, w);
      } else if (kind === "circle") {
        var c = P(sh[1], sh[2]);
        if (sh[4]) out += fillCircle(ctx, c[0], c[1], sh[3] * k, color, kk);
        out += ink(ctx, function (q) { return dCircle(ctx, c[0], c[1], sh[3] * k, q); }, kk, color, w);
      } else if (kind === "dot") {
        var dc = P(sh[1], sh[2]);
        out += '<circle cx="' + f(dc[0]) + '" cy="' + f(dc[1]) + '" r="' + f(sh[3] * k) + '" fill="' + color + '"/>';
      } else if (kind === "poly" || kind === "curve") {
        pts = sh[1].map(function (p) { return P(p[0], p[1]); });
        var build = kind === "poly"
          ? function (q) { return dPoly(ctx, pts, sh[2], q); }
          : function (q) { return dCurve(ctx, pts, sh[2], q); };
        if (sh[3]) out += fillPath(ctx, build(kk + "f"), color);
        out += ink(ctx, build, kk, color, w);
      } else if (kind === "rect") {
        pts = [P(sh[1], sh[2]), P(sh[3], sh[2]), P(sh[3], sh[4]), P(sh[1], sh[4])];
        d = function (q) { return dPoly(ctx, pts, true, q); };
        if (sh[5]) out += fillPath(ctx, d(kk + "f"), color);
        out += ink(ctx, d, kk, color, w);
      } else if (kind === "rays") {
        for (var n = 0; n < sh[5]; n++) {
          var ang = rad(sh[6] + n * 360 / sh[5]);
          var p1 = P(sh[1] + Math.cos(ang) * sh[3], sh[2] + Math.sin(ang) * sh[3]);
          var p2 = P(sh[1] + Math.cos(ang) * sh[4], sh[2] + Math.sin(ang) * sh[4]);
          out += ink(ctx, (function (m, o) {
            return function (q) { return dLine(ctx, m[0], m[1], o[0], o[1], q); };
          })(p1, p2), kk + "r" + n, color, w);
        }
      } else if (kind === "text") {
        var tp = P(sh[1], sh[2]);
        out += txt(ctx, tp[0], tp[1], sh[3], sh[4] * k, color, { weight: 700 });
      }
    });
    return out;
  }

  function drawProp(ctx, p, t, actors, key) {
    var appear = p.appear || 0;
    if (t < appear) return "";
    var alpha = 1;
    if (p.disappear != null) {
      if (t >= p.disappear + 0.3) return "";
      if (t > p.disappear) alpha = 1 - (t - p.disappear) / 0.3;
    }
    var enter = p.enter || ENTER[p.type] || "none";
    var ed = ENTER_DUR[enter] || 0;
    var prog = ctx.still ? 1 : (ed ? clamp01((t - appear) / ed) : 1);
    var G = ctx.ground, S = ctx.style;
    var color = col(ctx, p.color || (p.type === "icon" || p.type === "bar" ? "accent" : "ink"));
    var w = S.stroke;

    // Starting values. Leaving y out rests the prop on the ground.
    var size = p.type === "icon" || p.type === "path" ? (p.size || 90) : 0;
    var v = { x: p.x || 0, y: p.y, h: p.h, scale: p.scale == null ? 1 : p.scale, value: p.value };
    var half = p.type === "box" ? (p.h || 80) / 2 : p.type === "circle" ? (p.r || 40) : size / 2;

    (p.keys || []).forEach(function (k) {
      if (t < k.at) return;
      var d = k.dur == null ? 0.6 : k.dur;
      var u = ctx.still ? 1 : ease(d > 0 ? clamp01((t - k.at) / d) : 1);
      ["x", "y", "h", "scale"].forEach(function (fld) {
        if (k[fld] == null) return;
        v[fld] = v[fld] == null ? k[fld] : v[fld] + (k[fld] - v[fld]) * u;
      });
      if (k.value != null && u >= 0.5) v.value = k.value;
    });

    var sc = v.scale;
    if (enter === "pop") sc *= backOut(prog);
    if (enter === "fade") alpha *= prog;

    if (v.y == null) v.y = p.type === "bar" ? G : (half ? G - half * sc : ctx.H / 2);
    if (p.float) v.y += Math.sin(t * TAU / 3 + (hash(key) % 10)) * p.float;

    if (p.held_by) {
      var holder = null;
      actors.forEach(function (st) { if (st.actor.id === p.held_by) holder = st; });
      if (holder) {
        var hf = holder.sk.handF, hb = holder.sk.handB;
        v.x = (hf[0] + hb[0]) / 2 + holder.facing * 6;
        v.y = Math.min(hf[1], hb[1]) - (half || 30) * sc + 2;
      }
    }

    var out = "", x = v.x, y = v.y;

    if (p.type === "box") {
      var bw = (p.w || 120) * sc, bh = (p.h || 80) * sc;
      var x0 = x - bw / 2, y0 = y - bh / 2, x1 = x + bw / 2, y1 = y + bh / 2;
      if (p.fill) out += fillRect(ctx, x0, y0, x1, y1, col(ctx, p.fill === true ? "accent" : p.fill), key);
      out += ink(ctx, function (q) { return dPoly(ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, q); }, key, color, w * 0.85);
      if (p.label) {
        var ls = clamp(Math.min(bh * 0.42, (bw - 16) / (String(p.label).length * S.charW)), 14, 40);
        out += txt(ctx, x, y, p.label, ls, color, { halo: p.fill && S.fill === "hachure" });
      }
    } else if (p.type === "circle") {
      var r = (p.r || 40) * sc;
      if (p.fill) out += fillCircle(ctx, x, y, r, col(ctx, p.fill === true ? "accent" : p.fill), key);
      out += ink(ctx, function (q) { return dCircle(ctx, x, y, r, q); }, key, color, w * 0.85);
      if (p.label) {
        out += txt(ctx, x, y, p.label, clamp(Math.min(r * 0.7, (r * 2 - 12) / (String(p.label).length * S.charW)), 14, 40 * Math.max(1, sc)), color,
          { halo: p.fill && S.fill === "hachure" });
      }
    } else if (p.type === "icon") {
      out += drawIcon(ctx, p.name, x, y, size * sc, color, key, p.spin ? p.spin * t : 0);
      if (p.label) out += txt(ctx, x, y + size * sc / 2 + 24, p.label, 28, color);
    } else if (p.type === "path") {
      var k2 = size * sc / 100;
      out += '<path d="' + esc(p.d) + '" transform="translate(' + f(x - 50 * k2) + " " + f(y - 50 * k2) + ") scale(" +
        f2(k2) + ')" fill="' + (p.fill ? col(ctx, p.fill === true ? "accent" : p.fill) : "none") +
        '" fill-opacity="0.3" stroke="' + color + '" stroke-width="' + f(w * 0.85 / k2) +
        '" stroke-linecap="round" stroke-linejoin="round"/>';
      if (p.label) out += txt(ctx, x, y + size * sc / 2 + 24, p.label, 28, color);
    } else if (p.type === "text") {
      var ts = sizeOf(p.size, 40) * sc;
      var str = String(p.text == null ? "" : p.text);
      if (enter === "type" && !ctx.still) str = str.slice(0, Math.floor((t - appear) * 28));
      var rows = str.split("\n");
      rows.forEach(function (row, i) {
        out += txt(ctx, x, y + (i - (rows.length - 1) / 2) * ts * 1.2, row, ts, color,
          { anchor: p.align === "left" ? "start" : p.align === "right" ? "end" : "middle" });
      });
    } else if (p.type === "counter") {
      var cs = sizeOf(p.size, 56) * sc;
      var st0 = p.start == null ? appear : p.start, cd = p.dur == null ? 1.5 : p.dur;
      var cu = ctx.still ? 1 : ease(cd > 0 ? clamp01((t - st0) / cd) : 1);
      var num = (p.from || 0) + ((p.to == null ? 0 : p.to) - (p.from || 0)) * cu;
      out += txt(ctx, x, y, (p.prefix || "") + groupNumber(num, p.decimals || 0) + (p.suffix || ""), cs, color);
    } else if (p.type === "line" || p.type === "arrow") {
      var ox = x - (p.x || 0), oy = p.y != null ? y - p.y : 0;
      var ax = x, ay = y, bx = (p.x2 == null ? x + 100 : p.x2) + ox, by2 = (p.y2 == null ? (p.y != null ? p.y : y) : p.y2) + oy;
      var dx = bx - ax, dy = by2 - ay, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var bend = p.bend || 0;
      var cxp = (ax + bx) / 2 - dy / len * bend, cyp = (ay + by2) / 2 + dx / len * bend;
      var e = enter === "draw" ? easeOut(prog) : 1;
      // Exact sub-curve of the quadratic from 0 to e, so the line grows from its start.
      var c1 = [ax + (cxp - ax) * e, ay + (cyp - ay) * e];
      var m2 = [cxp + (bx - cxp) * e, cyp + (by2 - cyp) * e];
      var tipP = [c1[0] + (m2[0] - c1[0]) * e, c1[1] + (m2[1] - c1[1]) * e];
      out += ink(ctx, function (q) {
        var rr = rng(hash(q + "|" + ctx.boil)), o = jit(rr, S.wobble * clamp(len / 90, 0.35, 1.6));
        return "M" + f(ax) + " " + f(ay) + "Q" + f(c1[0] - dy / len * o) + " " + f(c1[1] + dx / len * o) + " " + f(tipP[0]) + " " + f(tipP[1]);
      }, key, color, w * 0.85, p.dashed ? { dash: f(w * 2.4) + " " + f(w * 2.6) } : null);
      if (p.type === "arrow" && e > 0.15) {
        var tx2 = tipP[0] - c1[0], ty2 = tipP[1] - c1[1], tl = Math.sqrt(tx2 * tx2 + ty2 * ty2);
        if (tl < 0.5) { tx2 = dx; ty2 = dy; tl = len; }
        var ang = Math.atan2(ty2, tx2), hl = 12 + w * 2.2;
        var h1 = [tipP[0] - Math.cos(ang - 0.5) * hl, tipP[1] - Math.sin(ang - 0.5) * hl];
        var h2 = [tipP[0] - Math.cos(ang + 0.5) * hl, tipP[1] - Math.sin(ang + 0.5) * hl];
        out += ink(ctx, function (q) { return dPoly(ctx, [h1, tipP, h2], false, q, true); }, key + "hd", color, w * 0.85);
      }
      if (p.label && e > 0.6) {
        var side = bend < 0 ? -1 : 1;
        out += txt(ctx, cxp * 0.5 + (ax + bx) / 4 - dy / len * 26 * side, cyp * 0.5 + (ay + by2) / 4 + dx / len * 26 * side - 2,
          p.label, 28, color);
      }
    } else if (p.type === "bar") {
      var barW = (p.w || 80), full = (v.h == null ? 120 : v.h);
      var hNow = full * (enter === "grow" ? easeOut(prog) : 1);
      var bx0 = x - barW / 2, bx1 = x + barW / 2, byTop = y - hNow;
      if (hNow > 2) {
        if (p.fill !== false) out += fillRect(ctx, bx0, byTop, bx1, y, color, key);
        out += ink(ctx, function (q) { return dPoly(ctx, [[bx0, y], [bx0, byTop], [bx1, byTop], [bx1, y]], false, q); }, key, color, w * 0.85);
      }
      if (p.label) out += txt(ctx, x, y + 34, p.label, 30, S.ink);
      if (v.value != null && prog > 0.5) out += txt(ctx, x, byTop - 28, v.value, 34, S.ink);
    }

    if (!out) return "";
    return alpha < 1 ? '<g opacity="' + f2(alpha) + '">' + out + "</g>" : out;
  }

  // ---------------------------------------------------------------- scenes

  function drawTitle(ctx, title, t, key) {
    var size = clamp(Math.floor((ctx.W - 160) / (String(title).length * ctx.style.charW)), 30, 54);
    var p = ctx.still ? 1 : clamp01(t / 0.5);
    var half = textWidth(ctx, title, size) / 2 + 8;
    var out = txt(ctx, ctx.W / 2, 74, title, size, ctx.style.ink, { opacity: p });
    var e = easeOut(p);
    out += ink(ctx, function (q) {
      return dLine(ctx, ctx.W / 2 - half, 74 + size * 0.72, ctx.W / 2 - half + half * 2 * e, 74 + size * 0.72, q);
    }, key, ctx.style.accent, Math.max(3, ctx.style.stroke * 0.8));
    return out;
  }

  function frame(sb, lib, styleId, index, t, opts) {
    opts = opts || {};
    var ctx = makeCtx(sb, lib, styleId, { T: opts.T == null ? t : opts.T, still: opts.still });
    ctx.still = !!opts.still;
    var sc = sb.scenes[index];
    if (!sc) return "";
    if (sc.ground_y != null) ctx.ground = sc.ground_y;
    var out = "", pre = "s" + index;

    if (sc.ground !== false) {
      out += ink(ctx, function (q) { return dLine(ctx, 60, ctx.ground, ctx.W - 60, ctx.ground, q); },
        pre + "g", ctx.style.muted, Math.max(2, ctx.style.stroke * 0.6));
    }
    var actors = (sc.actors || []).map(function (a, i) {
      var st = actorState(ctx, a, t, pre + "a" + i);
      st.t = t;
      return st;
    });
    var back = "", front = "";
    (sc.props || []).forEach(function (p, i) {
      var s = drawProp(ctx, p, t, actors, pre + "p" + i);
      if (p.front || p.held_by) front += s; else back += s;
    });
    out += back;
    actors.forEach(function (st) { out += drawActor(ctx, st); });
    out += front;
    actors.forEach(function (st) { out += drawActorExtras(ctx, st, ctx.still ? st.sayAt + 1 : t); });
    if (sc.title) out += drawTitle(ctx, sc.title, t, pre + "ti");

    var a = ctx.still ? 1 : clamp01(t / 0.25);
    return a < 1 ? '<g opacity="' + f2(a) + '">' + out + "</g>" : out;
  }

  function background(lib, styleId) {
    var s = lib.styles[styleId] || lib.styles.whiteboard;
    var W = lib.stage.width, H = lib.stage.height, x, y;
    var o = '<rect width="' + W + '" height="' + H + '" fill="' + s.bg + '"/>';
    if (s.pattern === "ruled") {
      for (y = 56; y < H; y += 40) {
        o += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#8fa8d6" stroke-opacity="0.45" stroke-width="1.5"/>';
      }
      o += '<line x1="92" y1="0" x2="92" y2="' + H + '" stroke="#e07a7a" stroke-opacity="0.6" stroke-width="2"/>';
    } else if (s.pattern === "grid") {
      for (x = 40; x < W; x += 40) {
        o += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="' + s.ink + '" stroke-opacity="' + (x % 200 ? 0.09 : 0.2) + '"/>';
      }
      for (y = 40; y < H; y += 40) {
        o += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="' + s.ink + '" stroke-opacity="' + (y % 200 ? 0.09 : 0.2) + '"/>';
      }
    } else if (s.pattern === "dots") {
      for (y = 40; y < H; y += 40) {
        for (x = 40; x < W; x += 40) {
          o += '<circle cx="' + x + '" cy="' + y + '" r="1.6" fill="' + s.ink + '" fill-opacity="0.16"/>';
        }
      }
    }
    return o;
  }

  // A complete standalone picture of one moment.
  function still(sb, lib, styleId, index, t) {
    var W = lib.stage.width, H = lib.stage.height;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">' +
      background(lib, styleId) + frame(sb, lib, styleId, index, t, { still: true }) + "</svg>";
  }

  function total(sb) {
    return sb.scenes.reduce(function (sum, s) { return sum + s.duration; }, 0);
  }

  // Which scene is playing at overall time T, and how far into it.
  function locate(sb, T) {
    var acc = 0, n = sb.scenes.length;
    for (var i = 0; i < n; i++) {
      var d = sb.scenes[i].duration;
      if (T < acc + d || i === n - 1) return { index: i, t: Math.min(T - acc, d), start: acc };
      acc += d;
    }
    return { index: 0, t: 0, start: 0 };
  }

  var api = { frame: frame, background: background, still: still, total: total, locate: locate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StickRT = api;
})(typeof window !== "undefined" ? window : this);
