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
