/* Caja · núcleo sin pantalla: categorías, fechas, dinero, CSV, suscripciones y patrimonio.
   Los importes van siempre en céntimos (enteros) para no arrastrar errores de decimales. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CajaCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.5.0';

  /* Categorías por defecto, genéricas. Las de cada persona viven en config.json de su repositorio privado
     (cats.gasto / cats.ingreso): así nada personal queda en este código, que es público.
     Una categoría con juego: true se lleva aparte (metido, sacado y resultado) y cuenta en neto. */
  var DEF_CATS = {
    gasto: [
      { id: 'comidas', n: 'Comidas', i: 'utensils' },
      { id: 'ocio', n: 'Ocio', i: 'ticket' },
      { id: 'coche', n: 'Coche', i: 'car' },
      { id: 'deporte', n: 'Deporte', i: 'pulse' },
      { id: 'salud', n: 'Salud', i: 'pill' },
      { id: 'casa', n: 'Casa', i: 'home' },
      { id: 'caprichos', n: 'Caprichos', i: 'sparkles' },
      { id: 'trabajo', n: 'Trabajo', i: 'laptop' },
      { id: 'excepcionales', n: 'Excepcionales', i: 'star' },
      { id: 'otros', n: 'Otros', i: 'dots' }
    ],
    ingreso: [
      { id: 'nomina', n: 'Nómina', i: 'briefcase' },
      { id: 'otros-ingresos', n: 'Otros', i: 'dots' }
    ]
  };
  /* Categorías que pone la propia app (y alguna antigua, para que los datos viejos se sigan leyendo). */
  var FIXED = {
    suscripciones: { n: 'Suscripciones', i: 'repeat' },
    aportacion: { n: 'Aportación', i: 'trend' },
    traspaso: { n: 'Entre tus cuentas', i: 'swap' },
    'traspaso-todo': { n: 'Entre tus cuentas', i: 'swap' },
    extra: { n: 'Extra', i: 'plus' },
    gasolina: { n: 'Gasolina', i: 'fuel' }
  };
  function catsOf(state) {
    var c = state && state.cats;
    return {
      gasto: c && c.gasto && c.gasto.length ? c.gasto : DEF_CATS.gasto,
      ingreso: c && c.ingreso && c.ingreso.length ? c.ingreso : DEF_CATS.ingreso
    };
  }
  function catMap(state) {
    var m = {}, cs = catsOf(state);
    Object.keys(FIXED).forEach(function (k) { m[k] = { n: FIXED[k].n, i: FIXED[k].i, juego: false }; });
    cs.gasto.concat(cs.ingreso).forEach(function (c) { m[c.id] = { n: c.n, i: c.i, juego: !!c.juego }; });
    return m;
  }
  function juegoIds(state) {
    var ids = [], cs = catsOf(state);
    cs.gasto.concat(cs.ingreso).forEach(function (c) { if (c.juego && ids.indexOf(c.id) < 0) ids.push(c.id); });
    return ids;
  }

  /* ---------- Fechas (siempre 'AAAA-MM-DD' en hora local) ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function today() { return iso(new Date()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dim(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((parse(a) - parse(b)) / 86400000); }
  function startOfDay(s) { return parse(s).getTime(); }
  function monthKey(f) { return f.slice(0, 7); }

  /* ---------- Dinero ---------- */
  function parseEur(v) {
    v = String(v == null ? '' : v).trim().replace(/\s|€/g, '');
    if (!v) return 0;
    if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ''); // «2.100» son 2.100 €, no 2,10 €
    var n = parseFloat(v);
    return isNaN(n) ? 0 : Math.round(n * 100);
  }
  function fmtCsvEur(c) {
    var neg = c < 0; c = Math.abs(Math.round(c));
    return (neg ? '-' : '') + Math.floor(c / 100) + ',' + pad2(c % 100);
  }
  function parseCsvEur(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return 0;
    var neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
    var p = s.replace(/\./g, '').split(',');
    var e = parseInt(p[0] || '0', 10) || 0;
    var c = p[1] ? parseInt((p[1] + '0').slice(0, 2), 10) || 0 : 0;
    return (neg ? -1 : 1) * (e * 100 + c);
  }

  /* ---------- CSV del mes (separador ';' y coma decimal, como lo abre Sheets en español) ---------- */
  /* «origen» va al final (v1.3): los CSV anteriores, sin esa columna, se siguen leyendo igual. */
  var COLS = ['id', 'fecha', 'tipo', 'categoria', 'importe', 'nota', 'cuenta', 'suscripcion', 'creado', 'origen'];
  function byFechaCreado(a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return (a.creado || 0) - (b.creado || 0);
  }
  function csvCell(v) {
    v = v == null ? '' : String(v);
    return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function movsToCsv(list) {
    var rows = [COLS.join(';')];
    list.slice().sort(byFechaCreado).forEach(function (m) {
      rows.push([m.id, m.fecha, m.tipo, m.cat, fmtCsvEur(m.importe), m.nota || '', m.cuenta || '', m.sub || '',
        new Date(m.creado || startOfDay(m.fecha)).toISOString(), m.origen || ''].map(csvCell).join(';'));
    });
    return rows.join('\n') + '\n';
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false, ch;
    for (var i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ';') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function csvToMovs(text) {
    var rows = parseCsv(String(text || '').replace(/^﻿/, ''));
    if (!rows.length) return [];
    var idx = {};
    rows[0].forEach(function (k, i) { idx[k.trim()] = i; });
    return rows.slice(1).filter(function (r) { return r.length > 1 && r[idx.id]; }).map(function (r) {
      function g(k) { return idx[k] == null ? '' : (r[idx[k]] || ''); }
      var m = { id: g('id'), fecha: g('fecha'), tipo: g('tipo'), cat: g('categoria'), importe: parseCsvEur(g('importe')),
        nota: g('nota'), creado: Date.parse(g('creado')) || startOfDay(g('fecha')) };
      if (g('cuenta')) m.cuenta = g('cuenta');
      if (g('suscripcion')) m.sub = g('suscripcion');
      if (g('origen')) m.origen = g('origen');
      return m;
    });
  }
  function configDoc(state) {
    var d = { v: 2, app: 'caja' };
    if (state.cats) d.cats = state.cats;
    d.cuentas = state.cuentas; d.subs = state.subs; d.saldos = state.saldos;
    return JSON.stringify(d, null, 2) + '\n';
  }

  /* ---------- Totales del mes ---------- */
  function movsMes(state, ym) { return state.movs.filter(function (m) { return m.fecha.slice(0, 7) === ym; }); }
  function totales(list) {
    var o = { gasto: 0, ingreso: 0, inversion: 0 };
    list.forEach(function (m) { if (o[m.tipo] != null) o[m.tipo] += m.importe; });
    return o;
  }

  /* Resumen del mes: el juego cuenta en neto (lo sacado menos lo metido). Si sale a favor suma a ingresos;
     si sale en contra, a gastos. Así el % invertido y «en qué se va» no se inflan con lo que entra y sale.
     Con las cuentas (v1.4), un traspaso cuenta como invertido si va de la liquidez (o de la cuenta del día a día)
     a una cuenta de inversión, y resta si vuelve. Comprar o vender dentro de una misma cuenta no cuenta. */
  function resumenMes(list, jids, cuentas) {
    var o = { gasto: 0, ingreso: 0, inversion: 0, juego: { cats: {}, metido: 0, sacado: 0, neto: 0, n: 0 } };
    list.forEach(function (m) {
      if (m.tipo === 'traspaso') { if (cuentas) o.inversion += flujo(m, cuentas) * m.importe; return; }
      if (jids && jids.indexOf(m.cat) >= 0 && (m.tipo === 'gasto' || m.tipo === 'ingreso')) {
        var j = o.juego.cats[m.cat] || (o.juego.cats[m.cat] = { metido: 0, sacado: 0 });
        if (m.tipo === 'gasto') { j.metido += m.importe; o.juego.metido += m.importe; }
        else { j.sacado += m.importe; o.juego.sacado += m.importe; }
        o.juego.n++;
        return;
      }
      if (o[m.tipo] != null) o[m.tipo] += m.importe;
    });
    o.juego.neto = o.juego.sacado - o.juego.metido;
    if (o.juego.neto > 0) o.ingreso += o.juego.neto; else o.gasto -= o.juego.neto;
    return o;
  }

  /* ---------- Habituales: suscripciones (gasto) e ingresos habituales (v1.4) se apuntan solos el día que tocan ---------- */
  function chargeDates(s, from, to) {
    var out = [];
    if (!from || !to || from > to) return out;
    var a = parse(from), b = parse(to), y = a.getFullYear(), m = a.getMonth();
    while (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) {
      if (s.cada === 'mes' || s.mes === m + 1) {
        var f = y + '-' + pad2(m + 1) + '-' + pad2(Math.min(s.dia, dim(y, m)));
        if (f >= from && f <= to) out.push(f);
      }
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  /* Crea los cobros pendientes hasta hoy. hechoHasta evita volver a crear uno que Tomás haya borrado.
     El cobro de hoy se fecha «ahora» (cuenta frente a un saldo real puesto antes); los atrasados, a primera hora. */
  function materialize(state, nowIso, uid, nowTs) {
    if (nowTs == null) nowTs = Date.now();
    var created = [];
    state.subs.forEach(function (s) {
      var from = s.hechoHasta ? addDays(s.hechoHasta, 1) : s.desde;
      var to = nowIso;
      if (s.hasta && s.hasta < to) to = s.hasta;
      if (!from || from > to) return;
      chargeDates(s, from, to).forEach(function (f) {
        var exists = state.movs.some(function (m) { return m.sub === s.id && m.fecha === f; });
        if (!exists) {
          var ing = s.tipo === 'ingreso';
          var cat = ing ? (s.cat || (catsOf(state).ingreso[0] || {}).id || 'otros-ingresos') : (s.trabajo ? 'trabajo' : 'suscripciones');
          var m = { id: uid(), fecha: f, tipo: ing ? 'ingreso' : 'gasto', cat: cat, importe: s.importe,
            nota: s.nombre, sub: s.id, creado: f === nowIso ? nowTs : startOfDay(f) };
          state.movs.push(m); created.push(m);
        }
      });
      if (!s.hechoHasta || to > s.hechoHasta) s.hechoHasta = to;
    });
    return created;
  }
  function nextCharge(s, nowIso) {
    var t = parse(nowIso);
    for (var k = 0; k < 14; k++) {
      var mm = t.getMonth() + k, yy = t.getFullYear() + Math.floor(mm / 12); mm = mm % 12;
      if (s.cada === 'año' && s.mes !== mm + 1) continue;
      var d = new Date(yy, mm, Math.min(s.dia, dim(yy, mm)));
      if (d >= t) return d;
    }
    return null;
  }
  function monthlyEq(s) { return s.cada === 'mes' ? s.importe : s.importe / 12; }

  /* ---------- Patrimonio (v1.4) ----------
     Cada cuenta tiene efectivo y, si es de inversión (bróker), también invertido. Una cuenta de liquidez solo
     tiene efectivo. Un movimiento señala un «bolsillo»: «id» es el efectivo de la cuenta e «id:inv» lo invertido.
     - gasto e ingreso: efectivo de la cuenta del día a día (principal), sea de liquidez o un bróker;
     - traspaso: sale de un bolsillo y entra en otro (comprar = efectivo → invertido de la misma cuenta);
     - «inversion» (aportación antigua): del día a día al efectivo de la cuenta de inversión.
     Cada cuenta parte de su último saldo real: el que se pone a mano o el que deja Claude en auto.json (gana el
     más reciente). Un traspaso «traspaso-todo» deja su bolsillo de origen a 0 en ese momento.
     Un movimiento cuenta si es posterior al saldo: fecha mayor, o el mismo día pero apuntado después. */
  function after(m, base) {
    return m.fecha > base.fecha || (m.fecha === base.fecha && (m.creado || 0) > (base.ts || 0));
  }
  function later(a, b) { return a.fecha > b.fecha || (a.fecha === b.fecha && (a.ts || 0) > (b.ts || 0)); }
  function pk(ref) {
    ref = String(ref == null ? '' : ref);
    var i = ref.indexOf(':');
    return i < 0 ? { id: ref, part: 'ef' } : { id: ref.slice(0, i), part: ref.slice(i + 1) === 'inv' ? 'inv' : 'ef' };
  }
  function pref(id, part) { return part === 'inv' ? id + ':inv' : id; }
  function vacia(m) { return m.tipo === 'traspaso' && m.cat === 'traspaso-todo'; }
  function findC(state, id) { for (var i = 0; i < state.cuentas.length; i++) if (state.cuentas[i].id === id) return state.cuentas[i]; return null; }
  function principalId(state) { for (var i = 0; i < state.cuentas.length; i++) if (state.cuentas[i].principal) return state.cuentas[i].id; return null; }
  function esInv(c) { return !!c && c.tipo === 'inversion'; }

  /* Lo que añade Claude (auto.json): movimientos leídos del correo y saldos leídos de los brókeres.
     Una transferencia que Claude saca del correo (dedupe) no se cuenta si ya se apuntó a mano un traspaso o una
     aportación a esa cuenta por el mismo importe y a menos de 3 días. */
  function autoOf(state) { return state.auto || {}; }
  function allMovs(state) {
    var own = state.movs || [], extra = (autoOf(state).movs || []).filter(function (a) {
      if (!a || !a.id || !a.fecha) return false;
      if (!a.dedupe) return true;
      var dest = pk(a.cuenta).id;
      return !own.some(function (x) {
        return (x.tipo === 'traspaso' || x.tipo === 'inversion') && x.importe === a.importe && pk(x.cuenta).id === dest &&
          Math.abs(diffDays(x.fecha, a.fecha)) <= 3;
      });
    }).map(function (a) { var o = {}; for (var k in a) o[k] = a[k]; o.auto = true; o.creado = a.creado || startOfDay(a.fecha); return o; });
    return own.concat(extra);
  }
  /* Base de cada bolsillo: el saldo real puesto a mano o, si es más reciente, el que deja Claude. Un saldo de
     Claude puede traer solo uno de los dos (p. ej. solo «inv», el valor de los fondos): el otro bolsillo sigue
     saliendo de su base y de los movimientos, y así un movimiento apuntado tarde no se pierde. */
  function bases(state, c) {
    var inv = esInv(c), b = {
      ef: { v: inv ? (c.efectivo || 0) : (c.saldo || 0), fecha: c.fecha, ts: c.ts },
      inv: { v: inv ? (c.saldo || 0) : 0, fecha: c.fecha, ts: c.ts }
    };
    (autoOf(state).saldos || []).forEach(function (x) {
      if (!x || x.cuenta !== c.id || !x.fecha) return;
      ['ef', 'inv'].forEach(function (p) {
        if (typeof x[p] === 'number' && (p === 'ef' || inv) && later(x, b[p])) b[p] = { v: x[p], fecha: x.fecha, ts: x.ts || 0, fuente: x.fuente };
      });
    });
    return b;
  }
  function snapOf(state, c) {
    var b = bases(state, c), l = esInv(c) && later(b.inv, b.ef) ? b.inv : b.ef;
    return { fecha: l.fecha, ts: l.ts, fuente: l.fuente, ef: b.ef.v, inv: b.inv.v };
  }
  function efectos(m, princ) {
    var v = m.importe || 0;
    if (m.tipo === 'gasto') return princ ? [[princ, -v]] : [];
    if (m.tipo === 'ingreso') return princ ? [[princ, v]] : [];
    if (m.tipo === 'inversion') return (princ ? [[princ, -v]] : []).concat(m.cuenta ? [[pk(m.cuenta).id, v]] : []);
    if (m.tipo === 'traspaso') return [[m.origen, -v], [m.cuenta, v]];
    return [];
  }
  function saldos(state, c, movs) {
    movs = movs || allMovs(state);
    var bs = bases(state, c), princ = principalId(state), out = { ef: 0, inv: 0, snap: snapOf(state, c) };
    (esInv(c) ? ['ef', 'inv'] : ['ef']).forEach(function (part) {
      var b = { v: bs[part].v, fecha: bs[part].fecha, ts: bs[part].ts };
      movs.forEach(function (m) {
        if (!vacia(m)) return;
        var o = pk(m.origen);
        if (o.id === c.id && (esInv(c) ? o.part : 'ef') === part && after(m, b)) b = { v: 0, fecha: m.fecha, ts: m.creado || startOfDay(m.fecha) };
      });
      var v = b.v;
      movs.forEach(function (m) {
        if (!after(m, b)) return;
        efectos(m, princ).forEach(function (e) {
          var p = pk(e[0]);
          if (p.id === c.id && (esInv(c) ? p.part : 'ef') === part) v += e[1];
        });
      });
      out[part] = v;
    });
    out.v = out.ef + out.inv;
    return out;
  }
  function saldoActual(state, c) { return saldos(state, c).v; }
  function patrimonio(state) {
    var liq = 0, inv = 0, movs = allMovs(state);
    var cuentas = state.cuentas.map(function (c) {
      var x = saldos(state, c, movs);
      liq += x.ef; inv += x.inv;
      return { c: c, v: x.v, ef: x.ef, inv: x.inv, snap: x.snap };
    });
    return { total: liq + inv, liquidez: liq, invertido: inv, cuentas: cuentas };
  }
  /* +1 si el traspaso mete dinero en una cuenta de inversión desde la liquidez o el día a día, −1 si lo saca,
     0 si se queda dentro (comprar o vender en la misma cuenta, o entre cuentas del mismo tipo). */
  function flujo(m, cuentas) {
    if (m.tipo !== 'traspaso') return 0;
    var o = pk(m.origen).id, d = pk(m.cuenta).id;
    if (o === d) return 0;
    function inv(id) { for (var i = 0; i < cuentas.length; i++) if (cuentas[i].id === id) return cuentas[i].tipo === 'inversion' && !cuentas[i].principal; return false; }
    var a = inv(o), b = inv(d);
    return !a && b ? 1 : a && !b ? -1 : 0;
  }

  return {
    VERSION: VERSION, DEF_CATS: DEF_CATS, catsOf: catsOf, catMap: catMap, juegoIds: juegoIds, COLS: COLS,
    pad2: pad2, iso: iso, today: today, parse: parse, dim: dim, addDays: addDays, diffDays: diffDays,
    startOfDay: startOfDay, monthKey: monthKey,
    parseEur: parseEur, fmtCsvEur: fmtCsvEur, parseCsvEur: parseCsvEur,
    movsToCsv: movsToCsv, parseCsv: parseCsv, csvToMovs: csvToMovs, configDoc: configDoc,
    movsMes: movsMes, totales: totales, resumenMes: resumenMes,
    chargeDates: chargeDates, materialize: materialize, nextCharge: nextCharge, monthlyEq: monthlyEq,
    after: after, later: later, pk: pk, pref: pref, vacia: vacia, principalId: principalId, allMovs: allMovs,
    snapOf: snapOf, saldos: saldos, saldoActual: saldoActual, patrimonio: patrimonio, flujo: flujo
  };
});
