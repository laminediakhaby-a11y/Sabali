/* Sabali – prévenir tous les clients d'un voyage par WhatsApp (envoi en série).
   Chargé par index.html après remise.js. */
(function () {
  var envoyes = {};   // clé "colisId|etape" -> true
  var tour = 0;       // évite les doublons si les voyages sont redessinés pendant le chargement

  // Trajet par la route après le port (Mali, Burkina, Niger…) : 0 = pas parti, 1 = en route, 2 = arrivé
  function etatRoute(c) {
    var e = 0;
    (c.evenements || []).forEach(function (x) {
      if (x.type !== 'passage' || !x.lieu) return;
      if (x.lieu.indexOf('Arrivé à ') === 0) e = 2;
      else if (x.lieu.indexOf('En route vers ') === 0 && e < 1) e = 1;
    });
    return e;
  }
  window.etatRoute = etatRoute;
  function etapeMsg(c) { return (c.voyage_id && c.route && c.etape === 5) ? 50 + etatRoute(c) : c.etape; }
  function cle(c) { return c.id + '|' + etapeMsg(c); }
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
      { colis_id: c.id, etape: etapeMsg(c) },
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
      var lb = el('button', 'liste', '📋 Liste de colisage');
      lb.style.cssText = PETIT + ';margin:12px 0 0 8px';
      lb.onclick = function () { ouvrirListe(v); };
      card.appendChild(lb);
      var rc = colis.filter(function (c) { return c.voyage_id === v.id && c.route && c.etape === 5; });
      if (v.etape === 5 && rc.length) {
        var e0 = rc.filter(function (c) { return etatRoute(c) === 0; });
        var e1 = rc.filter(function (c) { return etatRoute(c) === 1; });
        var villes = [];
        rc.forEach(function (c) { var w = c.ville || 'la destination'; if (villes.indexOf(w) < 0) villes.push(w); });
        var box = el('div'); box.style.cssText = 'margin-top:12px;padding:12px;border:2px dashed var(--gold);border-radius:12px';
        box.appendChild(el('strong', '', '🚚 Suite par la route'));
        box.appendChild(el('div', 'small', rc.length + ' colis continuent vers ' + villes.join(', ') + '.'));
        var go = async function (liste, debut, suite) {
          var rows = liste.map(function (c) { return { colis_id: c.id, type: 'passage', etape: 5, lieu: debut + (c.ville || 'la destination') + suite }; });
          var o = await db.from('evenements').insert(rows);
          var e = $('verr'); e.textContent = '';
          if (o.error) { e.appendChild(msg('Action impossible : ' + o.error.message)); return; }
          load();
        };
        if (e0.length) {
          var b1 = el('button', 'go', '🚚 Le camion est parti (' + e0.length + ' colis)');
          b1.onclick = function () { b1.disabled = true; go(e0, 'En route vers ', ''); };
          box.appendChild(b1);
        }
        if (e1.length) {
          var b2 = el('button', 'go', '📍 Arrivé à destination (' + e1.length + ' colis)');
          b2.style.background = 'var(--ok)'; b2.style.color = '#fff';
          b2.onclick = function () { b2.disabled = true; go(e1, 'Arrivé à ', ', prêt au retrait'); };
          box.appendChild(b2);
        }
        if (!e0.length && !e1.length) box.appendChild(el('div', 'small', '✅ Tous ces colis sont arrivés à destination.'));
        box.appendChild(el('div', 'small', 'Pensez ensuite à « 📣 Prévenir tous les clients ».'));
        var ap = card.querySelector('.groupe') || card.querySelector('.msg');
        if (ap) ap.after(box); else card.appendChild(box);
      }
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
    var npc = parseInt(($('pcs') || {}).value, 10) || 1;
    if (npc < 1) npc = 1; if (npc > 99) npc = 99;
    if (npc > 1) row.pieces = npc;
    if (telok) row.telephone = '+' + telok;
    b.disabled = true;
    try {
      var o = await db.from('colis').insert(row).select('code').single();
      if (o.error && row.pieces && /pieces/.test(o.error.message)) {
        e.appendChild(msg('Le nombre de pièces n’est pas encore activé : lancez d’abord le fichier sabali-pieces.sql dans Supabase.'));
        return;
      }
      if (o.error) { e.appendChild(msg('Enregistrement impossible : ' + o.error.message)); return; }
      if (sv.value && o.data && o.data.code) {
        var r = await db.rpc('ajouter_colis_voyage', { p_voyage: sv.value, p_codes: [o.data.code] });
        if (r.error) e.appendChild(msg('Colis ' + o.data.code + ' enregistré, mais pas ajouté au voyage : ' + r.error.message));
        else e.appendChild(msg('Colis ' + o.data.code + ' enregistré et ajouté au voyage.', 'info'));
      } else if (o.data && o.data.code) {
        e.appendChild(msg('Colis ' + o.data.code + ' enregistré.', 'info'));
      }
      ['from', 'to', 'tel', 'what', 'kg', 'price'].forEach(function (i) { $(i).value = ''; });
      if ($('pcs')) $('pcs').value = '1';
      load();
    } finally { b.disabled = false; }
  };

  // ----- Mise en page continue : créer un voyage, puis ajouter un colis, puis les listes -----
  (function () {
    var titreColis = $('list').previousElementSibling; // « Vos colis »
    var h = el('h2', '', 'Mes voyages en cours');
    titreColis.before(h, $('verr'), $('vlist'));
  })();

  // ----- Supprimer mon compte (obligatoire pour l'App Store) -----
  (function () {
    var det = $('savemsg').closest('details');
    det.querySelector('summary').textContent = 'Mon profil et mon compte : logo, adresse, contact';
    var zone = el('div');
    zone.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px solid var(--line)';
    zone.appendChild(el('strong', '', 'Supprimer mon compte'));
    zone.appendChild(el('p', 'small', 'Supprime définitivement votre compte et toutes vos données : colis, voyages, preuves de remise, logo. Vos clients ne pourront plus suivre leurs colis.'));
    var b = el('button', 'go alt', 'Supprimer mon compte');
    b.style.cssText = 'color:var(--bad);border-color:var(--bad)';
    b.onclick = confirmer;
    zone.appendChild(b);
    det.appendChild(zone);

    function confirmer() {
      var d = document.createElement('dialog');
      d.style.cssText = 'border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);max-width:420px;width:calc(100% - 32px);padding:16px;font-family:inherit';
      d.appendChild(el('strong', '', 'Supprimer définitivement votre compte ?'));
      d.appendChild(el('p', 'small', 'Cette action est irréversible. Tous vos colis, voyages, preuves de remise et votre logo seront effacés, et vos clients ne pourront plus suivre leurs colis.'));
      var l = el('label', '', 'Pour confirmer, écrivez SUPPRIMER'); l.htmlFor = 'del-ok';
      var i = document.createElement('input'); i.id = 'del-ok'; i.autocomplete = 'off'; i.setAttribute('autocapitalize', 'characters');
      var er = el('div');
      var go = el('button', 'go', 'Supprimer définitivement');
      go.style.cssText = 'background:var(--bad);color:#fff';
      var an = el('button', 'go alt', 'Annuler');
      an.onclick = function () { d.close(); };
      go.onclick = async function () {
        er.textContent = '';
        if (i.value.trim().toUpperCase() !== 'SUPPRIMER') { er.appendChild(msg('Écrivez SUPPRIMER pour confirmer.')); return; }
        go.disabled = true; an.disabled = true; go.textContent = 'Suppression en cours…';
        var id = user.id;
        try {
          var lp = await db.storage.from('preuves').list(id, { limit: 1000 });
          if (lp.data && lp.data.length) await db.storage.from('preuves').remove(lp.data.map(function (f) { return id + '/' + f.name; }));
          await db.storage.from('logos').remove([id + '/logo.png']);
        } catch (x) {}
        var o = await db.rpc('supprimer_mon_compte');
        if (o.error) {
          er.appendChild(msg('Suppression impossible : ' + o.error.message));
          go.disabled = false; an.disabled = false; go.textContent = 'Supprimer définitivement';
          return;
        }
        d.close();
        try { await db.auth.signOut(); } catch (x) {}
        try { localStorage.removeItem('sb-' + new URL(SUPABASE_URL).hostname.split('.')[0] + '-auth-token'); } catch (x) {}
        user = null; show();
        authMsg('Votre compte et toutes vos données ont été supprimés.', true);
      };
      [l, i, er, go, an].forEach(function (x) { d.appendChild(x); });
      d.onclose = function () { d.remove(); };
      document.body.appendChild(d);
      d.showModal();
    }
  })();

  // ----- Hors connexion : message clair + ouverture du site sans internet -----
  (function () {
    if ('serviceWorker' in navigator) {
      try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (x) {}
    }
    var bandeau = el('div', 'msg', '📡 Pas de connexion internet. Vos colis et voyages s’afficheront dès que le réseau reviendra.');
    bandeau.setAttribute('role', 'status');
    bandeau.style.marginTop = '0'; bandeau.style.marginBottom = '12px';
    var panel = document.querySelector('.panel');
    panel.insertBefore(bandeau, panel.firstChild);
    function maj() {
      bandeau.hidden = navigator.onLine;
      if (!navigator.onLine) {
        bandeau.textContent = (typeof lang !== 'undefined' && lang === 'en')
          ? '📡 No internet connection. Your parcels will appear as soon as the network is back.'
          : '📡 Pas de connexion internet. Vos colis et voyages s’afficheront dès que le réseau reviendra.';
      }
    }
    window.addEventListener('offline', maj);
    window.addEventListener('online', function () {
      maj();
      if (user) load();
      if ($('q').value.trim() && $('res').firstChild) find();
    });
    maj();

    var _load = load;
    load = function () {
      if (!navigator.onLine) { maj(); return Promise.resolve(); }
      return _load.apply(this, arguments);
    };
    var _find = find;
    find = function () {
      if (!navigator.onLine) { maj(); $('res').textContent = ''; return Promise.resolve(); }
      return _find.apply(this, arguments);
    };
    $('find').onclick = function () { find(); };
    $('q').onkeydown = function (e) { if (e.key === 'Enter') find(); };
  })();

  // ----- Mot de passe oublié -----
  (function () {
    var lien = el('button', '', 'Mot de passe oublié ?');
    lien.style.cssText = 'display:block;margin:12px auto 0;font:inherit;font-size:.95rem;color:var(--ink);background:none;border:0;text-decoration:underline;cursor:pointer';
    $('signup').after(lien);
    lien.onclick = async function () {
      var mail = $('email').value.trim();
      if (!mail) { authMsg('Écrivez votre e-mail dans la case « E-mail », puis touchez « Mot de passe oublié ? ».'); $('email').focus(); return; }
      lien.disabled = true;
      var o = await db.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + '/?reset=1' });
      lien.disabled = false;
      if (o.error) { authMsg('Envoi impossible : ' + o.error.message); return; }
      authMsg('Si un compte existe avec cet e-mail, vous allez recevoir un lien pour choisir un nouveau mot de passe. Pensez à regarder dans les spams.', true);
    };

    function nouveauMotDePasse() {
      var d = document.createElement('dialog');
      d.style.cssText = 'border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);max-width:420px;width:calc(100% - 32px);padding:16px;font-family:inherit';
      d.appendChild(el('strong', '', 'Choisissez un nouveau mot de passe'));
      var l1 = el('label', '', 'Nouveau mot de passe (8 caractères minimum)'); l1.htmlFor = 'np1';
      var i1 = document.createElement('input'); i1.type = 'password'; i1.id = 'np1'; i1.autocomplete = 'new-password';
      var l2 = el('label', '', 'Confirmez le mot de passe'); l2.htmlFor = 'np2';
      var i2 = document.createElement('input'); i2.type = 'password'; i2.id = 'np2'; i2.autocomplete = 'new-password';
      var er = el('div'), ok = el('button', 'go', 'Enregistrer le mot de passe');
      ok.onclick = async function () {
        er.textContent = '';
        if (i1.value.length < 8) { er.appendChild(msg('Le mot de passe doit avoir au moins 8 caractères.')); return; }
        if (i1.value !== i2.value) { er.appendChild(msg('Les deux mots de passe ne sont pas identiques.')); return; }
        ok.disabled = true;
        var o = await db.auth.updateUser({ password: i1.value });
        ok.disabled = false;
        if (o.error) { er.appendChild(msg('Changement impossible : ' + o.error.message)); return; }
        try { history.replaceState(null, '', location.pathname); } catch (x) {}
        d.close();
        tab(2);
        var m = $('merr'); m.textContent = '';
        alerteOk('Votre mot de passe a été changé. Vous êtes connecté.');
      };
      [l1, i1, l2, i2, er, ok].forEach(function (x) { d.appendChild(x); });
      d.onclose = function () { d.remove(); };
      document.body.appendChild(d);
      d.showModal();
    }
    function alerteOk(t) {
      var z = msg(t, 'info'); z.style.marginBottom = '12px';
      var panel = document.querySelector('.panel');
      panel.insertBefore(z, panel.querySelector('.tabs').nextSibling);
      setTimeout(function () { z.remove(); }, 8000);
    }

    var demande = new URLSearchParams(location.search).get('reset') === '1' || /type=recovery/.test(location.hash);
    var ouvert = false;
    function ouvrir() { if (ouvert) return; ouvert = true; nouveauMotDePasse(); }
    db.auth.onAuthStateChange(function (ev, s) {
      if (ev === 'PASSWORD_RECOVERY' || (demande && s)) setTimeout(ouvrir, 0);
    });
    if (demande) {
      db.auth.getSession().then(function (r) {
        if (r.data && r.data.session) ouvrir();
        else setTimeout(function () {
          db.auth.getSession().then(function (r2) {
            if (r2.data && r2.data.session) ouvrir();
            else { tab(2); authMsg('Ce lien n’est plus valable. Touchez « Mot de passe oublié ? » pour en recevoir un nouveau.'); }
          });
        }, 1500);
      });
    }
  })();

  // ----- Scanner de QR code intégré (étiquettes Sabali) -----
  (function () {
    function chargerJsQR() {
      return new Promise(function (ok, ko) {
        if (window.jsQR) return ok();
        var sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        sc.onload = ok;
        sc.onerror = function () { ko(new Error('Impossible de charger le scanner. Vérifiez votre connexion.')); };
        document.head.appendChild(sc);
      });
    }
    function extraireCode(t) {
      try { var c = new URL(t).searchParams.get('code'); if (c) return c.trim().toUpperCase(); } catch (x) {}
      var m = String(t).toUpperCase().match(/SB-[A-Z0-9]{4,}/);
      return m ? m[0] : null;
    }

    function scanner() {
      var d = document.createElement('dialog');
      d.style.cssText = 'border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);max-width:460px;width:calc(100% - 24px);padding:14px;font-family:inherit';
      d.appendChild(el('strong', '', 'Scanner une étiquette Sabali'));
      d.appendChild(el('p', 'small', 'Placez le QR code de l’étiquette dans le cadre.'));
      var cadre = el('div');
      cadre.style.cssText = 'position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:1/1';
      var v = document.createElement('video');
      v.setAttribute('playsinline', ''); v.muted = true; v.autoplay = true;
      v.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      var viseur = el('div');
      viseur.style.cssText = 'position:absolute;inset:18%;border:3px solid var(--gold);border-radius:14px;box-shadow:0 0 0 999px rgba(0,0,0,.35)';
      cadre.appendChild(v); cadre.appendChild(viseur);
      var er = el('div'), f = el('button', 'go alt', 'Fermer');
      [cadre, er, f].forEach(function (x) { d.appendChild(x); });
      var flux = null, fini = false, c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
      function arreter() { fini = true; if (flux) flux.getTracks().forEach(function (t) { t.stop(); }); }
      f.onclick = function () { d.close(); };
      d.onclose = function () { arreter(); d.remove(); };
      document.body.appendChild(d);
      d.showModal();

      function boucle() {
        if (fini) return;
        if (v.readyState >= 2 && v.videoWidth) {
          var k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
          c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
          ctx.drawImage(v, 0, 0, c.width, c.height);
          var img = ctx.getImageData(0, 0, c.width, c.height);
          var r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (r && r.data) {
            var code = extraireCode(r.data);
            if (code) {
              if (navigator.vibrate) try { navigator.vibrate(80); } catch (x) {}
              d.close();
              tab(1); $('q').value = code; find();
              setTimeout(function () { $('res').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 400);
              return;
            }
            er.textContent = ''; er.appendChild(msg('Ce QR code n’est pas une étiquette Sabali.'));
          }
        }
        requestAnimationFrame(boucle);
      }

      chargerJsQR().then(function () {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Votre téléphone ne permet pas d’utiliser l’appareil photo ici.');
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      }).then(function (s) {
        if (fini) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        flux = s; v.srcObject = s;
        var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
        boucle();
      }).catch(function (x) {
        er.textContent = '';
        var t = x && (x.name === 'NotAllowedError' || x.name === 'SecurityError')
          ? 'L’accès à l’appareil photo a été refusé. Autorisez-le dans les réglages du téléphone, puis réessayez.'
          : (x && x.name === 'NotFoundError' ? 'Aucun appareil photo trouvé.' : (x.message || 'Scanner indisponible.'));
        er.appendChild(msg(t));
      });
    }

    var STYLE = 'display:flex;align-items:center;justify-content:center;gap:8px';
    var b1 = el('button', 'go', '📷 Scanner un colis');
    b1.style.cssText = STYLE + ';background:var(--brand);color:#fff;margin-top:12px';
    b1.onclick = scanner;
    $('dash').querySelector('.stat').after(b1);

    var b2 = el('button', 'go alt', '📷 Scanner l’étiquette du colis');
    b2.style.cssText = STYLE;
    b2.onclick = scanner;
    $('find').after(b2);
  })();

  // ----- Empêcher le navigateur de mettre l'e-mail dans la case du code de suivi -----
  (function () {
    var q = $('q');
    q.setAttribute('name', 'sabali-code-suivi');
    q.setAttribute('autocomplete', 'off');
    q.setAttribute('data-lpignore', 'true');
    q.setAttribute('data-form-type', 'other');
    function nettoyer() { if (q.value.indexOf('@') > -1) q.value = ''; }
    var n = 0, minuteur = setInterval(function () { nettoyer(); if (++n > 30) clearInterval(minuteur); }, 500);
    ['input', 'change', 'focus', 'blur', 'animationstart'].forEach(function (ev) { q.addEventListener(ev, nettoyer); });
    window.addEventListener('pageshow', nettoyer);
  })();

  // ----- Lien direct vers l'espace transporteur (?espace=transporteur) -----
  if (new URLSearchParams(location.search).get('espace') === 'transporteur') tab(2);

  // ----- Présentation sur l'accueil : cachée quand un transporteur est connecté -----
  (function () {
    var pres = document.getElementById('presentation');
    if (!pres) return;
    var _show = show;
    show = function () { _show.apply(this, arguments); pres.hidden = !!user; };
    pres.hidden = !!user;
    pres.querySelectorAll('[data-espace]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); tab(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(function () { var m = $('email'); if (m && !user) m.focus({ preventScroll: true }); }, 400);
      });
    });
  })();

  // ----- Barre du haut : FR/EN à côté de « Se connecter », lien vers l'espace transporteur -----
  (function () {
    var droite = document.querySelector('.hero .droite'), lien = document.querySelector('[data-espace-haut]');
    if (!droite || !lien) return;
    var fr = [].slice.call(document.querySelectorAll('.hero button')).filter(function (b) { return b.textContent === 'FR'; })[0];
    if (fr) { var c = fr.parentNode; c.style.cssText = 'display:flex;gap:6px'; droite.insertBefore(c, lien); }
    function maj() {
      var en = document.documentElement.lang === 'en';
      lien.textContent = user ? (en ? 'My area' : 'Mon espace') : (en ? 'Log in' : 'Se connecter');
    }
    new MutationObserver(maj).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    var _show2 = show;
    show = function () { _show2.apply(this, arguments); maj(); };
    maj();
    lien.addEventListener('click', function (e) {
      e.preventDefault(); tab(2);
      setTimeout(function () { var m = $('email'); if (m && !user) m.focus(); }, 200);
    });
  })();

  // ----- Acceptation des conditions de location à la création du compte -----
  (function () {
    var lb = el('label', 'chk');
    lb.style.cssText = 'display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:.92rem;margin:12px 0 0';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'cgv-ok'; cb.style.marginTop = '3px';
    var tx = el('span');
    tx.appendChild(document.createTextNode('J’ai lu et j’accepte les '));
    var a = el('a', '', 'conditions de location'); a.href = 'conditions-location.pdf'; a.target = '_blank'; a.rel = 'noopener'; a.style.color = 'inherit';
    tx.appendChild(a); tx.appendChild(document.createTextNode(' de Sabali (pour créer un compte).'));
    lb.appendChild(cb); lb.appendChild(tx);
    $('signup').before(lb);
    var _su = $('signup').onclick;
    $('signup').onclick = function () {
      if (!cb.checked) { authMsg('Cochez la case pour accepter les conditions de location avant de créer votre compte.'); return; }
      return _su.apply(this, arguments);
    };
  })();

  // ----- Recherche et filtre dans « Vos colis » -----
  (function () {
    var L = $('list');
    var zone = el('div');
    zone.style.cssText = 'display:grid;grid-template-columns:1fr;gap:8px;margin:4px 0 6px';
    var q = document.createElement('input');
    q.type = 'search'; q.id = 'rech'; q.placeholder = '🔎 Rechercher : nom, code, téléphone, ville…';
    q.setAttribute('autocomplete', 'off'); q.setAttribute('aria-label', 'Rechercher un colis');
    var sv = document.createElement('select'); sv.id = 'filtre-voyage'; sv.setAttribute('aria-label', 'Filtrer par voyage');
    var compte = el('div', 'small');
    zone.appendChild(q); zone.appendChild(sv); zone.appendChild(compte);
    L.before(zone);

    function norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function remplir() {
      var choix = sv.value;
      sv.textContent = '';
      [['', 'Tous les voyages'], ['_aucun', 'Colis sans voyage']].forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sv.appendChild(op);
      });
      voyages.forEach(function (v) {
        var op = document.createElement('option'); op.value = v.id;
        op.textContent = v.nom + (v.archive ? ' (rangé)' : '');
        sv.appendChild(op);
      });
      sv.value = choix; if (sv.value !== choix) sv.value = '';
    }
    function filtrer() {
      var mots = norm(q.value).split(/\s+/).filter(Boolean), fv = sv.value, vus = 0, total = 0;
      L.querySelectorAll(':scope > .track').forEach(function (card) {
        var k = card.querySelector('.code'); if (!k) return;
        var c = colis.filter(function (x) { return x.code === k.textContent; })[0];
        if (!c) return;
        total++;
        var okV = !fv || (fv === '_aucun' ? !c.voyage_id : c.voyage_id === fv);
        var texte = norm([c.code, c.expediteur, c.destinataire, c.telephone, c.ville, c.port, c.origine, c.contenu].join(' '));
        var okT = mots.every(function (m) { return texte.indexOf(m) > -1; });
        card.hidden = !(okV && okT);
        if (!card.hidden) vus++;
      });
      compte.textContent = (q.value || fv) ? vus + ' colis affiché' + (vus > 1 ? 's' : '') + ' sur ' + total : total + ' colis';
      zone.hidden = total === 0;
    }
    q.addEventListener('input', filtrer);
    sv.addEventListener('change', filtrer);
    var _drawR = draw;
    draw = function () { _drawR.apply(this, arguments); remplir(); filtrer(); };
    if (colis.length) { remplir(); filtrer(); } else { zone.hidden = true; }
  })();

  // ----- Liste de colisage par voyage (impression / PDF / Excel) -----
  (function () {
    var st = document.createElement('style');
    st.textContent =
      '#liste-zone{position:fixed;inset:0;z-index:60;background:#fff;color:#12261d;overflow:auto;padding:14px;font-family:inherit}' +
      '#liste-zone .lbar{display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:#fff;padding:6px 0 10px;z-index:1}' +
      '#liste-zone .lbar button{font:inherit;font-weight:700;padding:10px 14px;border-radius:10px;border:0;background:#e3a82b;color:#2b1d00;cursor:pointer}' +
      '#liste-zone .lbar .l2{background:#0f3d2e;color:#fff}#liste-zone .lbar .l3{background:#fff;border:2px solid #e9e2cf;color:#12261d}' +
      '#liste-zone h2{margin:6px 0 2px;color:#0f3d2e}#liste-zone .m{color:#5f5c4c;font-size:13px;margin-bottom:10px}' +
      '#liste-zone .tw{overflow-x:auto}#liste-zone table{border-collapse:collapse;width:100%;font-size:12.5px;min-width:900px}' +
      '#liste-zone th{background:#0f3d2e;color:#fff;text-align:left;padding:6px;white-space:nowrap}' +
      '#liste-zone td{border-bottom:1px solid #e9e2cf;padding:6px;vertical-align:top}#liste-zone tr:nth-child(even) td{background:#fbf7ee}' +
      '#liste-zone .n{text-align:right;white-space:nowrap}#liste-zone tfoot td{font-weight:800;border-top:2px solid #0f3d2e;background:#fff}' +
      '@media print{@page{size:A4 landscape;margin:10mm}body.liste-ouverte>*:not(#liste-zone){display:none!important}#liste-zone{position:static;padding:0}#liste-zone .lbar{display:none}#liste-zone table{min-width:0;font-size:10px}}';
    document.head.appendChild(st);

    function e2(n) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'; }
    function esc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    window.ouvrirListe = function (v) {
      var L = colis.filter(function (c) { return c.voyage_id === v.id; })
        .sort(function (a, b) { return String(a.destinataire || '').localeCompare(String(b.destinataire || ''), 'fr'); });
      var m = (user && user.user_metadata) || {};
      var tot = { kg: 0, prix: 0, paye: 0, reste: 0, pcs: 0 };
      var lignes = L.map(function (c, i) {
        var reste = Math.max((Number(c.prix) || 0) - (Number(c.paye) || 0), 0);
        var np = Number(c.pieces) || 1; tot.pcs += np;
        tot.kg += Number(c.kg) || 0; tot.prix += Number(c.prix) || 0; tot.paye += Number(c.paye) || 0; tot.reste += reste;
        return { n: i + 1, code: c.code, exp: c.expediteur || '', dest: c.destinataire || '', tel: c.telephone || '',
          ville: c.ville || '', contenu: (np > 1 ? np + ' pièces · ' : '') + (c.contenu || ''), kg: Number(c.kg) || 0, prix: Number(c.prix) || 0,
          paye: Number(c.paye) || 0, reste: reste, statut: stepsFor(c)[c.etape] || '' };
      });

      var old = document.getElementById('liste-zone'); if (old) old.remove();
      var z = document.createElement('div'); z.id = 'liste-zone';
      var html = '<div class="lbar"><button id="l-print">Imprimer / PDF</button><button id="l-csv" class="l2">Télécharger pour Excel</button><button id="l-close" class="l3">Fermer</button></div>' +
        '<h2>Liste de colisage — ' + esc(v.nom) + '</h2>' +
        '<div class="m">' + esc(m.nom || '') + ' · départ le ' + esc(fr(v.date_depart)) + ' · étape : ' + esc(VSTEPS[v.etape]) + ' · imprimée le ' + new Date().toLocaleDateString('fr-FR') + '</div>' +
        '<div class="tw"><table><thead><tr><th>N°</th><th>Code</th><th>Expéditeur</th><th>Destinataire</th><th>Téléphone</th><th>Ville</th><th>Contenu</th><th class="n">Poids</th><th class="n">Prix</th><th class="n">Payé</th><th class="n">Reste</th><th>Statut</th></tr></thead><tbody>' +
        (lignes.length ? lignes.map(function (r) {
          return '<tr><td>' + r.n + '</td><td><b>' + esc(r.code) + '</b></td><td>' + esc(r.exp) + '</td><td>' + esc(r.dest) + '</td><td>' + esc(r.tel) + '</td><td>' + esc(r.ville) + '</td><td>' + esc(r.contenu) + '</td><td class="n">' + (r.kg ? r.kg.toLocaleString('fr-FR') + ' kg' : '') + '</td><td class="n">' + e2(r.prix) + '</td><td class="n">' + e2(r.paye) + '</td><td class="n">' + (r.reste ? '<b>' + e2(r.reste) + '</b>' : 'soldé') + '</td><td>' + esc(r.statut) + '</td></tr>';
        }).join('') : '<tr><td colspan="12">Aucun colis dans ce voyage.</td></tr>') +
        '</tbody><tfoot><tr><td colspan="7">Total : ' + lignes.length + ' colis' + (tot.pcs > lignes.length ? ' · ' + tot.pcs + ' pièces à charger' : '') + '</td><td class="n">' + tot.kg.toLocaleString('fr-FR') + ' kg</td><td class="n">' + e2(tot.prix) + '</td><td class="n">' + e2(tot.paye) + '</td><td class="n">' + e2(tot.reste) + '</td><td></td></tr></tfoot></table></div>';
      z.innerHTML = html;
      document.body.appendChild(z); document.body.classList.add('liste-ouverte');
      z.querySelector('#l-close').onclick = function () { z.remove(); document.body.classList.remove('liste-ouverte'); };
      z.querySelector('#l-print').onclick = function () { window.print(); };
      z.querySelector('#l-csv').onclick = function () {
        var cel = function (x) { x = String(x == null ? '' : x); return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
        var num = function (n) { return String(Math.round(n * 100) / 100).replace('.', ','); };
        var rows = [['N°', 'Code', 'Expéditeur', 'Destinataire', 'Téléphone', 'Ville', 'Contenu', 'Poids (kg)', 'Prix (€)', 'Payé (€)', 'Reste (€)', 'Statut']]
          .concat(lignes.map(function (r) { return [r.n, r.code, r.exp, r.dest, r.tel, r.ville, r.contenu, num(r.kg), num(r.prix), num(r.paye), num(r.reste), r.statut]; }))
          .concat([['', 'TOTAL ' + lignes.length + ' colis' + (tot.pcs > lignes.length ? ' / ' + tot.pcs + ' pièces' : ''), '', '', '', '', '', num(tot.kg), num(tot.prix), num(tot.paye), num(tot.reste), '']]);
        var csv = '﻿' + rows.map(function (r) { return r.map(cel).join(';'); }).join('\r\n');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'colisage-' + String(v.nom).replace(/[^\w\-]+/g, '-') + '.csv';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      };
      window.scrollTo(0, 0);
    };
  })();

  // ----- Messages WhatsApp pendant le trajet par la route -----
  (function () {
    var _wt2 = waText;
    waText = function (c) {
      if (!(c.voyage_id && c.route && c.etape === 5)) return _wt2(c);
      var e = etatRoute(c);
      if (e === 2) return _wt2(c);
      var m = (user && user.user_metadata) || {}, ville = c.ville || 'la destination';
      var body = e === 0
        ? 'votre colis est dédouané' + (c.port ? ' à ' + c.port : '') + '. Il va bientôt partir par la route vers ' + ville + '.'
        : 'votre colis est en route vers ' + ville + ' par la route.';
      return 'Bonjour' + (c.destinataire ? ' ' + c.destinataire : '') + ', ' + body +
        '\nCode de suivi : ' + c.code + '\nSuivi : ' + location.origin + location.pathname + '?code=' + c.code +
        '\n— ' + (m.nom || 'Sabali');
    };
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

  // ----- Plusieurs pièces pour un même colis (ex : 5 barils) -----
  (function () {
    function nbp(c) { return Math.max(parseInt(c && c.pieces, 10) || 1, 1); }
    function trouver(code) { return colis.filter(function (x) { return x.code === code; })[0]; }

    // Case « Nombre de pièces » à côté du contenu
    var lp = el('label', '', 'Nombre de pièces (barils, cartons, valises…)'); lp.htmlFor = 'pcs';
    var ip = document.createElement('input'); ip.id = 'pcs'; ip.type = 'number'; ip.min = '1'; ip.max = '99'; ip.step = '1'; ip.value = '1';
    var ap = el('div', 'small', 'Un seul code de suivi pour le client, mais une étiquette numérotée par pièce (1/5, 2/5…).');
    $('what').after(lp, ip, ap);

    // Message WhatsApp : on précise le nombre de pièces
    var _wt3 = waText;
    waText = function (c) {
      var t = _wt3(c), n = nbp(c);
      if (n < 2) return t;
      var k = 'Code de suivi : ' + c.code;
      return t.indexOf(k) >= 0 ? t.replace(k, k + '\nNombre de pièces : ' + n) : t + '\nNombre de pièces : ' + n;
    };

    // QR code
    function chargerQR() {
      return new Promise(function (ok, ko) {
        if (window.qrcode) return ok();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
        s.onload = ok; s.onerror = function () { ko(new Error('Impossible de charger le QR code. Vérifiez votre connexion.')); };
        document.head.appendChild(s);
      });
    }
    function qrSvg(texte, px) {
      var q = qrcode(0, 'M'); q.addData(texte); q.make();
      var n = q.getModuleCount(), m = 2, d = '';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m) + '" width="' + px + '" height="' + px +
        '"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000" shape-rendering="crispEdges"/></svg>';
    }
    function esc2(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (k) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[k]; }); }
    function etiquettes(c) {
      var m = (user && user.user_metadata) || {}, n = nbp(c), qr = qrSvg(location.origin + location.pathname + '?code=' + c.code, 200), h = '';
      for (var i = 1; i <= n; i++) {
        h += '<div class="eti"><div class="ent">' + esc2(m.nom || 'Sabali') + '</div>' + qr +
          '<div class="cod">' + esc2(c.code) + '</div><div class="pce">Pièce ' + i + ' / ' + n + '</div>' +
          '<div class="scn">Scannez pour suivre votre colis</div>' +
          '<div class="dst">' + esc2([c.destinataire, c.ville].filter(Boolean).join(' · ')) + '</div></div>';
      }
      return h;
    }
    var CSS_ETI = '.eti{box-sizing:border-box;width:300px;margin:8px auto;padding:12px;border:2px solid #000;border-radius:8px;background:#fff;color:#000;text-align:center;font-family:Arial,sans-serif;page-break-inside:avoid;break-inside:avoid}' +
      '.eti .ent{font-weight:bold;font-size:16px;margin-bottom:6px}.eti .cod{font-family:monospace;font-weight:bold;font-size:26px;letter-spacing:2px;margin-top:4px}' +
      '.eti .pce{display:inline-block;margin-top:6px;padding:4px 14px;border:2px solid #000;border-radius:20px;font-weight:bold;font-size:20px}' +
      '.eti .scn{font-size:12px;margin-top:6px}.eti .dst{font-size:13px;font-weight:bold;margin-top:4px}';

    function imprimerEti(c) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      var d = f.contentDocument;
      d.open(); d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Étiquettes ' + esc2(c.code) + '</title><style>body{margin:0}' + CSS_ETI + '</style></head><body>' + etiquettes(c) + '</body></html>'); d.close();
      f.contentWindow.onafterprint = function () { f.remove(); };
      setTimeout(function () { f.remove(); }, 120000);
      setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); }, 150);
    }

    async function ouvrirEtiquettes(c) {
      var d = document.createElement('dialog');
      d.style.cssText = 'border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);max-width:420px;width:calc(100% - 32px);max-height:90vh;padding:16px;font-family:inherit';
      d.onclose = function () { d.remove(); };
      document.body.appendChild(d);
      d.appendChild(el('strong', '', 'Étiquettes du colis ' + c.code + ' (' + nbp(c) + ' pièces)'));
      var bf = el('button', 'go alt', 'Fermer'); bf.onclick = function () { d.close(); };
      try { await chargerQR(); } catch (x) { d.appendChild(msg(x.message)); d.appendChild(bf); d.showModal(); return; }
      d.appendChild(el('p', 'small', 'Collez une étiquette sur chaque pièce. Elles ont toutes le même QR code, mais le numéro (1/' + nbp(c) + ', 2/' + nbp(c) + '…) permet de vérifier qu’il ne manque rien.'));
      var st = document.createElement('style'); st.textContent = CSS_ETI; d.appendChild(st);
      var z = el('div'); z.innerHTML = etiquettes(c); z.style.cssText = 'max-height:45vh;overflow:auto;background:#eee;border-radius:10px;padding:4px';
      var bi = el('button', 'go', 'Imprimer les ' + nbp(c) + ' étiquettes'); bi.onclick = function () { imprimerEti(c); };
      [z, bi, bf].forEach(function (x) { d.appendChild(x); });
      d.showModal();
    }

    // Fiches colis : nombre de pièces + bouton étiquettes numérotées
    function majCartes() {
      document.querySelectorAll('#list .track').forEach(function (card) {
        var k = card.querySelector('.code'); if (!k) return;
        var c = trouver(k.textContent); if (!c || nbp(c) < 2) return;
        if (!card.querySelector('.pcs-info')) {
          var i = el('div', 'small pcs-info', '📦 ' + nbp(c) + ' pièces' + (c.contenu ? ' · ' + c.contenu : ''));
          i.style.fontWeight = '600';
          var h = card.firstChild; if (h && h.nextSibling) h.nextSibling.after(i); else card.appendChild(i);
        }
        var b = card.querySelector('.acts .qr');
        if (b && b.dataset.pcs !== String(nbp(c))) {
          b.dataset.pcs = String(nbp(c));
          b.textContent = 'Étiquettes QR (' + nbp(c) + ')';
          b.onclick = function () { ouvrirEtiquettes(c); };
        }
      });
    }
    new MutationObserver(majCartes).observe($('list'), { childList: true, subtree: true });
    majCartes();

    // Remise : le transporteur confirme que toutes les pièces sont remises
    new MutationObserver(function () {
      document.querySelectorAll('dialog').forEach(function (d) {
        if (d.dataset.pcs) return;
        var t = d.querySelector('strong'); if (!t || t.textContent.indexOf('Remise du colis ') !== 0) return;
        var v = Array.prototype.filter.call(d.querySelectorAll('button'), function (b) { return b.textContent === 'Valider la remise'; })[0];
        if (!v) return;
        d.dataset.pcs = '1';
        var c = trouver(t.textContent.replace('Remise du colis ', '').trim()); if (!c || nbp(c) < 2) return;
        var n = nbp(c);
        var lb = el('label', 'chk'), cb = document.createElement('input'); cb.type = 'checkbox';
        lb.appendChild(cb); lb.appendChild(document.createTextNode(' J’ai bien remis les ' + n + ' pièces (' + n + '/' + n + ')'));
        lb.style.cssText = 'margin:12px 0;font-weight:600';
        v.before(lb);
        d.addEventListener('click', function (ev) {
          if (ev.target !== v || cb.checked) return;
          ev.stopImmediatePropagation(); ev.preventDefault();
          lb.style.color = 'var(--bad)';
          alertePcs(d, v, 'Cochez la case : vérifiez que les ' + n + ' pièces sont bien remises.');
        }, true);
      });
    }).observe(document.body, { childList: true });
    function alertePcs(d, v, t) { var o = d.querySelector('.pcs-err'); if (o) o.remove(); var m = msg(t); m.classList.add('pcs-err'); v.before(m); }
  })();

  // ----- Mascottes : Sabi (baril), Awa (livreuse), Bakary (livreur) -----
  (function () {
    var M = {
      sabi: '<svg viewBox="5 58 115 155" xmlns="http://www.w3.org/2000/svg"><ellipse cx="65" cy="196" rx="38" ry="6" fill="#d9d2bd"/><path d="M44 196 l-6 10 M86 196 l6 10" stroke="#0e3c2d" stroke-width="5" stroke-linecap="round"/><rect x="33" y="70" width="64" height="126" rx="16" fill="#1a7f4b"/><ellipse cx="65" cy="72" rx="32" ry="9" fill="#0e3c2d"/><ellipse cx="65" cy="71" rx="24" ry="5" fill="#156b40"/><rect x="33" y="100" width="64" height="7" fill="#e3a82b"/><rect x="33" y="166" width="64" height="7" fill="#e3a82b"/><circle cx="54" cy="130" r="8" fill="#fff"/><circle cx="76" cy="130" r="8" fill="#fff"/><circle cx="56" cy="131" r="4" fill="#0e3c2d"/><circle cx="78" cy="131" r="4" fill="#0e3c2d"/><circle cx="57.5" cy="129.5" r="1.4" fill="#fff"/><circle cx="79.5" cy="129.5" r="1.4" fill="#fff"/><path d="M54 146 q11 11 22 0" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="45" cy="144" r="4" fill="#f2b6a0" opacity=".8"/><circle cx="85" cy="144" r="4" fill="#f2b6a0" opacity=".8"/><path d="M33 135 q-16 -6 -18 -26" fill="none" stroke="#1a7f4b" stroke-width="7" stroke-linecap="round"/><circle cx="15" cy="106" r="6" fill="#e3a82b"/><path d="M97 140 q14 8 14 22" fill="none" stroke="#1a7f4b" stroke-width="7" stroke-linecap="round"/><circle cx="111" cy="164" r="6" fill="#e3a82b"/></svg>',
      awa: '<svg viewBox="150 55 92 160" xmlns="http://www.w3.org/2000/svg"><ellipse cx="190" cy="208" rx="36" ry="6" fill="#d9d2bd"/><path d="M162 206 q-4 -60 28 -76 q32 16 28 76 z" fill="#1a7f4b"/><path d="M168 180 h44" stroke="#e3a82b" stroke-width="5"/><path d="M172 192 h36" stroke="#e3a82b" stroke-width="3"/><rect x="183" y="118" width="14" height="14" fill="#8a5a3b"/><ellipse cx="190" cy="100" rx="22" ry="24" fill="#8a5a3b"/><path d="M166 96 q0 -34 24 -36 q26 2 26 34 q-4 -10 -26 -12 q-20 2 -24 14 z" fill="#e3a82b"/><path d="M210 70 q14 -10 18 4 q-6 8 -14 4 z" fill="#e3a82b"/><path d="M170 86 q20 -10 42 0" fill="none" stroke="#b07d14" stroke-width="2"/><circle cx="182" cy="102" r="3" fill="#2b1a10"/><circle cx="198" cy="102" r="3" fill="#2b1a10"/><path d="M183 112 q7 7 14 0" fill="none" stroke="#2b1a10" stroke-width="2.4" stroke-linecap="round"/><circle cx="176" cy="110" r="3.5" fill="#c47a5a" opacity=".6"/><circle cx="204" cy="110" r="3.5" fill="#c47a5a" opacity=".6"/><rect x="196" y="146" width="40" height="32" rx="3" fill="#c9924f"/><path d="M196 158 h40" stroke="#a8763a" stroke-width="2"/><rect x="222" y="162" width="10" height="10" fill="#fff"/><path d="M223 163 h3 v3 h-3 z M228 168 h3 v3 h-3 z M223 168 h3 v3 h-3 z" fill="#0e3c2d"/><path d="M208 150 q10 4 16 14" fill="none" stroke="#8a5a3b" stroke-width="6" stroke-linecap="round"/></svg>',
      bakary: '<svg viewBox="262 62 96 154" xmlns="http://www.w3.org/2000/svg"><ellipse cx="315" cy="208" rx="36" ry="6" fill="#d9d2bd"/><rect x="299" y="180" width="12" height="26" rx="3" fill="#0e3c2d"/><rect x="319" y="180" width="12" height="26" rx="3" fill="#0e3c2d"/><path d="M290 186 q0 -50 25 -56 q25 6 25 56 z" fill="#1a7f4b"/><path d="M305 136 l10 14 l10 -14" fill="none" stroke="#e3a82b" stroke-width="3"/><rect x="309" y="118" width="12" height="14" fill="#6b4329"/><ellipse cx="315" cy="100" rx="21" ry="23" fill="#6b4329"/><path d="M293 94 q2 -24 22 -24 q20 0 22 24 z" fill="#1a7f4b"/><path d="M330 92 q14 0 20 6 q-12 4 -22 2 z" fill="#e3a82b"/><circle cx="315" cy="82" r="5" fill="#e3a82b"/><circle cx="307" cy="104" r="3" fill="#1e120a"/><circle cx="323" cy="104" r="3" fill="#1e120a"/><path d="M306 113 q9 8 18 0" fill="none" stroke="#1e120a" stroke-width="2.4" stroke-linecap="round"/><rect x="268" y="148" width="34" height="28" rx="3" fill="#c9924f"/><path d="M285 148 v28" stroke="#e3a82b" stroke-width="4"/><path d="M296 140 q-10 10 -8 20" fill="none" stroke="#1a7f4b" stroke-width="7" stroke-linecap="round"/><path d="M336 140 q14 -10 12 -26" fill="none" stroke="#1a7f4b" stroke-width="7" stroke-linecap="round"/><circle cx="348" cy="110" r="6" fill="#6b4329"/></svg>'
    };
    window.SABALI_MASCOTTES = M;
    var st = document.createElement('style');
    st.textContent = '.masc{display:flex;align-items:center;gap:12px;margin:12px 0 4px}.masc .fig{flex:0 0 72px;height:96px}.masc .fig svg{width:100%;height:100%}' +
      '.masc .bul{position:relative;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;font-size:.95rem;line-height:1.4}' +
      '.masc .bul b{display:block;font-size:.8rem;color:var(--mute);margin-bottom:2px}' +
      '.masc .bul:before{content:"";position:absolute;left:-7px;top:50%;margin-top:-6px;border:6px solid transparent;border-right-color:var(--line);border-left:0}' +
      '.equipe{max-width:960px;margin:0 auto;padding:24px 20px 8px;text-align:center}.equipe .trio{display:flex;justify-content:center;gap:8px}' +
      '.equipe .p{width:31%;max-width:130px}.equipe .p .fig{height:120px}.equipe .p svg{width:100%;height:100%}.equipe .p b{display:block;margin-top:4px}.equipe .p span{font-size:.85rem;color:var(--mute)}' +
      '.equipe h3{margin:0 0 14px;font-size:1.25rem}';
    document.head.appendChild(st);

    function bulle(qui, nom, texte) {
      var d = el('div', 'masc'), f = el('div', 'fig'), b = el('div', 'bul');
      f.innerHTML = M[qui]; f.setAttribute('aria-hidden', 'true');
      b.appendChild(el('b', '', nom)); b.appendChild(document.createTextNode(texte));
      d.appendChild(f); d.appendChild(b);
      return d;
    }
    window.bulleMascotte = bulle;

    // Page de suivi du client : la mascotte change selon l'étape
    var dernier = null;
    if (db && db.rpc) {
      var rpc0 = db.rpc.bind(db);
      db.rpc = function (n, a) {
        var pr = rpc0(n, a);
        if (n === 'suivi') { dernier = null; Promise.resolve(pr).then(function (o) { dernier = o && o.data; }, function () {}); }
        return pr;
      };
    }
    function L(f, e) { return document.documentElement.lang === 'en' ? e : f; }
    function choisir(c) {
      var S = stepsFor(c), e = S[c.etape] || '', fin = c.etape >= S.length - 1;
      if (fin) return ['awa', 'Awa', L('Votre colis a bien été remis. Merci pour votre confiance, à bientôt !', 'Your parcel has been handed over. Thank you for your trust, see you soon!')];
      if (c.route && c.voyage_id && c.etape === 5) {
        var r = etatRoute(c), v = c.ville || 'sa destination';
        if (r === 2) return ['awa', 'Awa', L('Votre colis est arrivé à ' + v + ' ! Vous pouvez venir le récupérer.', 'Your parcel has arrived in ' + v + '! You can come and collect it.')];
        if (r === 1) return ['bakary', 'Bakary', L('Votre colis roule vers ' + v + '. Il arrive bientôt !', 'Your parcel is on the road to ' + v + '. It will be there soon!')];
        return ['bakary', 'Bakary', L('Votre colis est dédouané. Je prépare la suite par la route vers ' + v + '.', 'Your parcel has cleared customs. I am getting it ready for the road to ' + v + '.')];
      }
      if (/Dédouan/.test(e)) return ['sabi', 'Sabi', L('Votre colis est dédouané. Plus que quelques jours !', 'Your parcel has cleared customs. Only a few more days!')];
      if (/port/i.test(e)) return ['sabi', 'Sabi', L('Nous sommes arrivés au port ! Encore un peu de patience.', 'We have reached the port! Just a little more patience.')];
      if (/mer|Bateau|Parti/i.test(e)) return ['sabi', 'Sabi', L('Je traverse la mer avec votre colis. Tout va bien à bord !', 'I am crossing the sea with your parcel. All is well on board!')];
      if (/Chargé/.test(e)) return ['bakary', 'Bakary', L('Votre colis est bien rangé dans le conteneur. Le départ approche !', 'Your parcel is safely packed in the container. Departure is coming soon!')];
      if (c.etape > 0) return ['sabi', 'Sabi', L('Votre colis avance bien. Je vous tiens au courant !', 'Your parcel is on its way. I will keep you posted!')];
      return ['bakary', 'Bakary', L('J’ai bien reçu votre colis. Il est entre de bonnes mains !', 'I have received your parcel. It is in good hands!')];
    }
    new MutationObserver(function () {
      var t = document.querySelector('#res .track');
      if (!t || t.querySelector('.masc')) return;
      if (!dernier) return;
      var c = choisir(dernier), b = bulle(c[0], c[1], c[2]);
      var top = t.querySelector('.top');
      if (top) top.after(b); else t.prepend(b);
    }).observe($('res'), { childList: true, subtree: true });

    // Espace transporteur : aucun colis
    function vide() {
      var L = $('list'); if (!L) return;
      Array.prototype.forEach.call(L.querySelectorAll('p.small'), function (p) {
        if (p.dataset.masc || p.textContent.indexOf('Aucun colis') !== 0) return;
        p.dataset.masc = '1'; p.style.display = 'none';
        p.after(bulle('bakary', 'Bakary', document.documentElement.lang === 'en' ? 'No parcels yet? Add your first parcel above, I will take care of the rest!' : 'Pas encore de colis ? Ajoutez votre premier colis plus haut, je m’occupe du reste !'));
      });
    }
    new MutationObserver(vide).observe($('list'), { childList: true });
    vide();

    // Page d'accueil : l'équipe Sabali
    var pr = $('presentation');
    if (pr && !pr.querySelector('.equipe')) {
      var q = el('section', 'equipe');
      var en = document.documentElement.lang === 'en';
      q.innerHTML = '<h3>' + (en ? 'The Sabali team looks after your parcels' : 'L’équipe Sabali veille sur vos colis') + '</h3><div class="trio">' +
        (en ? [['bakary', 'Bakary', 'takes charge'], ['sabi', 'Sabi', 'crosses the sea'], ['awa', 'Awa', 'hands it over']] : [['bakary', 'Bakary', 'prend en charge'], ['sabi', 'Sabi', 'traverse la mer'], ['awa', 'Awa', 'vous remet le colis']]).map(function (x) {
          return '<div class="p"><div class="fig" aria-hidden="true">' + M[x[0]] + '</div><b>' + x[1] + '</b><span>' + x[2] + '</span></div>';
        }).join('') + '</div>';
      var i2 = pr.querySelector('.intro2');
      if (i2) i2.after(q); else pr.prepend(q);
    }
  })();
})();
