'use strict';
const assert = require('assert');
const C = require(process.argv[2] || require('path').join(__dirname, '..', 'core.js'));
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }
let k = 0; const uid = () => 'id' + (++k);

t('dinero', () => {
  assert.strictEqual(C.parseEur('11,99'), 1199);
  assert.strictEqual(C.parseEur('11.99'), 1199);
  assert.strictEqual(C.parseEur('1.250,5 €'), 125050);
  assert.strictEqual(C.parseEur(''), 0);
  assert.strictEqual(C.fmtCsvEur(1250), '12,50');
  assert.strictEqual(C.fmtCsvEur(-5), '-0,05');
  assert.strictEqual(C.parseCsvEur('12,5'), 1250);
  assert.strictEqual(C.parseCsvEur('-0,05'), -5);
  assert.strictEqual(C.parseCsvEur('1400,00'), 140000);
});

t('csv ida y vuelta con notas raras', () => {
  const movs = [
    { id: 'a', fecha: '2026-10-08', tipo: 'gasto', cat: 'comidas', importe: 1250, nota: 'Menú; con "postre"', creado: Date.parse('2026-10-08T12:00:00Z') },
    { id: 'b', fecha: '2026-10-01', tipo: 'ingreso', cat: 'sueldo', importe: 140000, nota: 'Nómina\nseptiembre', creado: Date.parse('2026-10-01T08:00:00Z') },
    { id: 'c', fecha: '2026-10-02', tipo: 'inversion', cat: 'aportacion', importe: 25000, nota: '', cuenta: 'ibkr', creado: Date.parse('2026-10-02T09:00:00Z') },
    { id: 'd', fecha: '2026-10-03', tipo: 'gasto', cat: 'suscripciones', importe: 1199, nota: 'Spotify', sub: 's1', creado: Date.parse('2026-10-02T22:00:00Z') }
  ];
  const csv = C.movsToCsv(movs);
  assert.ok(csv.startsWith('id;fecha;tipo;categoria;importe;nota;cuenta;suscripcion;creado\n'));
  const back = C.csvToMovs(csv);
  assert.strictEqual(back.length, 4);
  const byId = Object.fromEntries(back.map(m => [m.id, m]));
  for (const m of movs) {
    const b = byId[m.id];
    assert.strictEqual(b.fecha, m.fecha); assert.strictEqual(b.tipo, m.tipo); assert.strictEqual(b.cat, m.cat);
    assert.strictEqual(b.importe, m.importe); assert.strictEqual(b.nota, m.nota); assert.strictEqual(b.creado, m.creado);
    assert.strictEqual(b.cuenta, m.cuenta); assert.strictEqual(b.sub, m.sub);
  }
  assert.deepStrictEqual(back.map(m => m.id), ['b', 'c', 'd', 'a']); // ordenado por fecha
});

