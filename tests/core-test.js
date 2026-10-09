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
  assert.strictEqual(C.parseEur('2.100'), 210000);     // punto de miles, como se escribe en España
  assert.strictEqual(C.parseEur('1.250.000'), 125000000);
  assert.strictEqual(C.parseEur('3.000,5'), 300050);
  assert.strictEqual(C.parseEur('2.1'), 210);           // un punto con 1-2 decimales sigue siendo decimal
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
    { id: 'd', fecha: '2026-10-03', tipo: 'gasto', cat: 'suscripciones', importe: 1199, nota: 'Spotify', sub: 's1', creado: Date.parse('2026-10-02T22:00:00Z') },
    { id: 'e', fecha: '2026-10-04', tipo: 'traspaso', cat: 'traspaso-todo', importe: 210000, nota: '', cuenta: 'dia', origen: 'inv', creado: Date.parse('2026-10-04T09:00:00Z') }
  ];
  const csv = C.movsToCsv(movs);
  assert.ok(csv.startsWith('id;fecha;tipo;categoria;importe;nota;cuenta;suscripcion;creado;origen\n'));
  const back = C.csvToMovs(csv);
  assert.strictEqual(back.length, 5);
  const byId = Object.fromEntries(back.map(m => [m.id, m]));
  for (const m of movs) {
    const b = byId[m.id];
    assert.strictEqual(b.fecha, m.fecha); assert.strictEqual(b.tipo, m.tipo); assert.strictEqual(b.cat, m.cat);
    assert.strictEqual(b.importe, m.importe); assert.strictEqual(b.nota, m.nota); assert.strictEqual(b.creado, m.creado);
    assert.strictEqual(b.cuenta, m.cuenta); assert.strictEqual(b.sub, m.sub); assert.strictEqual(b.origen, m.origen);
  }
  assert.deepStrictEqual(back.map(m => m.id), ['b', 'c', 'd', 'e', 'a']); // ordenado por fecha
});

t('csv antiguo, sin la columna origen, se sigue leyendo', () => {
  const viejo = 'id;fecha;tipo;categoria;importe;nota;cuenta;suscripcion;creado\n' +
    'x;2026-10-08;gasto;comidas;12,50;Menú;;;2026-10-08T12:00:00.000Z\n';
  const L = C.csvToMovs(viejo);
  assert.strictEqual(L.length, 1);
  assert.strictEqual(L[0].importe, 1250);
  assert.strictEqual(L[0].origen, undefined);
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
  // v1.4: lo aportado llega al efectivo de la cuenta de inversión; lo invertido sigue en su saldo real
  assert.strictEqual(p.invertido, 200000);
  assert.strictEqual(p.cuentas.find(x => x.c.id === 'ibkr').ef, 30000);
});

