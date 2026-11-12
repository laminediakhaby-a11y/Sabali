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

  async function ajouterBoutons() {
    var moi = ++tour;
    var ok = await chargerEnvois();
    if (moi !== tour) return;
    var cartes = document.querySelectorAll('#vlist > .track');
    voyages.forEach(function (v, i) {
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

  var _dv = drawVoyages;
  drawVoyages = function () { _dv(); ajouterBoutons(); };
  // Si les voyages étaient déjà affichés avant le chargement de ce fichier, on ajoute les boutons tout de suite
  if (db && user && voyages.length) ajouterBoutons();
})();
