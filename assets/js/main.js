/* ==========================================================================
   main — smooth scroll, reveals, cursor, nav, magnetics.

   Progressive enhancement: Lenis and GSAP are optional. If either CDN fails
   the page still scrolls natively and reveals fall back to IntersectionObserver.
   ========================================================================== */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  document.documentElement.classList.remove('no-js');
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------------------------ preloader */

  var preload = document.querySelector('[data-preload]');
  function dismissPreloader() {
    if (!preload) return;
    preload.classList.add('is-done');
    document.body.classList.add('is-ready');
    window.setTimeout(function () { preload.remove(); }, 700);
  }

  if (preload) {
    var countEl = preload.querySelector('[data-preload-count]');
    var barEl = preload.querySelector('[data-preload-bar]');
    var pct = 0;
    var settled = false;
    var tick = window.setInterval(function () {
      pct += Math.random() * 11 + 4;
      if (pct >= 100) { pct = 100; window.clearInterval(tick); finish(); }
      if (countEl) countEl.textContent = String(Math.floor(pct)).padStart(3, '0');
      if (barEl) barEl.style.transform = 'scaleX(' + pct / 100 + ')';
    }, 90);

    function finish() {
      if (settled) return;
      settled = true;
      window.setTimeout(function () {
        dismissPreloader();
        intro();
      }, 260);
    }
    window.setTimeout(finish, 3200);   // hard ceiling — never trap the user
  }

  /* Hero entrance, once the curtain lifts */
  function intro() {
    var masks = document.querySelectorAll('[data-intro] .mask');
    masks.forEach(function (m, i) {
      window.setTimeout(function () { m.classList.add('is-in'); }, i * 95);
    });
    var fades = document.querySelectorAll('[data-intro] [data-reveal]');
    fades.forEach(function (f, i) {
      window.setTimeout(function () { f.classList.add('is-in'); }, 260 + i * 90);
    });
  }
  if (!preload) intro();

  /* ------------------------------------------------------------ smooth scroll */

  var lenis = null;
  if (typeof window.Lenis !== 'undefined' && !reduced) {
    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    lenis = new Lenis({
      duration: 1.15,
      lerp: isSafari ? 0.1 : 0.085,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
      touchMultiplier: 1.6
    });

    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      var loop = function (t) { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }

  function scrollTo(target) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -70, duration: 1.3 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 70, behavior: 'smooth' });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      document.body.classList.remove('menu-open');
      if (lenis) lenis.start();
      scrollTo(el);
    });
  });

  /* ------------------------------------------------------------ reveals */

  var revealables = document.querySelectorAll('[data-reveal]:not([data-intro] [data-reveal]), .mask:not([data-intro] .mask)');

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var delay = parseFloat(el.dataset.delay || 0);
        window.setTimeout(function () { el.classList.add('is-in'); }, delay * 1000);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealables.forEach(function (el) { io.observe(el); });

    /* Stagger groups: children reveal in sequence */
    document.querySelectorAll('[data-stagger]').forEach(function (group) {
      var kids = group.querySelectorAll('[data-reveal]');
      kids.forEach(function (k, i) { k.dataset.delay = (i * 0.075).toFixed(3); });
    });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ------------------------------------------------------------ scroll progress */

  var bar = document.querySelector('[data-progress]');
  if (bar) {
    var barTick = false;
    window.addEventListener('scroll', function () {
      if (barTick) return;
      barTick = true;
      requestAnimationFrame(function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? window.pageYOffset / max : 0) + ')';
        barTick = false;
      });
    }, { passive: true });
  }

  /* ------------------------------------------------------------ nav */

  var nav = document.querySelector('[data-nav]');
  if (nav) {
    var lastY = window.pageYOffset;
    var navTick = false;
    window.addEventListener('scroll', function () {
      if (navTick) return;
      navTick = true;
      requestAnimationFrame(function () {
        var y = window.pageYOffset;
        var down = y > lastY && y > 340;
        if (!document.body.classList.contains('menu-open')) {
          nav.classList.toggle('is-hidden', down);
        }
        lastY = y;
        navTick = false;
      });
    }, { passive: true });
  }

  var toggle = document.querySelector('[data-menu-toggle]');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(open));
      if (lenis) open ? lenis.stop() : lenis.start();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
      document.body.classList.remove('menu-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      if (lenis) lenis.start();
    }
  });

  /* Section indicator in the nav */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav-link]'));
  if (navLinks.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = '#' + en.target.id;
        navLinks.forEach(function (l) {
          l.classList.toggle('is-current', l.getAttribute('href') === id);
        });
      });
    }, { threshold: 0.15, rootMargin: '-25% 0px -55% 0px' });
    navLinks.forEach(function (l) {
      var sec = document.querySelector(l.getAttribute('href'));
      if (sec) spy.observe(sec);
    });
  }

  /* ------------------------------------------------------------ cursor */

  if (fine && !reduced) {
    var dot = document.querySelector('[data-cursor-dot]');
    var ring = document.querySelector('[data-cursor-ring]');
    if (dot && ring) {
      var mx = window.innerWidth / 2, my = window.innerHeight / 2;
      var rx = mx, ry = my;
      document.body.classList.add('cursor-active');

      window.addEventListener('pointermove', function (e) {
        mx = e.clientX; my = e.clientY;
        dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      }, { passive: true });

      (function ringLoop() {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
        requestAnimationFrame(ringLoop);
      })();

      document.querySelectorAll('a, button, [data-hover]').forEach(function (el) {
        el.addEventListener('pointerenter', function () { document.body.classList.add('cursor-hover'); });
        el.addEventListener('pointerleave', function () { document.body.classList.remove('cursor-hover'); });
      });
    }
  }

  /* ------------------------------------------------------------ magnetic buttons */

  if (fine && !reduced) {
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var strength = parseFloat(el.dataset.magnetic) || 0.32;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) * strength;
        var y = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transform = 'translate3d(0,0,0)';
      });
    });
  }

  /* ------------------------------------------------------------ counters */

  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var to = parseFloat(el.dataset.count);
        var dp = (el.dataset.count.split('.')[1] || '').length;
        var start = null;
        function step(ts) {
          if (!start) start = ts;
          var k = Math.min((ts - start) / 1400, 1);
          var eased = 1 - Math.pow(1 - k, 4);
          el.textContent = (to * eased).toFixed(dp);
          if (k < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        cio.unobserve(el);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ------------------------------------------------------------ GSAP scenes */

  if (hasGsap && !reduced) {
    /* Hero copy drifts up and dims as the canvas takes over */
    var introEl = document.querySelector('[data-intro]');
    var heroSection = document.querySelector('[data-hero]');
    if (introEl && heroSection) {
      gsap.to(introEl, {
        y: -90,
        opacity: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: heroSection,
          start: 'top top',
          end: '28% top',
          scrub: 0.6
        }
      });
    }

    var cue = document.querySelector('[data-cue]');
    if (cue && heroSection) {
      gsap.to(cue, {
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: heroSection, start: 'top top', end: '12% top', scrub: true }
      });
    }

    /* Sticky project stack — each card settles back as the next covers it */
    var stackItems = gsap.utils.toArray('[data-stack-item]');
    stackItems.forEach(function (item, i) {
      if (i === stackItems.length - 1) return;
      gsap.to(item.querySelector('.stack__card'), {
        scale: 0.94,
        opacity: 0.45,
        ease: 'none',
        scrollTrigger: {
          trigger: stackItems[i + 1],
          start: 'top bottom',
          end: 'top top+=120',
          scrub: 0.5
        }
      });
    });

    /* Portrait parallax */
    var portraitImg = document.querySelector('[data-parallax]');
    if (portraitImg) {
      gsap.fromTo(portraitImg, { yPercent: -6 }, {
        yPercent: 6,
        ease: 'none',
        scrollTrigger: { trigger: portraitImg.closest('.portrait'), start: 'top bottom', end: 'bottom top', scrub: 0.8 }
      });
    }

    /* Oversized contact wordmark drifts against the scroll */
    var big = document.querySelector('[data-drift]');
    if (big) {
      gsap.fromTo(big, { x: 0 }, {
        x: -60,
        ease: 'none',
        scrollTrigger: { trigger: big, start: 'top bottom', end: 'bottom top', scrub: 1 }
      });
    }

    ScrollTrigger.refresh();
  }

  /* Without GSAP the hero copy would sit on top of the HUD cards, so drive the
     same fade from a plain RAF-throttled scroll handler. */
  if (!hasGsap && !reduced) {
    var fallbackIntro = document.querySelector('[data-intro]');
    var fallbackHero = document.querySelector('[data-hero]');
    if (fallbackIntro && fallbackHero) {
      var fTick = false;
      window.addEventListener('scroll', function () {
        if (fTick) return;
        fTick = true;
        requestAnimationFrame(function () {
          var range = window.innerHeight * 1.2;
          var k = Math.min(Math.max(-fallbackHero.getBoundingClientRect().top / range, 0), 1);
          fallbackIntro.style.opacity = String(1 - k);
          fallbackIntro.style.transform = 'translate3d(0,' + (-90 * k) + 'px,0)';
          fTick = false;
        });
      }, { passive: true });
    }
  }

  /* ------------------------------------------------------------ misc */

  /* Portrait fallback when the photo file is missing */
  document.querySelectorAll('[data-img-fallback]').forEach(function (img) {
    img.addEventListener('error', function () {
      img.style.display = 'none';
      var fb = img.parentElement.querySelector('.portrait__fallback');
      if (fb) fb.style.display = 'grid';
    });
  });

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