t('bolsillos: efectivo e invertido, comprar, vender todo y saldo real posterior', () => {
  const base = Date.parse('2026-10-09T10:00:00');
  const st = {
    cuentas: [
      { id: 'tr', nombre: 'Bróker diario', tipo: 'inversion', principal: true, saldo: 200000, efectivo: 100000, fecha: '2026-10-09', ts: base },
      { id: 'otra', nombre: 'Otra', tipo: 'liquidez', principal: false, saldo: 50000, fecha: '2026-10-09', ts: base },
      { id: 'fon', nombre: 'Fondos', tipo: 'inversion', principal: false, saldo: 500000, efectivo: 10000, fecha: '2026-10-09', ts: base }
    ],
    movs: []
  };
  const v = () => Object.fromEntries(C.patrimonio(st).cuentas.map(x => [x.c.id, [x.ef, x.inv]]));
  assert.deepStrictEqual(v(), { tr: [100000, 200000], otra: [50000, 0], fon: [10000, 500000] });
  // un gasto sale del efectivo de la cuenta del día a día, aunque sea un bróker
  st.movs.push({ id: 'g', fecha: '2026-10-09', tipo: 'gasto', cat: 'comidas', importe: 1000, creado: base + 500 });
  assert.deepStrictEqual(v().tr, [99000, 200000]);
  // pasar de otra liquidez al día a día
  st.movs.push({ id: 't1', fecha: '2026-10-09', tipo: 'traspaso', cat: 'traspaso', importe: 30000, cuenta: 'tr', origen: 'otra', creado: base + 1000 });
  assert.deepStrictEqual(v().otra, [20000, 0]);
  // vender todo lo invertido del día a día: recibe 210.000 (ganó 100 €)
  st.movs.push({ id: 't2', fecha: '2026-10-10', tipo: 'traspaso', cat: 'traspaso-todo', importe: 210000, cuenta: 'tr', origen: 'tr:inv', creado: base + 2000 });
  assert.deepStrictEqual(v().tr, [339000, 0]);
  // DCA: del día a día al efectivo de los fondos, y la compra pasa de efectivo a invertido
  st.movs.push({ id: 't3', fecha: '2026-10-11', tipo: 'traspaso', cat: 'traspaso', importe: 20000, cuenta: 'fon', origen: 'tr', creado: base + 3000 });
  st.movs.push({ id: 't4', fecha: '2026-10-12', tipo: 'traspaso', cat: 'traspaso', importe: 25000, cuenta: 'fon:inv', origen: 'fon', creado: base + 4000 });
  assert.deepStrictEqual(v().fon, [5000, 525000]);
  assert.deepStrictEqual(v().tr, [319000, 0]);
  // borrar la venta devuelve lo invertido de antes (no deja un 0 suelto)
  const sinVenta = { cuentas: st.cuentas, movs: st.movs.filter(m => m.id !== 't2') };
  assert.deepStrictEqual([C.saldos(sinVenta, st.cuentas[0]).ef, C.saldos(sinVenta, st.cuentas[0]).inv], [109000, 200000]);
  // un saldo real puesto después manda
  st.cuentas[2] = Object.assign({}, st.cuentas[2], { saldo: 530000, efectivo: 0, fecha: '2026-10-15', ts: base + 9000 });
  assert.deepStrictEqual(v().fon, [0, 530000]);
  // % invertido del mes: solo cuenta lo que entra en una cuenta de inversión desde la liquidez o el día a día
  const R = C.resumenMes(st.movs.concat([{ tipo: 'ingreso', cat: 'sueldo', importe: 100000 }]), [], st.cuentas);
  assert.deepStrictEqual([R.gasto, R.ingreso, R.inversion], [1000, 100000, 20000]);
  const R0 = C.resumenMes(st.movs, []); // sin cuentas, los traspasos no cuentan
  assert.strictEqual(R0.inversion, 0);
});

t('lo que añade Claude: saldos de los brókeres y movimientos del correo sin duplicar', () => {
  const base = Date.parse('2026-10-09T10:00:00');
  const st = {
    cuentas: [
      { id: 'dia', nombre: 'Día', tipo: 'liquidez', principal: true, saldo: 100000, fecha: '2026-10-09', ts: base },
      { id: 'ib', nombre: 'Bróker', tipo: 'inversion', saldo: 1000000, efectivo: 0, fecha: '2026-10-09', ts: base },
      { id: 'fon', nombre: 'Fondos', tipo: 'inversion', saldo: 500000, efectivo: 10000, fecha: '2026-10-09', ts: base }
    ],
    movs: [],
    auto: {
      saldos: [
        { cuenta: 'ib', fecha: '2026-10-10', ts: base + 86400000, inv: 520000, ef: 500000, fuente: 'IBKR' },
        { cuenta: 'ib', fecha: '2026-10-08', ts: 0, inv: 1, ef: 1 } // más antiguo que el puesto a mano: no cuenta
      ],
      movs: [
        { id: 'a1', fecha: '2026-10-10', tipo: 'traspaso', cat: 'traspaso', importe: 20000, origen: 'dia', cuenta: 'fon', dedupe: true, nota: 'Transferencia' },
        { id: 'a2', fecha: '2026-10-11', tipo: 'traspaso', cat: 'traspaso', importe: 20000, origen: 'fon', cuenta: 'fon:inv', nota: 'Fondo A' }
      ]
    }
  };
  let p = C.patrimonio(st), v = id => p.cuentas.find(x => x.c.id === id);
  assert.deepStrictEqual([v('ib').ef, v('ib').inv], [500000, 520000]);
  assert.deepStrictEqual([v('fon').ef, v('fon').inv, v('dia').ef], [10000, 520000, 80000]);
  assert.ok(C.allMovs(st).every(m => m.id.startsWith('a') ? m.auto : true));
  // si también se apunta a mano la transferencia (mismo importe, 1 día después), no se cuenta dos veces
  st.movs.push({ id: 'mio', fecha: '2026-10-11', tipo: 'traspaso', cat: 'traspaso', importe: 20000, origen: 'dia', cuenta: 'fon', creado: base + 2 * 86400000 });
  p = C.patrimonio(st);
  assert.deepStrictEqual([v('fon').ef, v('fon').inv, v('dia').ef], [10000, 520000, 80000]);
  assert.strictEqual(C.allMovs(st).length, 2);
  // y en el mes cuenta una sola vez como invertido
  assert.strictEqual(C.resumenMes(C.allMovs(st), [], st.cuentas).inversion, 20000);
});

