/* Branded boot screen: mascot pops in, then "آکادمی سیلانه سبز" is typed. External file because the
   CSP forbids inline scripts. Hidden by main.tsx (window.__bootReady) once React has mounted. */
(function () {
  var el = document.getElementById('boot');
  var txt = document.getElementById('boot-text');
  if (!el || !txt) return;
  var FULL = 'آکادمی سیلانه سبز';
  var seen = false;
  try {
    seen = sessionStorage.getItem('boot-seen') === '1';
    sessionStorage.setItem('boot-seen', '1');
  } catch (e) {}
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fast = seen || reduce || navigator.webdriver;
  var typed = false;
  var ready = false;
  var hidden = false;
  function hide() {
    if (hidden || !typed || !ready) return;
    hidden = true;
    el.classList.add('boot-out');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 600);
  }
  window.__bootReady = function () {
    ready = true;
    hide();
  };
  if (fast) {
    txt.textContent = FULL;
    typed = true;
  } else {
    var i = 0;
    var step = function () {
      i += 1;
      txt.textContent = FULL.slice(0, i);
      if (i < FULL.length) setTimeout(step, 40);
      else {
        typed = true;
        setTimeout(hide, 200);
      }
    };
    setTimeout(step, 250);
  }
  // Never trap the user behind the splash if something goes wrong.
  setTimeout(function () {
    typed = true;
    ready = true;
    hide();
  }, 8000);
})();
