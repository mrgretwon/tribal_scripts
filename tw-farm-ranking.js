/*!
 * Ranking farmy plemienia -> BBCode (Plemiona / Tribal Wars)
 * ----------------------------------------------------------
 * Skrypt do paska skrotow (quickbar). Po kliknieciu pyta o tag plemienia,
 * pobiera dzienny ranking farmy jego czlonkow i generuje gotowy kod BBCode
 * (tabela owinieta w spoiler) do wklejenia na forum.
 *
 * Wdrozenie:
 *   1. Wrzuc ten plik pod publiczny URL (np. GitHub Pages).
 *   2. Dodaj przycisk quickbara z adresem:
 *      javascript:$.getScript('https://TWOJ-HOST/tw-farm-ranking.js');void(0);
 *
 * Skrypt jest READ-ONLY: czyta tylko publiczny eksport (/map/*.txt) oraz
 * strony rankingu w grze; nie wykonuje zadnych akcji w grze.
 */
(function () {
  'use strict';

  var CFG = {
    mode: 'in_a_day',          // ranking "Dzienne"
    typeRes: 'loot_res',       // Zrabowane surowce
    typeVil: 'loot_vil',       // Splradowane wioski (liczba zrabowanych wiosek)
    concurrency: 2,            // ile zapytan rownolegle (lagodnie dla serwera)
    delayMs: 250,              // odstep miedzy zapytaniami danego watku
    maxTries: 4,               // proby pobrania jednego wiersza (retry z backoffem)
    lsKey: 'twFarmRankingLastTag',
    rankTableId: 'in_a_day_ranking_table'
  };

  // ===================== czyste funkcje pomocnicze =====================

  // Pole eksportu jest URL-encoded (spacje jako '+' lub %20, znaki jako %XX/UTF-8).
  function decodeField(s) {
    s = String(s == null ? '' : s).replace(/\+/g, ' ');
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }
  // "84.978" / "84<span>.</span>978" -> 84978
  function toInt(s) {
    var d = String(s == null ? '' : s).replace(/[^\d]/g, '');
    return d ? parseInt(d, 10) : 0;
  }
  // 646447 -> "646.447" (separator tysiecy = kropka)
  function groupDot(n) {
    return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  // stosunek surowce/punkty, 1 miejsce po przecinku (przecinek dziesietny); '—' gdy brak punktow
  function ratio(wynik, points) {
    return (points > 0) ? (wynik / points).toFixed(1).replace('.', ',') : '—';
  }
  function todayPl() {
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  // ===================== dane: eksport /map/*.txt =====================

  // ally.txt: id,name,tag,members,villages,points,all_points,rank
  function findAlly(allyTxt, tag) {
    var want = String(tag).trim().toLowerCase();
    var lines = allyTxt.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var f = lines[i].split(',');
      if (decodeField(f[2]).toLowerCase() === want) {
        return { id: f[0], name: decodeField(f[1]), tag: decodeField(f[2]) };
      }
    }
    return null;
  }
  // player.txt: id,name,ally_id,villages,points,rank
  function membersOf(playerTxt, allyId) {
    var out = [], lines = playerTxt.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var f = lines[i].split(',');
      if (f[2] === allyId) out.push({ name: decodeField(f[1]), points: toInt(f[4]) });
    }
    return out;
  }

  // ===================== dane: wiersz rankingu =====================

  // Zwraca {ranking, tribe, wynik, data} dla dokladnie pasujacej nazwy,
  // null gdy brak rekordu, lub {error:'no_table'} gdy strona bez tabeli.
  function extractRow(html, name) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var tbl = doc.getElementById(CFG.rankTableId);
    if (!tbl) return { error: 'no_table' };
    var want = String(name).trim().toLowerCase();
    var rows = tbl.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i].querySelector('a[href*="info_player"]');
      if (!a) continue;
      if (a.textContent.trim().toLowerCase() === want) {
        var td = rows[i].querySelectorAll('td');
        var allyA = rows[i].querySelector('a[href*="info_ally"]');
        return {
          ranking: toInt(td[0] && td[0].textContent),
          tribe: allyA ? allyA.textContent.trim() : '',
          wynik: toInt(td[3] && td[3].textContent),
          data: td[4] ? td[4].textContent.trim() : ''
        };
      }
    }
    return null;
  }

  // ===================== siec =====================

  function getText(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + url);
      return r.text();
    });
  }
  function rankingUrl(type, name) {
    var vid = (window.game_data && game_data.village && game_data.village.id)
      ? ('village=' + game_data.village.id + '&') : '';
    return '/game.php?' + vid + 'screen=ranking&mode=' + CFG.mode +
      '&type=' + type + '&name=' + encodeURIComponent(name);
  }
  function looksLikeBot(html) { return /bot_protection|botprotection|Wykryto bota|g-recaptcha|captcha/i.test(html); }

  // Pobiera i parsuje wiersz danego typu rankingu dla gracza, z retry/backoff.
  // Zwraca: obiekt wiersza | null (tabela jest, ale brak rekordu = prawdziwe 0)
  // Rzuca po wyczerpaniu prob (no_table/HTTP/bot = przejsciowy throttling).
  function fetchRow(type, name) {
    var attempt = function (k) {
      return getText(rankingUrl(type, name)).then(function (html) {
        if (looksLikeBot(html)) throw new Error('bot_check');
        var row = extractRow(html, name);
        if (row && row.error) throw new Error(row.error); // no_table -> retry (throttling)
        return row;                                       // wiersz lub null (prawdziwy brak)
      }).catch(function (e) {
        if (k < CFG.maxTries) {
          return new Promise(function (res) { setTimeout(res, 250 * k + 150); }).then(function () { return attempt(k + 1); });
        }
        throw e;
      });
    };
    return attempt(1);
  }

  // Pula zadan z ograniczona rownoleglos­cia i opoznieniem.
  function pool(items, worker, onProgress) {
    var results = new Array(items.length), done = 0, next = 0;
    if (!items.length) return Promise.resolve(results);
    var lanes = Math.min(CFG.concurrency, items.length);
    var runner = function () {
      if (next >= items.length) return Promise.resolve();
      var i = next++;
      return Promise.resolve().then(function () { return worker(items[i], i); })
        .then(function (r) { results[i] = r; }, function (e) { results[i] = { error: String((e && e.message) || e) }; })
        .then(function () {
          done++; if (onProgress) onProgress(done, items.length);
          return new Promise(function (res) { setTimeout(res, CFG.delayMs); }).then(runner);
        });
    };
    var starts = [];
    for (var k = 0; k < lanes; k++) starts.push(runner());
    return Promise.all(starts).then(function () { return results; });
  }

  // ===================== logika glowna =====================

  // Sortowanie farmiacych (malejaco):
  //  'ratio'    = wg stosunku surowce/punkty (0 pkt na koniec)
  //  'villages' = wg splradowanych wiosek (nieudane pobranie '?' na koniec)
  //  inne       = wg zrabowanych surowcow
  function sortFarmers(rows, sortBy) {
    if (sortBy === 'ratio') {
      rows.sort(function (a, b) {
        var ra = (a.points > 0) ? a.wynik / a.points : -1;
        var rb = (b.points > 0) ? b.wynik / b.points : -1;
        return rb - ra;
      });
    } else if (sortBy === 'villages') {
      rows.sort(function (a, b) {
        return (b.villages == null ? -1 : b.villages) - (a.villages == null ? -1 : a.villages);
      });
    } else {
      rows.sort(function (a, b) { return b.wynik - a.wynik; });
    }
  }

  // generate(tag, onProgress, sortBy) -> Promise<{ bbcode, warnings }>
  function generate(tag, onProgress, sortBy) {
    tag = String(tag || '').trim();
    if (!tag) return Promise.reject(new Error('Pusty tag plemienia.'));
    var ally, members, farmers = [], warnings = [];

    return Promise.all([getText('/map/ally.txt'), getText('/map/player.txt')])
      .then(function (res) {
        ally = findAlly(res[0], tag);
        if (!ally) throw new Error('Nie znaleziono plemienia o tagu "' + tag + '".');
        members = membersOf(res[1], ally.id);
        if (!members.length) throw new Error('Plemie "' + tag + '" nie ma czlonkow w eksporcie.');

        if (onProgress) onProgress(0, members.length, 'Zrabowane surowce');
        return pool(members, function (m) {
          return fetchRow(CFG.typeRes, m.name);
        }, function (d, t) { if (onProgress) onProgress(d, t, 'Zrabowane surowce'); });
      })
      .then(function (resRows) {
        if (resRows.length && resRows.every(function (r) { return r && r.error; })) {
          throw new Error('Nie udalo sie pobrac rankingu (mozliwa kontrola bota lub wylogowanie). Odswiez gre i sprobuj ponownie.');
        }
        members.forEach(function (m, i) {
          var r = resRows[i];
          if (r && r.error) { warnings.push('Surowce: nie pobrano dla ' + m.name); return; }
          if (r && r.wynik > 0) {
            farmers.push({ name: m.name, points: m.points, ranking: r.ranking, wynik: r.wynik, data: r.data, tribe: r.tribe || tag, villages: 0 });
          }
        });
        if (!farmers.length) throw new Error('Zaden czlonek plemienia "' + tag + '" nie ma dzis rekordu farmy.');

        if (onProgress) onProgress(0, farmers.length, 'Spladrowane wioski');
        return pool(farmers, function (f) {
          return fetchRow(CFG.typeVil, f.name);
        }, function (d, t) { if (onProgress) onProgress(d, t, 'Spladrowane wioski'); });
      })
      .then(function (vilRows) {
        farmers.forEach(function (f, i) {
          var r = vilRows[i];
          if (r && r.error) { f.villages = null; warnings.push('Wioski: nie pobrano dla ' + f.name); }
          else { f.villages = r ? r.wynik : 0; }
        });
        sortFarmers(farmers, sortBy);
        return { bbcode: buildBBCode(tag, farmers), warnings: warnings };
      });
  }

  // Skladnia tabeli forum Plemion (potwierdzona na dzialajacym poscie):
  // - naglowek: [**] cela [||] cela ... [/**]  (komorki przez [||], wiersz ZAMKNIETY [/**])
  // - wiersze: [*] cela [|] cela ...           (komorki przez [|], wiersz zaczyna [*])
  // - [player]nick[/player], [ally]TAG[/ally] -> klikalne linki gracza/plemienia
  function buildBBCode(tag, rows) {
    var head = '[b]Ranking farmy ' + tag + ' — aktualny na dzien ' + todayPl() + '[/b]';
    var header = '[**] LP [||] Ranking [||] Gracz [||] Plemie [||] Wynik [||] Spladrowane wioski [||] Punkty [||] Stosunek farma/pkt [||] Data [/**]';
    var body = rows.map(function (r, i) {
      return '[*] [b]' + (i + 1) + '[/b]' +
        ' [|] ' + groupDot(r.ranking) +
        ' [|] [player]' + r.name + '[/player]' +
        ' [|] [ally]' + (r.tribe || tag) + '[/ally]' +
        ' [|] [b]' + groupDot(r.wynik) + '[/b]' +
        ' [|] ' + (r.villages == null ? '?' : groupDot(r.villages)) +
        ' [|] ' + groupDot(r.points || 0) +
        ' [|] ' + ratio(r.wynik, r.points || 0) +
        ' [|] ' + (r.data || '');
    }).join('');
    return '[spoiler=' + tag + ']\n' + head + '\n[table]\n' + header + body + '\n[/table]\n[/spoiler]';
  }

  // ===================== UI =====================

  function closeModal() { var e = document.getElementById('twfr-overlay'); if (e) e.parentNode.removeChild(e); }
  function modal(innerHtml) {
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'twfr-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#f4e4bc;border:2px solid #804000;border-radius:6px;max-width:680px;width:92%;max-height:85vh;overflow:auto;padding:16px;font-family:Verdana,Arial,sans-serif;font-size:13px;color:#5c3317;box-shadow:0 8px 30px rgba(0,0,0,.5);';
    box.innerHTML = innerHtml;
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
    return box;
  }
  function setStatus(html) { var s = document.getElementById('twfr-status'); if (s) s.innerHTML = html; }

  function openUI() {
    var last = '', lastSort = 'res';
    try { last = localStorage.getItem(CFG.lsKey) || ''; lastSort = localStorage.getItem(CFG.lsKey + '_sort') || 'res'; } catch (e) {}
    var box = modal(
      '<h3 style="margin:0 0 10px">Ranking farmy → BBCode</h3>' +
      '<label>Tag plemienia:<br><input id="twfr-tag" type="text" value="' + escapeAttr(last) + '" style="width:220px;padding:5px;margin-top:4px;border:1px solid #804000;border-radius:3px"></label>' +
      '<div style="margin-top:10px"><label>Sortuj wg:<br>' +
      '<select id="twfr-sort" style="margin-top:4px;padding:4px;border:1px solid #804000;border-radius:3px">' +
      '<option value="res"' + (lastSort === 'res' ? ' selected' : '') + '>Zrabowane surowce</option>' +
      '<option value="villages"' + (lastSort === 'villages' ? ' selected' : '') + '>Splądrowane wioski</option>' +
      '<option value="ratio"' + (lastSort === 'ratio' ? ' selected' : '') + '>Stosunek farma/pkt</option>' +
      '</select></label></div>' +
      '<div style="margin-top:12px"><button id="twfr-go" class="btn">Generuj</button> &nbsp;<button id="twfr-cancel" class="btn">Anuluj</button></div>' +
      '<div id="twfr-status" style="margin-top:12px;min-height:20px"></div>'
    );
    var tagInput = box.querySelector('#twfr-tag');
    tagInput.focus();
    box.querySelector('#twfr-cancel').onclick = closeModal;
    var go = function () {
      var tag = tagInput.value.trim();
      var sortBy = box.querySelector('#twfr-sort').value;
      if (!tag) { setStatus('Podaj tag plemienia.'); return; }
      try { localStorage.setItem(CFG.lsKey, tag); localStorage.setItem(CFG.lsKey + '_sort', sortBy); } catch (e) {}
      box.querySelector('#twfr-go').disabled = true;
      runUI(tag, sortBy);
    };
    box.querySelector('#twfr-go').onclick = go;
    tagInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  function runUI(tag, sortBy) {
    setStatus('Pobieram dane…');
    generate(tag, function (d, t, phase) {
      setStatus('[' + phase + '] ' + d + ' / ' + t + ' graczy…');
    }, sortBy).then(function (out) { showResult(out.bbcode, out.warnings); }).catch(function (err) {
      setStatus('<b style="color:#a00">Blad:</b> ' + escapeHtml((err && err.message) || String(err)) +
        '<br><button id="twfr-go" class="btn" style="margin-top:8px">Sprobuj ponownie</button>');
      var b = document.getElementById('twfr-go'); if (b) b.onclick = openUI;
    });
  }

  function showResult(bbcode, warnings) {
    try { console.log('[TWFarmRanking]\n' + bbcode); } catch (e) {}
    var warnHtml = (warnings && warnings.length)
      ? '<div style="margin:0 0 8px;color:#a00;font-size:12px">Uwaga: nie udalo sie pobrac ' + warnings.length +
        ' wartosci (oznaczone "?"). Mozesz wygenerowac ponownie.</div>'
      : '';
    var box = modal(
      '<h3 style="margin:0 0 10px">Gotowy kod BBCode</h3>' + warnHtml +
      '<textarea id="twfr-out" readonly style="width:100%;height:320px;font-family:monospace;font-size:12px;box-sizing:border-box"></textarea>' +
      '<div style="margin-top:10px"><button id="twfr-copy" class="btn">Kopiuj do schowka</button> &nbsp;<button id="twfr-close" class="btn">Zamknij</button> <span id="twfr-copied" style="margin-left:8px;color:#070"></span></div>'
    );
    var ta = box.querySelector('#twfr-out');
    ta.value = bbcode;
    box.querySelector('#twfr-close').onclick = closeModal;
    box.querySelector('#twfr-copy').onclick = function () {
      var ok = function () { box.querySelector('#twfr-copied').textContent = 'Skopiowano ✓'; };
      var fallback = function () { ta.focus(); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(bbcode).then(ok, fallback);
      } else { fallback(); }
    };
  }

  // ===================== eksport / autostart =====================

  window.TWFarmRanking = {
    generate: generate,
    buildBBCode: buildBBCode,
    open: openUI,
    _internal: { findAlly: findAlly, membersOf: membersOf, extractRow: extractRow, groupDot: groupDot, toInt: toInt, decodeField: decodeField, sortFarmers: sortFarmers, ratio: ratio }
  };

  openUI();
})();
