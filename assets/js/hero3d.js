/* ==========================================================================
   hero3d — scroll-scrubbed 3D wireframe on a pinned canvas.

   No WebGL, no external assets: a subdivided icosahedron is projected by hand
   into canvas 2D. Scroll progress drives rotation, camera dolly and vertex
   dispersion; a slow time drift keeps it alive when the user is still.
   ========================================================================== */

(function () {
  'use strict';

  var canvas = document.querySelector('[data-hero-canvas]');
  var section = document.querySelector('[data-hero]');
  if (!canvas || !section) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia('(max-width: 860px)').matches;

  var BONE = '233,229,221';
  var PATINA = '140,163,150';

  /* ---------------------------------------------------------------- geometry */

  function buildGeodesic(subdivisions) {
    var t = (1 + Math.sqrt(5)) / 2;
    var verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ];
    var faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    function normalise(v) {
      var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    }
    verts = verts.map(normalise);

    var cache = {};
    function midpoint(a, b) {
      var key = a < b ? a + '_' + b : b + '_' + a;
      if (cache[key] !== undefined) return cache[key];
      var va = verts[a], vb = verts[b];
      verts.push(normalise([
        (va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2
      ]));
      cache[key] = verts.length - 1;
      return cache[key];
    }

    for (var s = 0; s < subdivisions; s++) {
      var next = [];
      for (var f = 0; f < faces.length; f++) {
        var a = faces[f][0], b = faces[f][1], c = faces[f][2];
        var ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = next;
    }

    var seen = {};
    var edges = [];
    for (var i = 0; i < faces.length; i++) {
      var tri = faces[i];
      for (var e = 0; e < 3; e++) {
        var p = tri[e], q = tri[(e + 1) % 3];
        var k = p < q ? p + '_' + q : q + '_' + p;
        if (!seen[k]) { seen[k] = 1; edges.push([p, q]); }
      }
    }

    return { verts: verts, edges: edges };
  }

  var mesh = buildGeodesic(mobile ? 1 : 2);

  /* Orbital particle belt */
  var BELT = mobile ? 60 : 130;
  var belt = [];
  for (var i = 0; i < BELT; i++) {
    var a = Math.random() * Math.PI * 2;
    var r = 1.55 + Math.random() * 0.75;
    belt.push({
      a: a,
      r: r,
      y: (Math.random() - 0.5) * 0.5,
      speed: 0.12 + Math.random() * 0.3,
      size: Math.random() < 0.16 ? 1.7 : 1
    });
  }

  /* Great-circle rings, each on its own tilted plane */
  var rings = [
    { tiltX: 0.0, tiltZ: 0.0, r: 1.30 },
    { tiltX: 1.1, tiltZ: 0.4, r: 1.42 },
    { tiltX: 0.6, tiltZ: -0.9, r: 1.18 }
  ];

  /* ---------------------------------------------------------------- state */

  var W = 0, H = 0, dpr = 1;
  var progress = 0;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var ticking = false;
  var visible = true;
  var raf = null;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mobile = window.matchMedia('(max-width: 860px)').matches;
    draw();
  }

  function readProgress() {
    var rect = section.getBoundingClientRect();
    var range = section.offsetHeight - window.innerHeight;
    var p = range > 0 ? -rect.top / range : 0;
    progress = p < 0 ? 0 : p > 1 ? 1 : p;
  }

  /* ---------------------------------------------------------------- render */

  function rotate(p, rx, ry) {
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var x = p[0] * cy - p[2] * sy;
    var z = p[0] * sy + p[2] * cy;
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var y = p[1] * cx - z * sx;
    z = p[1] * sx + z * cx;
    return [x, y, z];
  }

  function draw(time) {
    if (!W || !H) return;
    var t = (time || 0) * 0.001;
    var p = progress;

    ctx.clearRect(0, 0, W, H);

    var cx = W * (mobile ? 0.5 : 0.68);
    var cy = H * (mobile ? 0.38 : 0.5);

    /* Scroll choreography */
    var rotY = p * Math.PI * 2.4 + (reduced ? 0 : t * 0.09) + pointer.x * 0.35;
    var rotX = -0.35 + p * 0.9 + pointer.y * 0.25;
    var dolly = 3.9 - p * 1.25;                    // camera pulls in
    var disperse = Math.pow(Math.max(0, p - 0.44) / 0.56, 1.7); // shell breaks apart
    var fade = 1 - Math.pow(Math.max(0, p - 0.86) / 0.14, 2);   // dissolve at the end
    if (fade < 0) fade = 0;

    var base = Math.min(W, H) * (mobile ? 0.46 : 0.40);
    var focal = 2.7;

    function project(v) {
      var z = v[2] + dolly;
      if (z <= 0.05) z = 0.05;
      var k = (focal / z) * base;
      return { x: cx + v[0] * k, y: cy - v[1] * k, d: z, k: k };
    }

    /* Vertices, rotated + dispersed along their own normal */
    var pts = new Array(mesh.verts.length);
    for (var i = 0; i < mesh.verts.length; i++) {
      var v = mesh.verts[i];
      var push = 1 + disperse * (0.35 + ((i * 37) % 100) / 100 * 1.5);
      pts[i] = project(rotate([v[0] * push, v[1] * push, v[2] * push], rotX, rotY));
    }

    /* Edges — hairlines, depth-faded, thinning as the shell disperses.
       Quantised into BUCKETS alpha bands so the whole wireframe costs a
       handful of stroke() calls instead of one per edge. */
    var edgeAlpha = (1 - disperse * 0.85) * fade;
    if (edgeAlpha > 0.01) {
      var BUCKETS = 7;
      var bands = [];
      for (var bkt = 0; bkt < BUCKETS; bkt++) bands.push(null);

      for (var e = 0; e < mesh.edges.length; e++) {
        var a = pts[mesh.edges[e][0]], b = pts[mesh.edges[e][1]];
        var depth = 1 - (((a.d + b.d) / 2) - (dolly - 1)) / 2;
        if (depth < 0) depth = 0; else if (depth > 1) depth = 1;
        var band = Math.min(BUCKETS - 1, Math.floor(depth * BUCKETS));
        if (!bands[band]) bands[band] = new Path2D();
        bands[band].moveTo(a.x, a.y);
        bands[band].lineTo(b.x, b.y);
      }

      ctx.lineWidth = 1;
      for (var bd = 0; bd < BUCKETS; bd++) {
        if (!bands[bd]) continue;
        var al = (0.035 + ((bd + 0.5) / BUCKETS) * 0.20) * edgeAlpha;
        ctx.strokeStyle = 'rgba(' + BONE + ',' + al.toFixed(3) + ')';
        ctx.stroke(bands[bd]);
      }
    }

    /* Vertex nodes — same banding trick, split by accent colour */
    var NB = 5;
    var nodeBands = [];
    for (var nb = 0; nb < NB * 2; nb++) nodeBands.push(null);

    for (var n = 0; n < pts.length; n++) {
      var pt = pts[n];
      var dep = 1 - (pt.d - (dolly - 1)) / 2;
      if (dep < 0) dep = 0; else if (dep > 1) dep = 1;
      var accent = n % 9 === 0;
      var slot = (accent ? NB : 0) + Math.min(NB - 1, Math.floor(dep * NB));
      if (!nodeBands[slot]) nodeBands[slot] = new Path2D();
      var rad = (accent ? 1.9 : 1.15) * (0.55 + dep * 0.75);
      nodeBands[slot].moveTo(pt.x + rad, pt.y);
      nodeBands[slot].arc(pt.x, pt.y, rad, 0, Math.PI * 2);
    }

    for (var ns = 0; ns < nodeBands.length; ns++) {
      if (!nodeBands[ns]) continue;
      var isAccent = ns >= NB;
      var d0 = ((ns % NB) + 0.5) / NB;
      ctx.fillStyle = 'rgba(' + (isAccent ? PATINA : BONE) + ',' +
        (((isAccent ? 0.30 : 0.14) + d0 * 0.42) * fade).toFixed(3) + ')';
      ctx.fill(nodeBands[ns]);
    }

    /* Great-circle rings */
    var ringAlpha = (1 - disperse) * fade;
    if (ringAlpha > 0.01) {
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        ctx.beginPath();
        for (var s = 0; s <= 64; s++) {
          var ang = (s / 64) * Math.PI * 2;
          var rp = [Math.cos(ang) * ring.r, 0, Math.sin(ang) * ring.r];
          var tilted = rotate(rp, ring.tiltX, ring.tiltZ);
          var pr = project(rotate(tilted, rotX, rotY + (reduced ? 0 : t * 0.04 * (r + 1))));
          if (s === 0) ctx.moveTo(pr.x, pr.y); else ctx.lineTo(pr.x, pr.y);
        }
        ctx.strokeStyle = 'rgba(' + (r === 1 ? PATINA : BONE) + ',' +
          (r === 1 ? 0.13 : 0.07) * ringAlpha + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    /* Orbital belt */
    var beltBands = [];
    for (var bb = 0; bb < NB * 2; bb++) beltBands.push(null);

    for (var bi = 0; bi < belt.length; bi++) {
      var pcl = belt[bi];
      var ang2 = pcl.a + (reduced ? 0 : t * pcl.speed * 0.32) + p * pcl.speed * 3.4;
      var rr = pcl.r + disperse * 1.4;
      var pp = project(rotate([Math.cos(ang2) * rr, pcl.y, Math.sin(ang2) * rr], rotX + 0.18, rotY));
      var bdp = 1 - (pp.d - (dolly - 1)) / 2.4;
      if (bdp < 0) bdp = 0; else if (bdp > 1) bdp = 1;
      var bslot = (pcl.size > 1.4 ? NB : 0) + Math.min(NB - 1, Math.floor(bdp * NB));
      if (!beltBands[bslot]) beltBands[bslot] = new Path2D();
      var brad = pcl.size * (0.45 + bdp * 0.7);
      beltBands[bslot].moveTo(pp.x + brad, pp.y);
      beltBands[bslot].arc(pp.x, pp.y, brad, 0, Math.PI * 2);
    }

    for (var bs = 0; bs < beltBands.length; bs++) {
      if (!beltBands[bs]) continue;
      var bAccent = bs >= NB;
      var bd1 = ((bs % NB) + 0.5) / NB;
      ctx.fillStyle = 'rgba(' + (bAccent ? PATINA : BONE) + ',' +
        ((0.06 + bd1 * 0.36) * fade).toFixed(3) + ')';
      ctx.fill(beltBands[bs]);
    }

    /* Horizon hairline — grounds the object, widens with scroll */
    var hw = base * (1.5 + p * 1.6);
    ctx.strokeStyle = 'rgba(' + BONE + ',' + 0.055 * fade + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy + base * 1.02);
    ctx.lineTo(cx + hw, cy + base * 1.02);
    ctx.stroke();
  }

  /* ---------------------------------------------------------------- loop */

  function frame(time) {
    pointer.x += (pointer.tx - pointer.x) * 0.055;
    pointer.y += (pointer.ty - pointer.y) * 0.055;
    draw(time);
    raf = visible ? requestAnimationFrame(frame) : null;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function (time) {
      readProgress();
      if (reduced || !visible) draw(time);
      ticking = false;
    });
  }

  function onPointer(ev) {
    pointer.tx = (ev.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (ev.clientY / window.innerHeight - 0.5) * 2;
  }

  /* Pause the loop entirely when the hero is off-screen */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !raf && !reduced) raf = requestAnimationFrame(frame);
    }, { rootMargin: '10% 0px' }).observe(section);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize);
  if (window.matchMedia('(pointer: fine)').matches && !reduced) {
    window.addEventListener('pointermove', onPointer, { passive: true });
  }

  readProgress();
  resize();
  if (reduced) draw(0);
  else raf = requestAnimationFrame(frame);

  /* ---------------------------------------------------------------- HUD */

  var huds = Array.prototype.slice.call(document.querySelectorAll('[data-hud]'));
  var hudState = '';
  if (huds.length) {
    var hudTick = false;
    window.addEventListener('scroll', function () {
      if (hudTick) return;
      hudTick = true;
      requestAnimationFrame(function () {
        var on = [];
        for (var i = 0; i < huds.length; i++) {
          var el = huds[i];
          var show = parseFloat(el.dataset.show);
          var hide = parseFloat(el.dataset.hide);
          if (progress >= show && progress <= hide) on.push(i);
        }
        var key = on.join(',');
        if (key !== hudState) {                       // only touch the DOM on change
          hudState = key;
          for (var j = 0; j < huds.length; j++) {
            huds[j].classList.toggle('is-on', on.indexOf(j) !== -1);
          }
        }
        hudTick = false;
      });
    }, { passive: true });
  }
})();