t('saldo de Claude solo de lo invertido: el efectivo sigue saliendo de los movimientos', () => {
  const base = Date.parse('2026-10-09T10:00:00');
  const st = {
    cuentas: [
      { id: 'dia', nombre: 'Día', tipo: 'inversion', principal: true, saldo: 0, efectivo: 100000, fecha: '2026-10-09', ts: base },
      { id: 'fon', nombre: 'Fondos', tipo: 'inversion', saldo: 500000, efectivo: 10000, fecha: '2026-10-09', ts: base }
    ],
    movs: [],
    auto: { saldos: [{ cuenta: 'fon', fecha: '2026-10-12', ts: base + 3 * 86400000, inv: 530000, fuente: 'Fondos' }], movs: [] }
  };
  const v = () => { const x = C.saldos(st, st.cuentas[1]); return [x.ef, x.inv]; };
  assert.deepStrictEqual(v(), [10000, 530000]);
  // un traspaso apuntado tarde, con fecha anterior al valor de los fondos, sí llega al efectivo
  st.movs.push({ id: 't', fecha: '2026-10-10', tipo: 'traspaso', cat: 'traspaso', importe: 20000, origen: 'dia', cuenta: 'fon', creado: base + 4 * 86400000 });
  assert.deepStrictEqual(v(), [30000, 530000]);
  assert.strictEqual(C.saldos(st, st.cuentas[0]).ef, 80000);
  // una compra con fecha anterior al último valor: sale del efectivo y no se suma dos veces a lo invertido
  st.auto.movs.push({ id: 'c', fecha: '2026-10-11', tipo: 'traspaso', cat: 'traspaso', importe: 20000, origen: 'fon', cuenta: 'fon:inv', creado: base + 2 * 86400000 });
  assert.deepStrictEqual(v(), [10000, 530000]);
  assert.strictEqual(C.snapOf(st, st.cuentas[1]).fuente, 'Fondos');
});

t('ingresos habituales: se apuntan solos el día que tocan, en su categoría', () => {
  const st = { cats: { gasto: [], ingreso: [{ id: 'sueldo', n: 'Sueldo', i: 'briefcase' }] }, movs: [], subs: [
    { id: 'n', tipo: 'ingreso', nombre: 'Nómina', importe: 90000, cada: 'mes', dia: 1, desde: '2026-10-09', hasta: null },
    { id: 'p', tipo: 'ingreso', cat: 'otra', nombre: 'Alquiler', importe: 30000, cada: 'mes', dia: 20, desde: '2026-10-09', hasta: null }
  ] };
  assert.strictEqual(C.materialize(st, '2026-10-19', uid).length, 0);
  const made = C.materialize(st, '2026-11-02', uid, 7);
  assert.deepStrictEqual(made.map(m => [m.fecha, m.tipo, m.cat, m.importe]).sort(),
    [['2026-10-20', 'ingreso', 'otra', 30000], ['2026-11-01', 'ingreso', 'sueldo', 90000]]);
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
