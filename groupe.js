/* Sabali – prévenir tous les clients d'un voyage par WhatsApp (envoi en série).
   Chargé par index.html après remise.js. */
(function () {
  var envoyes = {};   // clé "colisId|etape" -> true
  var tour = 0;       // évite les doublons si les voyages sont redessinés pendant le chargement

  function cle(c) { return c.id + '|' + c.etape; }
  function aPrevenir(v) {
    return colis.filter(function (c) { return c.voyage_id === v.id && c.etape < 6; });
  }
  function compte(liste) {
    var avecTel = liste.filter(function (c) { return c.telephone; });
    var faits = avecTel.filter(function (c) { return envoyes[cle(c)]; });
    return { faits: faits.length, total: avecTel.length };
  }

  async function chargerEnvois() {
    var o = await db.from('messages_envoyes').select('colis_id,etape');
    envoyes = {};
    if (o.error) return false;
    (o.data || []).forEach(function (m) { envoyes[m.colis_id + '|' + m.etape] = true; });
    return true;
  }

  async function marquer(c) {
    envoyes[cle(c)] = true;
    var o = await db.from('messages_envoyes').upsert(
      { colis_id: c.id, etape: c.etape },
      { onConflict: 'colis_id,etape', ignoreDuplicates: true }
    );
    return o.error;
  }

  function texteBouton(v) {
    var n = compte(aPrevenir(v));
    return '📣 Prévenir tous les clients · ' + n.faits + ' / ' + n.total + ' envoyés';
  }

  function ouvrir(v, bouton) {
    var d = document.createElement('dialog');
    d.style.cssText = 'border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);max-width:460px;width:calc(100% - 32px);padding:16px;font-family:inherit';
    d.appendChild(el('strong', '', 'Prévenir les clients · ' + v.nom));
    d.appendChild(el('p', 'small', 'Étape actuelle : ' + VSTEPS[v.etape] + '. Touchez « Envoyer » : WhatsApp s’ouvre avec le message déjà écrit. Validez l’envoi, puis revenez ici pour le client suivant.'));
    var compteur = el('div', 'msg info'), liste = el('div'), er = el('div');
    d.appendChild(compteur); d.appendChild(liste); d.appendChild(er);

    function dessiner() {
      var tous = aPrevenir(v), n = compte(tous);
      compteur.textContent = n.total
        ? (n.faits === n.total ? '✅ Tous les clients ont été prévenus (' + n.total + ' / ' + n.total + ')' : n.faits + ' / ' + n.total + ' clients prévenus')
        : 'Aucun client de ce voyage n’a de numéro WhatsApp.';
      liste.textContent = '';
      var suivantFait = false;
      tous.forEach(function (c) {
        var r = el('div', 'row'), t = el('div');
        t.appendChild(el('div', 'code', c.destinataire || c.code));
        t.appendChild(el('div', 'small', c.code + (c.telephone ? ' · ' + c.telephone : '')));
        r.appendChild(t);
        var a = el('div', 'acts');
        if (!c.telephone) {
          a.appendChild(el('span', 'small', '📵 Pas de numéro'));
        } else {
          var fait = !!envoyes[cle(c)];
          if (fait) a.appendChild(el('span', 'badge', '✅ Envoyé'));
          var w = el('a', '', fait ? 'Renvoyer' : 'Envoyer');
          w.target = '_blank'; w.rel = 'noopener'; w.href = waUrl(c);
          if (!fait && !suivantFait) { w.className = 'next'; suivantFait = true; }
          w.onclick = async function () {
            var e = await marquer(c);
            er.textContent = '';
            if (e) er.appendChild(msg('Envoi non enregistré : ' + e.message));
            dessiner();
            bouton.textContent = texteBouton(v);
          };
          a.appendChild(w);
        }
        r.appendChild(a); liste.appendChild(r);
      });
      var lien = liste.querySelector('a.next');
      if (lien) lien.style.cssText = 'background:var(--ok);border-color:var(--ok);color:#fff;font-weight:600';
    }

    var f = el('button', 'go alt', 'Fermer');
    f.onclick = function () { d.close(); };
    d.appendChild(f);
    d.onclose = function () { d.remove(); bouton.textContent = texteBouton(v); };
    document.body.appendChild(d);
    dessiner();
    d.showModal();
  }

  async function ajouterBoutons(liste) {
    var moi = ++tour;
    var ok = await chargerEnvois();
    if (moi !== tour) return;
    var cartes = document.querySelectorAll('#vlist > .track');
    liste.forEach(function (v, i) {
      var card = cartes[i];
      if (!card || card.querySelector('.groupe') || !aPrevenir(v).length) return;
      var b = el('button', 'go groupe', texteBouton(v));
      b.style.background = 'var(--brand)'; b.style.color = '#fff';
      b.onclick = function () { ouvrir(v, b); };
      if (!ok) {
        b.disabled = true;
        b.textContent = '📣 Prévenir tous les clients (base pas encore prête)';
      }
      var apres = card.querySelector('.go.big') || card.querySelector('.msg') || card.querySelector('.top').nextSibling;
      apres.after(b);
    });
  }

  // ----- Ranger les anciens voyages (ils disparaissent de la liste, le suivi client continue) -----
  var PETIT = 'font:inherit;font-size:.9rem;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:9px;padding:7px 11px;cursor:pointer';

  async function ranger(v, valeur) {
    var o = await db.rpc('archiver_voyage', { p_voyage: v.id, p_archive: valeur });
    var e = $('verr'); e.textContent = '';
    if (o.error) { e.appendChild(msg('Action impossible : ' + o.error.message)); return; }
    load();
  }

  function ajouterRanger(actifs, ranges) {
    var cartes = document.querySelectorAll('#vlist > .track');
    actifs.forEach(function (v, i) {
      var card = cartes[i];
      if (!card || card.querySelector('.ranger')) return;
      var b = el('button', 'ranger', '🗄️ Ranger ce voyage');
      b.style.cssText = PETIT + ';margin-top:12px';
      b.onclick = function () {
        if (!confirm('Ranger le voyage « ' + v.nom + ' » ?\nIl disparaîtra de la liste, mais vos clients pourront toujours suivre leurs colis. Vous pourrez le ressortir en bas de la liste.')) return;
        b.disabled = true; ranger(v, true);
      };
      card.appendChild(b);
    });
    if (!ranges.length) return;
    var d = document.createElement('details');
    d.appendChild(el('summary', '', '🗄️ Voyages rangés (' + ranges.length + ')'));
    ranges.forEach(function (v) {
      var r = el('div', 'row'), t = el('div');
      t.appendChild(el('div', 'code', v.nom));
      t.appendChild(el('div', 'small', 'Départ le ' + fr(v.date_depart) + ' · ' + VSTEPS[v.etape]));
      var b = el('button', '', 'Ressortir'); b.style.cssText = PETIT;
      b.onclick = function () { b.disabled = true; ranger(v, false); };
      r.appendChild(t); r.appendChild(b); d.appendChild(r);
    });
    $('vlist').appendChild(d);
  }

  // ----- Choisir le voyage directement en ajoutant un colis -----
  var lv = el('label', '', 'Voyage (facultatif)'); lv.htmlFor = 'cvoy';
  var sv = document.createElement('select'); sv.id = 'cvoy';
  $('add').before(lv, sv);

  function remplirVoyages(actifs) {
    var choix = sv.value;
    sv.textContent = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— Aucun voyage pour l’instant —';
    sv.appendChild(o0);
    actifs.filter(function (v) { return v.etape < 6; }).forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.id; o.textContent = v.nom + ' · départ le ' + fr(v.date_depart) + ' · ' + VSTEPS[v.etape];
      sv.appendChild(o);
    });
    sv.value = choix;
    if (sv.value !== choix) sv.value = '';
  }

  $('add').onclick = async function () {
    var b = this, e = $('err'); e.textContent = '';
    var f = $('from').value.trim(), t = $('to').value.trim();
    if (!f || !t) { e.appendChild(msg('Indiquez au moins l’expéditeur et le destinataire.')); return; }
    var telok = '';
    if ($('tel').value.trim()) {
      telok = cleanTel($('tel').value.trim());
      if (!telok) { e.appendChild(msg('Numéro invalide. Écrivez-le avec l’indicatif du pays, par exemple +223 70 12 34 56.')); return; }
    }
    var row = {
      expediteur: f, destinataire: t, origine: $('orig').value.trim(), port: $('port').value.trim(),
      ville: $('city').value.trim(), contenu: $('what').value.trim(), kg: parseFloat($('kg').value) || 0,
      prix: parseFloat($('price').value) || 0, route: $('road').value === '1'
    };
    if (telok) row.telephone = '+' + telok;
    b.disabled = true;
    try {
      var o = await db.from('colis').insert(row).select('code').single();
      if (o.error) { e.appendChild(msg('Enregistrement impossible : ' + o.error.message)); return; }
      if (sv.value && o.data && o.data.code) {
        var r = await db.rpc('ajouter_colis_voyage', { p_voyage: sv.value, p_codes: [o.data.code] });
        if (r.error) e.appendChild(msg('Colis ' + o.data.code + ' enregistré, mais pas ajouté au voyage : ' + r.error.message));
        else e.appendChild(msg('Colis ' + o.data.code + ' enregistré et ajouté au voyage.', 'info'));
      } else if (o.data && o.data.code) {
        e.appendChild(msg('Colis ' + o.data.code + ' enregistré.', 'info'));
      }
      ['from', 'to', 'tel', 'what', 'kg', 'price'].forEach(function (i) { $(i).value = ''; });
      load();
    } finally { b.disabled = false; }
  };

  // ----- Mise en page continue : créer un voyage, puis ajouter un colis, puis les listes -----
  (function () {
    var titreColis = $('list').previousElementSibling; // « Vos colis »
    var h = el('h2', '', 'Mes voyages en cours');
    titreColis.before(h, $('verr'), $('vlist'));
  })();

  var _dv = drawVoyages;
  drawVoyages = function () {
    var tous = voyages;
    var actifs = tous.filter(function (v) { return !v.archive; });
    voyages = actifs;
    try { _dv(); } finally { voyages = tous; }
    ajouterRanger(actifs, tous.filter(function (v) { return v.archive; }));
    remplirVoyages(actifs);
    ajouterBoutons(actifs);
  };
  // Si les voyages étaient déjà affichés avant le chargement de ce fichier, on les redessine tout de suite
  if (db && user && voyages.length) drawVoyages();
})();
