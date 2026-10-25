// Album viewer: click a thumbnail to see the full-size photo; arrows / swipe to browse, Esc to close.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.album-photo'));
  if (!links.length) return;
  var dlg = document.createElement('dialog');
  dlg.className = 'viewer';
  dlg.innerHTML = '<img alt=""><button class="v-close" aria-label="Close">×</button>' +
    '<button class="v-prev" aria-label="Previous photo">‹</button>' +
    '<button class="v-next" aria-label="Next photo">›</button><div class="v-count"></div>';
  document.body.appendChild(dlg);
  var img = dlg.querySelector('img'), count = dlg.querySelector('.v-count'), cur = 0;

  function show(i) {
    cur = (i + links.length) % links.length;
    img.src = links[cur].href;
    img.alt = links[cur].querySelector('img').alt;
    count.textContent = (cur + 1) + ' / ' + links.length;
  }
  links.forEach(function (a, i) {
    a.addEventListener('click', function (e) {
      if (!dlg.showModal) return; // very old browser: just open the photo
      e.preventDefault(); show(i); dlg.showModal();
    });
  });
  dlg.querySelector('.v-close').onclick = function () { dlg.close(); };
  dlg.querySelector('.v-prev').onclick = function () { show(cur - 1); };
  dlg.querySelector('.v-next').onclick = function () { show(cur + 1); };
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', function (e) {
    if (!dlg.open) return;
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });
  var x0 = null;
  dlg.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1));
  });
})();
