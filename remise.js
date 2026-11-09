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

  // ----- Profil de l'entreprise : logo, adresse, contact -----
  function reduirePng(f) {
    return new Promise(function (ok, ko) {
      var img = new Image(), u = URL.createObjectURL(f);
      img.onload = function () {
        var k = Math.min(1, 256 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) { b ? ok(b) : ko(new Error('Image illisible')); }, 'image/png');
      };
      img.onerror = function () { ko(new Error('Image illisible')); };
      img.src = u;
    });
  }
  function urlLogo(m) { return db.storage.from('logos').getPublicUrl(m.logo).data.publicUrl + '?v=' + (m.logo_v || ''); }

  var sm = $('savemsg'), det = sm.closest('details');
  det.querySelector('summary').textContent = 'Mon profil : logo, adresse et contact';
  det.querySelector('p.small').textContent = 'Affichés à vos clients sur la page de suivi. L’adresse et le numéro sont aussi ajoutés au message WhatsApp « colis arrivé ».';
  var ll = el('label', '', 'Logo de votre entreprise (facultatif)'); ll.htmlFor = 'logo-file';
  var lf = document.createElement('input'); lf.type = 'file'; lf.id = 'logo-file'; lf.accept = 'image/*';
  var lp = document.createElement('img'); lp.alt = 'Logo actuel'; lp.hidden = true;
  lp.style.cssText = 'max-height:56px;max-width:100%;margin-top:8px;border-radius:10px;object-fit:contain';
  sm.before(ll, lf, lp);
  function apercu() {
    var m = (user && user.user_metadata) || {};
    if (m.logo) { lp.src = urlLogo(m); lp.hidden = false; } else { lp.hidden = true; }
  }
  det.addEventListener('toggle', apercu);

  var _sm = sm.onclick;
  sm.onclick = async function () {
    var f = lf.files[0];
    if (f) {
      var e = $('merr'); e.textContent = '';
      try {
        var chemin = user.id + '/logo.png';
        var up = await db.storage.from('logos').upload(chemin, await reduirePng(f), { upsert: true, contentType: 'image/png' });
        if (up.error) throw up.error;
        var u = await db.auth.updateUser({ data: { logo: chemin, logo_v: Date.now() } });
        if (u.error) throw u.error;
        lf.value = '';
      } catch (x) { e.appendChild(msg('Logo non enregistré : ' + x.message)); return; }
    }
    var r = await _sm.call(this);
    setTimeout(apercu, 1000);
    return r;
  };

  // Côté client : logo, nom, téléphone et adresse du transporteur en haut du suivi
  async function ligneEntreprise(t) {
    if (t.querySelector('.ent')) return;
    var zone = el('div', 'ent');
    t.prepend(zone);
    var k = t.querySelector('.code'); if (!k) return;
    var o = await db.rpc('entreprise_info', { p_code: k.textContent });
    if (o.error || !o.data || !(o.data.nom || o.data.logo)) return;
    var e = o.data;
    zone.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line)';
    if (e.logo) {
      var im = document.createElement('img');
      im.src = urlLogo(e); im.alt = 'Logo de ' + e.nom;
      im.style.cssText = 'width:52px;height:52px;object-fit:contain;border-radius:10px;flex:none';
      zone.appendChild(im);
    }
    var tx = el('div'); tx.appendChild(el('strong', '', e.nom));
    if (e.contact) {
      var p = el('div', 'small', '📞 ');
      if (/^[+\d\s().-]{6,20}$/.test(e.contact)) {
        var a = el('a', '', e.contact); a.href = 'tel:' + e.contact.replace(/[^\d+]/g, ''); a.style.color = 'inherit';
        p.appendChild(a);
      } else { p.appendChild(document.createTextNode(e.contact)); }
      tx.appendChild(p);
    }
    if (e.adresse) tx.appendChild(el('div', 'small', '📍 ' + e.adresse));
    zone.appendChild(tx);
    [].slice.call(t.querySelectorAll('.small')).forEach(function (s) {
      if (s.textContent.indexOf('Transporteur : ') === 0) s.remove();
    });
  }
  new MutationObserver(function () {
    document.querySelectorAll('#res .track').forEach(ligneEntreprise);
  }).observe(document.getElementById('res'), { childList: true, subtree: true });

  // ----- QR code : étiquette à imprimer + actions rapides après scan -----
  function lienSuivi(c) { return location.origin + location.pathname + '?code=' + c.code; }

  function chargerQR() {
    return new Promise(function (ok, ko) {
      if (window.qrcode) return ok();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload = ok;
      s.onerror = function () { ko(new Error('Impossible de charger le générateur de QR code. Vérifiez votre connexion.')); };
      document.head.appendChild(s);
    });
  }

  function dessinerQR(texte, px) {
    var q = qrcode(0, 'M'); q.addData(texte); q.make();
    var n = q.getModuleCount(), m = 2, NS = 'http://www.w3.org/2000/svg', chemin = '';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m));
    svg.setAttribute('width', px); svg.setAttribute('height', px);
    var fond = document.createElementNS(NS, 'rect');
    fond.setAttribute('width', '100%'); fond.setAttribute('height', '100%'); fond.setAttribute('fill', '#fff');
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (q.isDark(r, c)) chemin += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    }
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', chemin); p.setAttribute('fill', '#000'); p.setAttribute('shape-rendering', 'crispEdges');
    svg.appendChild(fond); svg.appendChild(p);
    return svg;
  }

  function etiquette(c) {
    var m = (user && user.user_metadata) || {};
    var d = document.createElement('div');
    d.style.cssText = 'box-sizing:border-box;width:300px;margin:8px auto;padding:14px;border:2px solid #000;border-radius:8px;background:#fff;color:#000;text-align:center;font-family:Arial,sans-serif';
    var t = el('div', '', m.nom || 'Sabali'); t.style.cssText = 'font-weight:bold;font-size:16px;margin-bottom:8px';
    var q = document.createElement('div'); q.appendChild(dessinerQR(lienSuivi(c), 220));
    var k = el('div', '', c.code); k.style.cssText = 'font-family:monospace;font-weight:bold;font-size:26px;letter-spacing:2px;margin-top:6px';
    var s = el('div', '', 'Scannez pour suivre votre colis'); s.style.cssText = 'font-size:12px;margin-top:4px';
    var dest = el('div', '', [c.destinataire, c.ville].filter(Boolean).join(' · ')); dest.style.cssText = 'font-size:13px;font-weight:bold;margin-top:6px';
    [t, q, k, s, dest].forEach(function (x) { d.appendChild(x); });
    return d;
  }

  function imprimer(noeud) {
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    var d = f.contentDocument;
    d.body.style.margin = '0';
    d.body.appendChild(d.importNode(noeud, true));
    f.contentWindow.onafterprint = function () { f.remove(); };
    setTimeout(function () { f.remove(); }, 120000);
    f.contentWindow.focus(); f.contentWindow.print();
  }

  async function ouvrirEtiquette(c) {
    var d = dlg('Étiquette du colis ' + c.code);
    var bf = el('button', 'go alt', 'Fermer'); bf.onclick = function () { d.close(); };
    try { await chargerQR(); } catch (x) { d.appendChild(msg(x.message)); d.appendChild(bf); d.showModal(); return; }
    var p = el('p', 'small', 'Imprimez cette étiquette et collez-la sur le colis. Le client la scanne avec l’appareil photo de son téléphone.');
    var bi = el('button', 'go', 'Imprimer'); bi.onclick = function () { imprimer(etiquette(c)); };
    [p, etiquette(c), bi, bf].forEach(function (x) { d.appendChild(x); });
    d.showModal();
  }

  function boutonsQR() {
    document.querySelectorAll('#list .track').forEach(function (card) {
      var a = card.querySelector('.acts'), k = card.querySelector('.code');
      if (!a || !k || a.querySelector('.qr')) return;
      var c = colis.filter(function (x) { return x.code === k.textContent; })[0];
      if (!c) return;
      var b = el('button', 'qr', 'Étiquette QR');
      b.onclick = function () { ouvrirEtiquette(c); };
      a.appendChild(b);
    });
  }
  new MutationObserver(boutonsQR).observe(document.getElementById('list'), { childList: true, subtree: true });
  boutonsQR();

  // Après un scan : le transporteur connecté voit des boutons d'action sous le suivi
  function actionsScan(force) {
    document.querySelectorAll('#res .track').forEach(function (t) {
      var ex = t.querySelector('.scan');
      if (ex && !force) return;
      if (ex) ex.remove();
      var k = t.querySelector('.code');
      if (!k || !user) return;
      var c = colis.filter(function (x) { return x.code === k.textContent; })[0];
      if (!c) return;
      var box = el('div', 'scan'), er = el('div'), acts = el('div', 'acts'), st = stepsFor(c);
      box.style.cssText = 'margin-top:14px;padding:12px;border:2px dashed var(--gold);border-radius:12px';
      box.appendChild(el('strong', '', 'Ce colis est à vous'));
      box.appendChild(el('div', 'small', 'Statut actuel : ' + st[c.etape]));
      var v = c.voyage_id ? voyages.filter(function (x) { return x.id === c.voyage_id; })[0] : null;
      var fin = async function () { await load(); $('q').value = c.code; find(); };
      if (v) {
        box.appendChild(el('div', 'small', 'Voyage : ' + v.nom + ' · ' + VSTEPS[v.etape]));
        if (c.etape === 6) {
          box.appendChild(el('div', 'small', 'Ce colis a été remis.'));
        } else if (v.etape === 5) {
          var rb = el('button', 'next', 'Remis');
          rb.onclick = async function () { rb.disabled = true; await vcall('marquer_remis', { p_colis: c.id }); fin(); };
          acts.appendChild(rb);
        } else {
          box.appendChild(el('div', 'small', 'Faites avancer le voyage depuis votre espace transporteur.'));
        }
      } else if (c.etape < st.length - 1) {
        var nb = el('button', 'next', 'Passer à : ' + st[c.etape + 1]);
        nb.onclick = async function () {
          nb.disabled = true;
          var o = await db.rpc('avancer_colis', { p_colis: c.id });
          if (o.error) { er.textContent = ''; er.appendChild(msg(o.error.message)); nb.disabled = false; return; }
          fin();
        };
        acts.appendChild(nb);
      } else {
        box.appendChild(el('div', 'small', 'Ce colis est livré.'));
      }
      box.appendChild(acts); box.appendChild(er);
      t.appendChild(box);
    });
  }
  new MutationObserver(function () { actionsScan(false); }).observe(document.getElementById('res'), { childList: true, subtree: true });
  var _draw = draw;
  draw = function () { _draw(); actionsScan(true); };
})();
