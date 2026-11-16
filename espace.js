/* Sabali — nouvelle organisation de l'espace transporteur :
   Accueil (tableau de bord) · Colis · Voyages · Compte, avec une barre en bas. */
(function () {
  var D = document.getElementById('dash');
  if (!D || D.dataset.espace) return;
  D.dataset.espace = '1';

  // Ancienne présentation gardée : on peut y revenir depuis « Compte »
  var ancien = false;
  try { ancien = localStorage.getItem('sabali_ancien') === '1'; } catch (e) {}
  if (ancien) {
    var bn = document.createElement('button');
    bn.className = 'go alt'; bn.textContent = '✨ Passer à la nouvelle présentation';
    bn.onclick = function () { try { localStorage.removeItem('sabali_ancien'); } catch (e) {} location.reload(); };
    D.prepend(bn);
    return;
  }

  function L(f, e) { return document.documentElement.lang === 'en' ? e : f; }
  function euros(n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; }
  function nbp(c) { return Math.max(parseInt(c && c.pieces, 10) || 1, 1); }

  var css = document.createElement('style');
  css.textContent =
    '#dash .vue[hidden]{display:none!important}' +
    '#dash .tete{background:#0f3d2e;color:#fff;border-radius:18px;padding:16px;border-bottom:4px solid #e3a82b;margin-bottom:14px}' +
    '#dash .tete .bj{font-size:1.15rem;font-weight:700}' +
    '#dash .tete .chiffres{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}' +
    '#dash .tete .chiffres div{background:rgba(255,255,255,.1);border-radius:12px;padding:10px 12px}' +
    '#dash .tete .chiffres span{display:block;font-size:.8rem;color:#cfe3d6}#dash .tete .chiffres b{font-size:1.5rem}' +
    '#dash .tete .chiffres .or{color:#e3a82b}' +
    '#dash .gros{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px}' +
    '#dash .gros button{border:0;border-radius:16px;padding:16px 8px;font:inherit;font-weight:700;font-size:1rem;cursor:pointer}' +
    '#dash .gros button i{display:block;font-style:normal;font-size:1.6rem;line-height:1.2}' +
    '#dash .gros .b1{background:#e3a82b;color:#2b1d00}#dash .gros .b2{background:#1a7f4b;color:#fff}' +
    '#dash .rubrique{font-size:.82rem;color:var(--mute);font-weight:700;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em}' +
    '#dash .carte{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px}' +
    '#dash .carte .h{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700}' +
    '#dash .prog{display:flex;gap:4px;margin:10px 0 6px}#dash .prog span{flex:1;height:6px;border-radius:4px;background:var(--line)}#dash .prog span.on{background:#1a7f4b}' +
    '#dash .duo{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}' +
    '#dash .duo button{font:inherit;font-size:.95rem;font-weight:600;border-radius:12px;padding:10px;cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--ink)}' +
    '#dash .duo button.f{background:#0f3d2e;color:#fff;border-color:#0f3d2e}' +
    '#dash .afaire{padding:0;overflow:hidden}#dash .afaire button{display:flex;width:100%;justify-content:space-between;align-items:center;gap:10px;font:inherit;text-align:left;padding:13px 14px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}' +
    '#dash .afaire button:last-child{border-bottom:0}#dash .afaire b{min-width:1.6em;display:inline-block}#dash .afaire .ok{color:var(--mute)}' +
    '#dash .lien{background:none;border:0;color:#1a7f4b;font:inherit;font-weight:700;padding:8px 0;cursor:pointer}' +
    '#dash .barre-outils{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 10px}' +
    '#dash .barre-outils button{margin:0}' +
    '#dash .puces{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}' +
    '#dash .puces button{font:inherit;font-size:.88rem;border-radius:99px;padding:6px 12px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}' +
    '#dash .puces button.on{background:#0f3d2e;border-color:#0f3d2e;color:#fff}' +
    '#dash .panneau{border:2px solid #e3a82b;border-radius:16px;padding:4px 14px 14px;margin-bottom:12px}' +
    '#dash .masque-filtre{display:none!important}' +
    '#nav-espace{position:fixed;left:0;right:0;bottom:0;z-index:50;display:grid;grid-template-columns:repeat(4,1fr);background:var(--card);border-top:1px solid var(--line);padding:6px 0 calc(8px + env(safe-area-inset-bottom))}' +
    '#nav-espace[hidden]{display:none}' +
    '#nav-espace button{background:none;border:0;font:inherit;font-size:.75rem;color:var(--mute);cursor:pointer;padding:4px 0}' +
    '#nav-espace button i{display:block;font-style:normal;font-size:1.35rem;line-height:1.3}' +
    '#nav-espace button.on{color:#1a7f4b;font-weight:700}' +
    'body.avec-nav{padding-bottom:76px}';
  document.head.appendChild(css);

  // ----- Les quatre écrans -----
  var V = {};
  ['accueil', 'colis', 'voyages', 'compte'].forEach(function (n) {
    var d = el('div', 'vue'); d.id = 'vue-' + n; V[n] = d;
  });

  // Répartition des éléments existants
  var kids = Array.prototype.slice.call(D.children), seau = V.compte;
  var panneau = el('div', 'panneau'); panneau.hidden = true;
  var creerVoy = document.createElement('details');
  creerVoy.appendChild(el('summary', '', L('➕ Créer un nouveau voyage', '➕ Create a new trip')));
  var boutonScan = null;
  kids.forEach(function (k) {
    var t = (k.textContent || '').trim();
    if (k.tagName === 'H2' && t === 'Mes voyages') { seau = creerVoy; k.remove(); return; }
    if (k.tagName === 'H2' && t === 'Ajouter un colis') { seau = panneau; k.textContent = L('Nouveau colis', 'New parcel'); }
    if (k.tagName === 'H2' && /voyages en cours/.test(t)) { seau = V.voyages; }
    if (k.tagName === 'H2' && t === 'Vos colis') { seau = V.colis; }
    if (k.tagName === 'BUTTON' && /Scanner/.test(t)) { boutonScan = k; return; }
    if (seau === V.compte && (k.classList.contains('whoami') || k.classList.contains('stat') || k.tagName === 'DETAILS')) { V.compte.appendChild(k); return; }
    seau.appendChild(k);
  });
  // Voyages : formulaire de création repliable au-dessus de la liste
  var h2v = V.voyages.querySelector('h2');
  if (h2v) { h2v.textContent = L('Mes voyages', 'My trips'); h2v.after(creerVoy); } else V.voyages.prepend(creerVoy);
  var vadd = $('vadd');
  if (vadd) vadd.addEventListener('click', function () { setTimeout(function () { creerVoy.open = false; }, 800); });

  // Colis : boutons « Nouveau colis » + « Scanner », filtres, formulaire repliable
  var h2c = V.colis.querySelector('h2');
  if (h2c) h2c.textContent = L('Mes colis', 'My parcels');
  var outils = el('div', 'barre-outils');
  var bNouveau = el('button', 'go', L('➕ Nouveau colis', '➕ New parcel'));
  bNouveau.onclick = function () { ouvrirFormulaire(); };
  outils.appendChild(bNouveau);
  if (boutonScan) { boutonScan.textContent = L('📷 Scanner', '📷 Scan'); boutonScan.classList.add('alt'); outils.appendChild(boutonScan); }
  var fermer = el('button', 'go alt', L('Fermer', 'Close'));
  fermer.onclick = function () { panneau.hidden = true; };
  panneau.appendChild(fermer);
  var puces = el('div', 'puces'), filtre = 'tous';
  [['tous', L('Tous', 'All')], ['remettre', L('À remettre', 'To hand over')], ['payer', L('Reste à payer', 'Unpaid')], ['remis', L('Remis', 'Handed over')]].forEach(function (p) {
    var b = el('button', p[0] === 'tous' ? 'on' : '', p[1]);
    b.dataset.f = p[0];
    b.onclick = function () { choisirFiltre(p[0]); };
    puces.appendChild(b);
  });
  if (h2c) { h2c.after(outils); outils.after(panneau); panneau.after(puces); }
  else { V.colis.prepend(puces); V.colis.prepend(panneau); V.colis.prepend(outils); }

  function ouvrirFormulaire() {
    montrer('colis');
    panneau.hidden = false;
    panneau.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { var f = $('from'); if (f) f.focus(); }, 350);
  }

  // Compte
  var h2k = el('h2', '', L('Mon compte', 'My account'));
  V.compte.prepend(h2k);
  var guide = el('a', 'go alt', L('📘 Lire le guide transporteur', '📘 Read the carrier guide'));
  guide.href = 'guide-sabali.pdf'; guide.target = '_blank'; guide.rel = 'noopener';
  guide.style.cssText = 'display:block;text-align:center;text-decoration:none;margin-top:14px';
  V.compte.appendChild(guide);
  var bAnc = el('button', 'go alt', L('↩️ Revenir à l’ancienne présentation', '↩️ Back to the old layout'));
  bAnc.onclick = function () { try { localStorage.setItem('sabali_ancien', '1'); sessionStorage.removeItem('sabali_vue'); } catch (e) {} location.reload(); };
  V.compte.appendChild(bAnc);

  [V.accueil, V.colis, V.voyages, V.compte].forEach(function (v) { D.appendChild(v); });

  // ----- Écran d'accueil -----
  function colisDe(v) { return colis.filter(function (c) { return c.voyage_id === v.id; }); }
  function estRemis(c) { var S = stepsFor(c); return c.etape >= S.length - 1; }
  function aRemettre(c) { var S = stepsFor(c); return c.etape === S.length - 2; }
  function reste(c) { return Math.max((Number(c.prix) || 0) - (Number(c.paye) || 0), 0); }
  function prevenus(v) {
    var cartes = document.querySelectorAll('#vlist > .track'), r = null;
    Array.prototype.forEach.call(cartes, function (card) {
      var n = card.querySelector('.top .code');
      if (!n || n.textContent !== v.nom) return;
      var g = card.querySelector('.groupe');
      var m = g && g.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (m) r = { faits: +m[1], total: +m[2], bouton: g, carte: card };
      else r = { faits: 0, total: 0, bouton: null, carte: card };
    });
    return r;
  }

  function majAccueil() {
    var A = V.accueil; A.textContent = '';
    var m = (user && user.user_metadata) || {};
    var enRoute = colis.filter(function (c) { return !estRemis(c); });
    var du = colis.reduce(function (s, c) { return s + reste(c); }, 0);

    var t = el('div', 'tete');
    t.appendChild(el('div', 'bj', L('Bonjour ', 'Hello ') + (m.nom || '') + ' 👋🏾'));
    var ch = el('div', 'chiffres');
    ch.innerHTML = '<div><span>' + L('Colis en route', 'Parcels on the way') + '</span><b>' + enRoute.length + '</b></div>' +
      '<div><span>' + L('Reste à encaisser', 'Still to collect') + '</span><b class="or">' + euros(du) + '</b></div>';
    t.appendChild(ch); A.appendChild(t);

    var g = el('div', 'gros');
    var b1 = el('button', 'b1'); b1.innerHTML = '<i>➕</i>' + L('Nouveau colis', 'New parcel');
    b1.onclick = ouvrirFormulaire;
    var b2 = el('button', 'b2'); b2.innerHTML = '<i>📷</i>' + L('Scanner', 'Scan');
    b2.onclick = function () { if (boutonScan) boutonScan.click(); };
    g.appendChild(b1); g.appendChild(b2); A.appendChild(g);

    // Voyage en cours
    var actifs = voyages.filter(function (v) { return !v.archive; });
    A.appendChild(el('div', 'rubrique', actifs.length > 1 ? L('Voyages en cours', 'Current trips') : L('Voyage en cours', 'Current trip')));
    if (!actifs.length) {
      var c0 = el('div', 'carte');
      c0.appendChild(el('div', 'small', L('Aucun voyage en cours. Créez un voyage pour faire avancer tous vos colis d’un seul clic.', 'No trip yet. Create one to move all your parcels forward in one tap.')));
      var bc = el('button', 'lien', L('➕ Créer un voyage', '➕ Create a trip'));
      bc.onclick = function () { montrer('voyages'); creerVoy.open = true; };
      c0.appendChild(bc); A.appendChild(c0);
    }
    actifs.slice(0, 2).forEach(function (v) {
      var mine = colisDe(v), pcs = mine.reduce(function (s, c) { return s + nbp(c); }, 0), p = prevenus(v);
      var c = el('div', 'carte'); c.style.marginBottom = '8px';
      var h = el('div', 'h'); h.appendChild(el('span', '', v.nom)); h.appendChild(el('span', 'badge', VSTEPS[v.etape]));
      c.appendChild(h);
      var pr = el('div', 'prog');
      for (var i = 0; i < 6; i++) { var s = el('span', i <= v.etape ? 'on' : ''); pr.appendChild(s); }
      c.appendChild(pr);
      c.appendChild(el('div', 'small', mine.length + ' colis' + (pcs > mine.length ? ' · ' + pcs + ' pièces' : '') +
        (p && p.total ? ' · ' + p.faits + ' / ' + p.total + L(' prévenus', ' notified') : '')));
      var duo = el('div', 'duo');
      var be = el('button', 'f', v.etape < 5 ? L('Étape suivante', 'Next step') : L('Voir le voyage', 'Open trip'));
      be.onclick = function () { voirVoyage(v); };
      var bp = el('button', '', L('📣 Prévenir', '📣 Notify'));
      bp.onclick = function () { var q = prevenus(v); if (q && q.bouton) q.bouton.click(); else voirVoyage(v); };
      duo.appendChild(be); duo.appendChild(bp); c.appendChild(duo);
      A.appendChild(c);
    });
    if (actifs.length > 2) {
      var bt = el('button', 'lien', L('Voir les ' + actifs.length + ' voyages →', 'See all ' + actifs.length + ' trips →'));
      bt.onclick = function () { montrer('voyages'); };
      A.appendChild(bt);
    }

    // À faire
    var nRem = colis.filter(aRemettre).length;
    var nPay = colis.filter(function (c) { return reste(c) > 0; }).length;
    var nPrev = actifs.reduce(function (s, v) { var q = prevenus(v); return s + (q ? Math.max(q.total - q.faits, 0) : 0); }, 0);
    A.appendChild(el('div', 'rubrique', L('À faire', 'To do')));
    var af = el('div', 'carte afaire');
    [[nRem, '📦', L('colis à remettre', 'parcels to hand over'), function () { montrer('colis'); choisirFiltre('remettre'); }],
     [nPay, '💶', L('clients n’ont pas tout payé', 'customers still owe money'), function () { montrer('colis'); choisirFiltre('payer'); }],
     [nPrev, '💬', L('clients à prévenir', 'customers to notify'), function () { montrer('voyages'); }]
    ].forEach(function (x) {
      var b = el('button', x[0] ? '' : 'ok');
      b.innerHTML = '<span>' + x[1] + ' <b>' + x[0] + '</b> ' + x[2] + '</span><span>' + (x[0] ? '›' : '✓') + '</span>';
      b.onclick = x[3]; af.appendChild(b);
    });
    A.appendChild(af);

    if (!colis.length && window.bulleMascotte) {
      A.appendChild(window.bulleMascotte('bakary', 'Bakary', L('Bienvenue ! Commencez par créer un voyage, puis ajoutez vos colis. Je vous guide.', 'Welcome! Start by creating a trip, then add your parcels. I will guide you.')));
    }
  }

  function voirVoyage(v) {
    montrer('voyages');
    var q = prevenus(v);
    if (q && q.carte) {
      setTimeout(function () {
        q.carte.scrollIntoView({ behavior: 'smooth', block: 'start' });
        q.carte.style.transition = 'box-shadow .3s'; q.carte.style.boxShadow = '0 0 0 3px #e3a82b';
        setTimeout(function () { q.carte.style.boxShadow = ''; }, 1600);
      }, 60);
    }
  }

  // ----- Filtres de la liste des colis -----
  function choisirFiltre(f) {
    filtre = f;
    Array.prototype.forEach.call(puces.children, function (b) { b.classList.toggle('on', b.dataset.f === f); });
    appliquerFiltre();
  }
  function appliquerFiltre() {
    var par = {}; colis.forEach(function (c) { par[c.code] = c; });
    Array.prototype.forEach.call(document.querySelectorAll('#list > .track'), function (card) {
      var k = card.querySelector('.code'), c = k && par[k.textContent];
      var ok = true;
      if (c && filtre === 'remettre') ok = aRemettre(c);
      if (c && filtre === 'payer') ok = reste(c) > 0;
      if (c && filtre === 'remis') ok = estRemis(c);
      card.classList.toggle('masque-filtre', !ok);
    });
  }

  // ----- Navigation -----
  var nav = document.createElement('nav'); nav.id = 'nav-espace'; nav.hidden = true;
  var ONG = [['accueil', '🏠', L('Accueil', 'Home')], ['colis', '📦', L('Colis', 'Parcels')], ['voyages', '🚢', L('Voyages', 'Trips')], ['compte', '⚙️', L('Compte', 'Account')]];
  ONG.forEach(function (o) {
    var b = el('button'); b.dataset.v = o[0];
    b.innerHTML = '<i>' + o[1] + '</i>' + o[2];
    b.onclick = function () { montrer(o[0]); };
    nav.appendChild(b);
  });
  document.body.appendChild(nav);

  var courant = 'accueil';
  try { courant = sessionStorage.getItem('sabali_vue') || 'accueil'; } catch (e) {}
  function montrer(n) {
    if (!V[n]) n = 'accueil';
    courant = n;
    try { sessionStorage.setItem('sabali_vue', n); } catch (e) {}
    Object.keys(V).forEach(function (k) { V[k].hidden = k !== n; });
    Array.prototype.forEach.call(nav.children, function (b) { b.classList.toggle('on', b.dataset.v === n); });
    if (n === 'accueil') majAccueil();
    window.scrollTo(0, Math.max(0, D.getBoundingClientRect().top + window.scrollY - 12));
  }
  window.sabaliMontrer = montrer;

  function majNav() {
    var vis = !$('v2').hidden && !D.hidden;
    nav.hidden = !vis;
    document.body.classList.toggle('avec-nav', vis);
  }
  new MutationObserver(majNav).observe($('v2'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(majNav).observe(D, { attributes: true, attributeFilter: ['hidden'] });
  majNav();

  // Le scanner ouvre la fiche dans l'onglet « Suivre » : la barre se cache toute seule.

  // ----- Mise à jour quand les données changent -----
  var _d = draw;
  draw = function () { _d.apply(this, arguments); appliquerFiltre(); if (courant === 'accueil') majAccueil(); };
  var _dv2 = drawVoyages;
  drawVoyages = function () {
    _dv2.apply(this, arguments);
    if (courant === 'accueil') setTimeout(majAccueil, 400);
  };
  new MutationObserver(function () { appliquerFiltre(); }).observe($('list'), { childList: true });

  // Après l'ajout d'un colis : on referme le formulaire si tout s'est bien passé
  var add = $('add');
  if (add) add.addEventListener('click', function () {
    setTimeout(function () { if (!$('from').value && !$('err').textContent.trim()) panneau.hidden = true; }, 1500);
  });

  montrer(courant);
})();
