/* Caja · núcleo sin pantalla: categorías, fechas, dinero, CSV, suscripciones y patrimonio.
   Los importes van siempre en céntimos (enteros) para no arrastrar errores de decimales. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CajaCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.3.0';

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
     si sale en contra, a gastos. Así el % invertido y «en qué se va» no se inflan con lo que entra y sale. */
  function resumenMes(list, jids) {
    var o = { gasto: 0, ingreso: 0, inversion: 0, juego: { cats: {}, metido: 0, sacado: 0, neto: 0, n: 0 } };
    list.forEach(function (m) {
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

  /* ---------- Suscripciones: se apuntan solas como gasto el día de cobro ---------- */
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
          var m = { id: uid(), fecha: f, tipo: 'gasto', cat: s.trabajo ? 'trabajo' : 'suscripciones', importe: s.importe,
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

  /* ---------- Patrimonio ----------
     Cada cuenta guarda su último saldo real (saldo, fecha, ts). Desde ahí se mueve sola:
     - la cuenta del día a día (principal): + ingresos, − gastos, − aportaciones;
     - cada cuenta de inversión: + las aportaciones que van a ella;
     - cualquier cuenta: + lo que se mueve a ella y − lo que sale de ella (tipo «traspaso», v1.3).
     Un traspaso «traspaso-todo» (vendido todo / cuenta vaciada) deja la cuenta de origen a 0 en ese momento,
     como un saldo real: lo ganado o perdido en el mercado se ajusta solo. Si se borra, vuelve el saldo anterior.
     Un movimiento cuenta si es posterior al saldo real: fecha mayor, o el mismo día pero apuntado después. */
  function after(m, base) {
    return m.fecha > base.fecha || (m.fecha === base.fecha && (m.creado || 0) > (base.ts || 0));
  }
  function vacia(m) { return m.tipo === 'traspaso' && m.cat === 'traspaso-todo'; }
  function baseOf(state, c) {
    var b = { saldo: c.saldo || 0, fecha: c.fecha, ts: c.ts };
    state.movs.forEach(function (m) {
      if (vacia(m) && m.origen === c.id && after(m, b)) b = { saldo: 0, fecha: m.fecha, ts: m.creado || startOfDay(m.fecha) };
    });
    return b;
  }
  function saldoActual(state, c) {
    var b = baseOf(state, c), v = b.saldo;
    state.movs.forEach(function (m) {
      if (!after(m, b)) return;
      if (m.tipo === 'traspaso') {
        if (m.cuenta === c.id) v += m.importe;
        if (m.origen === c.id) v -= m.importe;
      } else if (c.tipo === 'inversion') {
        if (m.tipo === 'inversion' && m.cuenta === c.id) v += m.importe;
      } else if (c.principal) {
        if (m.tipo === 'ingreso') v += m.importe;
        else if (m.tipo === 'gasto' || m.tipo === 'inversion') v -= m.importe;
      }
    });
    return v;
  }
  function patrimonio(state) {
    var liq = 0, inv = 0;
    var cuentas = state.cuentas.map(function (c) {
      var v = saldoActual(state, c);
      if (c.tipo === 'inversion') inv += v; else liq += v;
      return { c: c, v: v };
    });
    return { total: liq + inv, liquidez: liq, invertido: inv, cuentas: cuentas };
  }

  return {
    VERSION: VERSION, DEF_CATS: DEF_CATS, catsOf: catsOf, catMap: catMap, juegoIds: juegoIds, COLS: COLS,
    pad2: pad2, iso: iso, today: today, parse: parse, dim: dim, addDays: addDays, diffDays: diffDays,
    startOfDay: startOfDay, monthKey: monthKey,
    parseEur: parseEur, fmtCsvEur: fmtCsvEur, parseCsvEur: parseCsvEur,
    movsToCsv: movsToCsv, parseCsv: parseCsv, csvToMovs: csvToMovs, configDoc: configDoc,
    movsMes: movsMes, totales: totales, resumenMes: resumenMes,
    chargeDates: chargeDates, materialize: materialize, nextCharge: nextCharge, monthlyEq: monthlyEq,
    after: after, vacia: vacia, baseOf: baseOf, saldoActual: saldoActual, patrimonio: patrimonio
  };
});
