// Log-In-Popup: öffnet pw.html in einem festen Fenster innerhalb der Seite
(function () {
  var dlg = null;

  function close() { if (dlg && dlg.open) dlg.close(); }

  function open() {
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'login-dialog';
      dlg.setAttribute('aria-label', 'Log In');
      dlg.innerHTML = '<button class="close" type="button" aria-label="Schliessen">×</button><iframe title="Log In"></iframe>';
      dlg.querySelector('.close').addEventListener('click', close);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); }); // Klick neben das Fenster
      document.body.appendChild(dlg);
    }
    dlg.querySelector('iframe').src = 'pw.html?embedded=1'; // jedes Mal leeres Formular
    dlg.showModal();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.login');
    if (!a) return;
    e.preventDefault();
    open();
  });

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'login-fail') {
      close();
    } else if (d.type === 'login-ok') {
      try { sessionStorage.setItem('achhh_member', d.name); } catch (err) {}
      location.href = 'eingabe.html';
    }
  });
})();
