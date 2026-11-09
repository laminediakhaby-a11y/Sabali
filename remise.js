/* Sabali – preuve de remise. Chargé par index.html après le script principal. */
(function () {
  var _v = vcall;

  function dlg(titre) {
    var d = document.createElement('dialog');
    d.style.cssText = 'border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);max-width:420px;width:calc(100% - 32px);padding:16px;font-family:inherit';
    d.appendChild(el('strong', '', titre));
    d.onclose = function () { d.remove(); };
    document.body.appendChild(d);
    return d;
  }

  function reduire(f) {
    return new Promise(function (ok, ko) {
      var img = new Image(), u = URL.createObjectURL(f);
      img.onload = function () {
        var k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) { b ? ok(b) : ko(new Error('Photo illisible')); }, 'image/jpeg', 0.7);
      };
      img.onerror = function () { ko(new Error('Photo illisible')); };
      img.src = u;
    });
  }

  function demander(c) {
    return new Promise(function (ok) {
      var d = dlg('Remise du colis ' + c.code), fait = false;
      var ln = el('label', '', 'Nom de la personne qui récupère'); ln.htmlFor = 'rm-nom';
      var n = document.createElement('input'); n.id = 'rm-nom'; n.value = c.destinataire || '';
      var lp = el('label', '', 'Photo du colis (facultatif)'); lp.htmlFor = 'rm-photo';
      var p = document.createElement('input'); p.id = 'rm-photo'; p.type = 'file'; p.accept = 'image/*';
      var er = el('div'), v = el('button', 'go', 'Valider la remise'), a = el('button', 'go alt', 'Annuler');
      v.onclick = function () {
        var nom = n.value.trim();
        if (!nom) { er.textContent = ''; er.appendChild(msg('Indiquez le nom de la personne.')); return; }
        fait = true; ok({ nom: nom, photo: p.files[0] || null }); d.close();
      };
      a.onclick = function () { d.close(); };
      d.onclose = function () { d.remove(); if (!fait) ok(null); };
      [ln, n, lp, p, er, v, a].forEach(function (x) { d.appendChild(x); });
      d.showModal();
    });
  }

  // Remplace l'appel « marquer_remis » : on demande d'abord la preuve, puis on marque le colis remis.
  vcall = async function (name, args) {
    if (name !== 'marquer_remis') return _v(name, args);
    var c = colis.filter(function (x) { return x.id === args.p_colis; })[0];
    if (!c) return _v(name, args);
    var e = $('verr'); e.textContent = '';
    var r = await demander(c);
    if (!r) return {};
    var chemin = null;
    try {
      if (r.photo) {
        chemin = user.id + '/' + c.id + '.jpg';
        var up = await db.storage.from('preuves').upload(chemin, await reduire(r.photo), { upsert: true, contentType: 'image/jpeg' });
        if (up.error) throw up.error;
      }
      var s = await db.from('remises').upsert({ colis_id: c.id, nom: r.nom, photo: chemin });
      if (s.error) throw s.error;
    } catch (x) {
      e.appendChild(msg('Preuve non enregistrée, le colis n’est pas marqué remis : ' + x.message));
      return { error: x };
    }
    return _v(name, args);
  };

  async function voir(code) {
    var c = colis.filter(function (x) { return x.code === code; })[0];
    var d = dlg('Remise du colis ' + code);
    var o = c ? await db.from('remises').select('nom,photo,cree_le').eq('colis_id', c.id).maybeSingle() : { data: null };
    if (!o.data) {
      d.appendChild(el('p', 'small', 'Aucune preuve enregistrée pour ce colis.'));
    } else {
      d.appendChild(el('p', '', 'Remis à ' + o.data.nom + ' le ' +
        new Date(o.data.cree_le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) + '.'));
      if (o.data.photo) {
        var s = await db.storage.from('preuves').createSignedUrl(o.data.photo, 300);
        if (s.data) {
          var i = document.createElement('img');
          i.src = s.data.signedUrl; i.alt = 'Photo du colis remis';
          i.style.cssText = 'width:100%;border-radius:10px';
          d.appendChild(i);
        }
      }
    }
    var f = el('button', 'go alt', 'Fermer'); f.onclick = function () { d.close(); };
    d.appendChild(f); d.showModal();
  }

  // Ajoute un bouton « Preuve » à côté de chaque colis déjà remis.
  function ajouter() {
    document.querySelectorAll('#vlist .row').forEach(function (r) {
      var b = r.querySelector('.badge');
      if (!b || b.textContent !== 'Remis' || r.querySelector('.preuve')) return;
      var code = r.querySelector('.code').textContent;
      var btn = el('button', 'preuve', 'Preuve');
      btn.style.cssText = 'font:inherit;font-size:.9rem;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:9px;padding:7px 11px;cursor:pointer';
      btn.onclick = function () { voir(code); };
      r.appendChild(btn);
    });
  }
  new MutationObserver(ajouter).observe(document.getElementById('vlist'), { childList: true, subtree: true });
  ajouter();

  // ----- Paiement du colis : prix, déjà payé, reste à payer -----
  var BTN = 'font:inherit;font-size:.9rem;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:9px;padding:6px 10px;cursor:pointer;margin-left:8px';
  function euro(n) { return (Number(n) || 0).toLocaleString('fr-FR') + ' €'; }
  function reste(c) { return Math.max((Number(c.prix) || 0) - (Number(c.paye) || 0), 0); }

  function paiement(c) {
    var d = dlg('Paiement du colis ' + c.code);
    d.appendChild(el('p', 'small', 'Prix : ' + euro(c.prix) + ' · déjà payé : ' + euro(c.paye) + ' · reste : ' + euro(reste(c))));
    var l = el('label', '', 'Montant reçu maintenant (€)'); l.htmlFor = 'pm-montant';
    var i = document.createElement('input'); i.id = 'pm-montant'; i.type = 'number'; i.step = '0.01'; i.setAttribute('inputmode', 'decimal');
    var er = el('div');
    async function maj(total) {
      er.textContent = '';
      if (total < 0) { er.appendChild(msg('Le total payé ne peut pas être négatif.')); return; }
      var o = await db.from('colis').update({ paye: total }).eq('id', c.id);
      if (o.error) { er.appendChild(msg('Enregistrement impossible : ' + o.error.message)); return; }
      d.close(); load();
    }
    var b1 = el('button', 'go', 'Ajouter ce paiement'), b2 = el('button', 'go alt', 'Tout est payé'), b3 = el('button', 'go alt', 'Fermer');
    b1.onclick = function () {
      var m = parseFloat(i.value);
      if (!m) { er.textContent = ''; er.appendChild(msg('Indiquez le montant reçu.')); return; }
      maj(Math.round(((Number(c.paye) || 0) + m) * 100) / 100);
    };
    b2.onclick = function () { maj(Number(c.prix) || 0); };
    b3.onclick = function () { d.close(); };
    [l, i, er, b1, b2, b3].forEach(function (x) { d.appendChild(x); });
    d.showModal();
  }

  // Côté transporteur : une ligne « prix · payé · reste » avec un bouton sur chaque colis
  function lignesPaiement() {
    document.querySelectorAll('#list .track').forEach(function (card) {
      if (card.querySelector('.pay')) return;
      var k = card.querySelector('.code'); if (!k) return;
      var c = colis.filter(function (x) { return x.code === k.textContent; })[0];
      if (!c) return;
      var row = el('div', 'pay small');
      row.style.marginTop = '6px';
      row.appendChild(document.createTextNode('💶 Prix ' + euro(c.prix) + ' · payé ' + euro(c.paye) + ' · '));
      row.appendChild(el('strong', '', reste(c) > 0 ? 'reste ' + euro(reste(c)) : 'soldé'));
      var b = el('button', '', 'Paiement'); b.style.cssText = BTN;
      b.onclick = function () { paiement(c); };
      row.appendChild(b);
      card.insertBefore(row, card.querySelector('.acts'));
    });
  }
  new MutationObserver(lignesPaiement).observe(document.getElementById('list'), { childList: true, subtree: true });
  lignesPaiement();

  // Côté client : « reste à payer » sous le code de suivi
  async function lignePaiementClient(t) {
    if (t.querySelector('.reste')) return;
    var k = t.querySelector('.code'), top = t.querySelector('.top');
    if (!k || !top) return;
    var zone = el('div', 'reste small');
    top.after(zone);
    var o = await db.rpc('colis_paiement', { p_code: k.textContent });
    if (o.error || !o.data || !(Number(o.data.prix) > 0)) return;
    zone.style.marginTop = '8px';
    zone.appendChild(document.createTextNode('Prix : ' + euro(o.data.prix) + ' · déjà payé : ' + euro(o.data.paye) + ' · '));
    zone.appendChild(el('strong', '', Number(o.data.reste) > 0 ? 'reste à payer : ' + euro(o.data.reste) : 'paiement complet ✓'));
  }
  new MutationObserver(function () {
    document.querySelectorAll('#res .track').forEach(lignePaiementClient);
  }).observe(document.getElementById('res'), { childList: true, subtree: true });

  // Message WhatsApp « colis arrivé » : ajoute le reste à payer
  var _wt = waText;
  waText = function (c) {
    var t = _wt(c), r = reste(c);
    if (r > 0 && t.indexOf('est arrivé !') > -1) {
      var i = t.lastIndexOf('\n— ');
      if (i > -1) t = t.slice(0, i) + '\nReste à payer : ' + euro(r) + t.slice(i);
    }
    return t;
  };
})();