t('cobros de suscripción: mensual, anual y día 31', () => {
  assert.deepStrictEqual(C.chargeDates({ cada: 'mes', dia: 31 }, '2026-01-15', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepStrictEqual(C.chargeDates({ cada: 'año', dia: 15, mes: 3 }, '2026-01-01', '2027-12-31'), ['2026-03-15', '2027-03-15']);
  assert.deepStrictEqual(C.chargeDates({ cada: 'mes', dia: 8 }, '2026-10-08', '2026-10-08'), ['2026-10-08']);
  assert.deepStrictEqual(C.chargeDates({ cada: 'mes', dia: 9 }, '2026-10-08', '2026-10-08'), []);
});

t('materializar no duplica ni resucita lo borrado', () => {
  const st = { movs: [], subs: [{ id: 's1', nombre: 'Spotify', importe: 1199, cada: 'mes', dia: 3, desde: '2026-08-01', hasta: null, trabajo: false },
    { id: 's2', nombre: 'TradingView', importe: 1495, cada: 'mes', dia: 5, desde: '2026-10-01', hasta: null, trabajo: true }] };
  const c1 = C.materialize(st, '2026-10-08', uid, 12345);
  assert.strictEqual(c1.length, 4); // ago, sep, oct de Spotify + oct de TradingView
  assert.strictEqual(c1.find(m => m.fecha === '2026-10-03').creado, C.startOfDay('2026-10-03'));
  assert.strictEqual(st.movs.filter(m => m.cat === 'trabajo').length, 1);
  assert.strictEqual(C.materialize(st, '2026-10-08', uid).length, 0);
  st.movs = st.movs.filter(m => m.fecha !== '2026-09-03'); // Tomás borra uno
  assert.strictEqual(C.materialize(st, '2026-10-20', uid).length, 0);
  const nov = C.materialize(st, '2026-11-05', uid, 999);
  assert.strictEqual(nov.length, 2);
  assert.strictEqual(nov.find(m => m.fecha === '2026-11-05').creado, 999); // el de hoy, «ahora»
  st.subs[0].hasta = '2026-11-20'; // baja
  assert.strictEqual(C.materialize(st, '2027-01-10', uid).filter(m => m.sub === 's1').length, 0);
});

t('patrimonio se mueve con lo apuntado y respeta el saldo real', () => {
  const base = Date.parse('2026-10-05T10:00:00');
  const st = {
    cuentas: [
      { id: 'dia', nombre: 'Día a día', tipo: 'liquidez', principal: true, saldo: 150000, fecha: '2026-10-05', ts: base },
      { id: 'aho', nombre: 'Ahorro', tipo: 'liquidez', principal: false, saldo: 300000, fecha: '2026-10-01', ts: 0 },
      { id: 'ibkr', nombre: 'IBKR', tipo: 'inversion', saldo: 200000, fecha: '2026-10-01', ts: 0 }
    ],
    movs: [
      { id: 'm1', fecha: '2026-10-04', tipo: 'gasto', cat: 'comidas', importe: 1000, creado: base - 1 },   // antes del saldo real: no cuenta
      { id: 'm2', fecha: '2026-10-05', tipo: 'gasto', cat: 'comidas', importe: 2000, creado: base - 60000 }, // mismo día, antes: no cuenta
      { id: 'm3', fecha: '2026-10-05', tipo: 'gasto', cat: 'ocio', importe: 500, creado: base + 60000 },    // mismo día, después: cuenta
      { id: 'm4', fecha: '2026-10-06', tipo: 'ingreso', cat: 'extra', importe: 10000, creado: base + 1 },
      { id: 'm5', fecha: '2026-10-07', tipo: 'inversion', cat: 'aportacion', importe: 25000, cuenta: 'ibkr', creado: base + 2 },
      { id: 'm6', fecha: '2026-10-03', tipo: 'inversion', cat: 'aportacion', importe: 5000, cuenta: 'ibkr', creado: base + 3 } // ya estaba en el día a día, no en IBKR
    ]
  };
  const p = C.patrimonio(st);
  const v = Object.fromEntries(p.cuentas.map(x => [x.c.id, x.v]));
  assert.strictEqual(v.dia, 150000 - 500 + 10000 - 25000);
  assert.strictEqual(v.aho, 300000);
  assert.strictEqual(v.ibkr, 200000 + 25000 + 5000);
  assert.strictEqual(p.total, v.dia + v.aho + v.ibkr);
  assert.strictEqual(p.invertido, v.ibkr);
});

t('totales del mes', () => {
  const T = C.totales([{ tipo: 'gasto', importe: 100 }, { tipo: 'ingreso', importe: 1000 }, { tipo: 'inversion', importe: 300 }, { tipo: 'gasto', importe: 50 }]);
  assert.deepStrictEqual(T, { gasto: 150, ingreso: 1000, inversion: 300 });
});

t('categorías: por defecto y las del repositorio privado', () => {
  assert.strictEqual(C.catsOf({}).gasto[0].id, 'comidas');
  const st = { cats: { gasto: [{ id: 'comidas', n: 'Comidas', i: 'utensils' }, { id: 'juego-a', n: 'Juego A', i: 'dice', juego: true }],
    ingreso: [{ id: 'sueldo', n: 'Sueldo', i: 'briefcase' }, { id: 'juego-a', n: 'Juego A', i: 'dice', juego: true }] } };
  assert.strictEqual(C.catsOf(st).ingreso[0].n, 'Sueldo');
  assert.deepStrictEqual(C.juegoIds(st), ['juego-a']);
  const m = C.catMap(st);
  assert.strictEqual(m['juego-a'].juego, true);
  assert.strictEqual(m.suscripciones.n, 'Suscripciones'); // las fijas siguen ahí
  assert.ok(C.configDoc(Object.assign({ cuentas: [], subs: [], saldos: [] }, st)).includes('"cats"'));
  assert.ok(!C.configDoc({ cuentas: [], subs: [], saldos: [] }).includes('"cats"'));
});

t('resumen del mes con el juego en neto', () => {
  const L = [
    { tipo: 'ingreso', cat: 'sueldo', importe: 100000 }, { tipo: 'gasto', cat: 'comidas', importe: 3000 },
    { tipo: 'inversion', cat: 'aportacion', importe: 20000 },
    { tipo: 'gasto', cat: 'juego-a', importe: 10000 }, { tipo: 'ingreso', cat: 'juego-a', importe: 15000 },
    { tipo: 'gasto', cat: 'juego-b', importe: 5000 }, { tipo: 'ingreso', cat: 'juego-b', importe: 2000 }
  ];
  const R = C.resumenMes(L, ['juego-a', 'juego-b']);
  assert.strictEqual(R.juego.neto, 2000);              // +50 en uno, −30 en el otro
  assert.deepStrictEqual(R.juego.cats['juego-a'], { metido: 10000, sacado: 15000 });
  assert.strictEqual(R.ingreso, 100000 + 2000);       // el neto a favor suma a ingresos
  assert.strictEqual(R.gasto, 3000);                   // lo metido no infla los gastos
  assert.strictEqual(R.inversion, 20000);
  const R2 = C.resumenMes(L.concat([{ tipo: 'gasto', cat: 'juego-b', importe: 4000 }]), ['juego-a', 'juego-b']);
  assert.strictEqual(R2.juego.neto, -2000);
  assert.strictEqual(R2.ingreso, 100000);
  assert.strictEqual(R2.gasto, 3000 + 2000);           // el neto en contra suma a gastos
  const R3 = C.resumenMes(L, []);                      // sin categorías de juego, todo en bruto
  assert.strictEqual(R3.ingreso, 117000);
});

console.log(n + ' pruebas OK');
