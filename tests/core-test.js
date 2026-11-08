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

t('categorías: crear, cambiar y borrar desde el móvil (v1.7)', () => {
  // sin categorías propias se parte de las genéricas
  let cats = C.copyCats({});
  assert.strictEqual(cats.gasto.length, C.DEF_CATS.gasto.length);
  assert.notStrictEqual(cats.gasto[0], C.DEF_CATS.gasto[0]); // es una copia, no toca las de serie
  // nueva: entra antes de «Otros», con id sin tildes
  let r = C.catSave(cats, 'gasto', { n: '  Ropa  y   zapatos ', i: 'bag' });
  assert.ok(!r.err);
  assert.strictEqual(r.id, 'ropa-y-zapatos');
  assert.strictEqual(cats.gasto[cats.gasto.length - 2].n, 'Ropa y zapatos');
  assert.strictEqual(cats.gasto[cats.gasto.length - 1].id, 'otros');
  assert.strictEqual(C.catSlug('Formación'), 'formacion');
  // nombre repetido (sin mirar mayúsculas) y sin nombre
  assert.ok(C.catSave(cats, 'gasto', { n: 'comidas' }).err);
  assert.ok(C.catSave(cats, 'gasto', { n: '   ' }).err);
  // id ocupado: se numera; tampoco pisa las fijas
  r = C.catSave(cats, 'ingreso', { n: 'Comidas', i: 'utensils' });
  assert.strictEqual(r.id, 'comidas-2');
  assert.strictEqual(C.catSave(cats, 'gasto', { n: 'Suscripciones' }).id, 'suscripciones-2');
  C.catDelete(cats, 'gasto', 'suscripciones-2'); // sin movimientos: se quita del todo
  assert.ok(!cats.gasto.some(c => c.id === 'suscripciones-2'));
  // cambiar nombre e icono mantiene el id (el historial cambia de nombre con ella)
  r = C.catSave(cats, 'gasto', { n: 'Ropa', i: 'gift' }, 'ropa-y-zapatos');
  assert.strictEqual(r.id, 'ropa-y-zapatos');
  assert.strictEqual(C.catMap({ cats })['ropa-y-zapatos'].n, 'Ropa');
  // juego: va en las dos listas con el mismo id
  r = C.catSave(cats, 'gasto', { n: 'Lotería', i: 'star', juego: true });
  assert.strictEqual(r.id, 'loteria');
  assert.ok(cats.ingreso.some(c => c.id === 'loteria' && c.juego));
  assert.deepStrictEqual(C.juegoIds({ cats }), ['loteria']);
  // renombrar desde ingresos cambia también la de gastos
  C.catSave(cats, 'ingreso', { n: 'Loterías', i: 'star', juego: true }, 'loteria');
  assert.strictEqual(cats.gasto.find(c => c.id === 'loteria').n, 'Loterías');
  // borrar sin movimientos la quita de las dos; con movimientos solo la oculta
  let dd = JSON.parse(JSON.stringify(cats));
  C.catDelete(dd, 'gasto', 'loteria', () => false);
  assert.ok(!dd.gasto.some(c => c.id === 'loteria') && !dd.ingreso.some(c => c.id === 'loteria'));
  C.catDelete(cats, 'gasto', 'loteria', id => id === 'loteria');
  assert.ok(cats.gasto.find(c => c.id === 'loteria').oculta && cats.ingreso.find(c => c.id === 'loteria').oculta);
  assert.ok(!C.catsOf({ cats }).gasto.some(c => c.id === 'loteria'));       // no sale en los botones
  assert.strictEqual(C.catMap({ cats }).loteria.n, 'Loterías');               // pero el historial la nombra
  assert.deepStrictEqual(C.juegoIds({ cats }), ['loteria']);                // y lo apuntado sigue en neto
  // volver a crearla con el mismo nombre la recupera (mismo id)
  r = C.catSave(cats, 'gasto', { n: 'loterías', i: 'dice', juego: true });
  assert.strictEqual(r.id, 'loteria');
  assert.ok(!cats.gasto.find(c => c.id === 'loteria').oculta && !cats.ingreso.find(c => c.id === 'loteria').oculta);
  // dejar de ser de juego: la copia de ingresos se va (u oculta si tiene movimientos)
  C.catSave(cats, 'gasto', { n: 'Loterías', i: 'dice', juego: false }, 'loteria', id => id === 'loteria');
  assert.ok(!cats.gasto.find(c => c.id === 'loteria').juego);
  assert.ok(cats.ingreso.find(c => c.id === 'loteria').oculta);
  assert.deepStrictEqual(C.juegoIds({ cats }), []);
  // máximo de 16 por lista y al menos una
  let few = { gasto: [{ id: 'a', n: 'A', i: 'dots' }], ingreso: [{ id: 'b', n: 'B', i: 'dots' }] };
  assert.ok(C.catDelete(few, 'gasto', 'a').err);
  for (let i = 1; i < C.MAX_CATS; i++) assert.ok(!C.catSave(few, 'gasto', { n: 'G' + i }).err);
  assert.ok(C.catSave(few, 'gasto', { n: 'Una más' }).err);
  assert.ok(C.catSave(few, 'ingreso', { n: 'Juego', juego: true }).err); // no cabe su copia en gastos
  // las categorías con grupo se conservan al cambiarles el nombre
  let g = { gasto: [{ id: 'x', n: 'X', i: 'dots' }], ingreso: [{ id: 'nomina', n: 'Nómina', i: 'briefcase', grupo: 'Bar' }, { id: 'o', n: 'Otros', i: 'dots' }] };
  C.catSave(g, 'ingreso', { n: 'Sueldo', i: 'briefcase' }, 'nomina');
  assert.strictEqual(C.fullName(g.ingreso[0]), 'Sueldo Bar');
  assert.ok(C.catSave(g, 'ingreso', { n: 'sueldo bar' }).err);
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

t('efectivo (v1.6): el gasto pagado con billetes sale de la cuenta de efectivo, no del día a día', () => {
  const base = Date.parse('2026-10-11T10:00:00');
  const st = {
    cuentas: [
      { id: 'dia', nombre: 'Día a día', tipo: 'inversion', principal: true, saldo: 0, efectivo: 100000, fecha: '2026-10-11', ts: base },
      { id: 'bil', nombre: 'Cartera', tipo: 'liquidez', metalico: true, saldo: 14500, fecha: '2026-10-11', ts: base }
    ],
    movs: [
      { id: 'g1', fecha: '2026-10-11', tipo: 'gasto', cat: 'comidas', importe: 1000, creado: base + 1 },               // tarjeta
      { id: 'g2', fecha: '2026-10-11', tipo: 'gasto', cat: 'comidas', importe: 250, cuenta: 'bil', creado: base + 2 }, // efectivo
      { id: 'i1', fecha: '2026-10-12', tipo: 'ingreso', cat: 'extras', importe: 4000, cuenta: 'bil', creado: base + 3 },
      { id: 'c1', fecha: '2026-10-12', tipo: 'traspaso', cat: 'traspaso', importe: 5000, origen: 'dia', cuenta: 'bil', creado: base + 4 } // cajero
    ]
  };
  assert.strictEqual(C.metalicoId(st), 'bil');
  const v = id => C.saldos(st, st.cuentas.find(c => c.id === id));
  assert.strictEqual(v('dia').ef, 100000 - 1000 - 5000);
  assert.strictEqual(v('bil').ef, 14500 - 250 + 4000 + 5000);
  const R = C.resumenMes(st.movs, [], st.cuentas);
  assert.deepStrictEqual(R.efectivo, { gasto: 250, ingreso: 4000 });
  assert.strictEqual(R.gasto, 1250);
  assert.strictEqual(R.inversion, 0); // sacar del cajero no es invertir
  // sin cuenta de efectivo marcada no hay efectivo en el resumen
  assert.deepStrictEqual(C.resumenMes(st.movs, [], [st.cuentas[0]]).efectivo, { gasto: 0, ingreso: 0 });
  // la del día a día o una de inversión no cuentan como efectivo aunque lleven la marca
  assert.strictEqual(C.metalicoId({ cuentas: [{ id: 'x', tipo: 'liquidez', metalico: true, principal: true }] }), null);
  assert.strictEqual(C.metalicoId({ cuentas: [{ id: 'y', tipo: 'inversion', metalico: true }] }), null);
  // el CSV guarda la cuenta del gasto pagado en efectivo
  const back = C.csvToMovs(C.movsToCsv(st.movs));
  assert.strictEqual(back.find(m => m.id === 'g2').cuenta, 'bil');
  assert.strictEqual(back.find(m => m.id === 'g1').cuenta, undefined);
});

t('grupos de ingresos (v1.6): nombre completo y suma por sitio', () => {
  const st = { cats: { gasto: [{ id: 'comidas', n: 'Comidas', i: 'utensils' }, { id: 'juego-a', n: 'Juego A', i: 'dice', juego: true }],
    ingreso: [{ id: 'nomina', n: 'Nómina', i: 'briefcase', grupo: 'Bar' }, { id: 'beca', n: 'Beca', i: 'wallet' },
      { id: 'extras', n: 'Extras', i: 'clock', grupo: 'Bar' }, { id: 'juego-a', n: 'Juego A', i: 'dice', juego: true }] } };
  const m = C.catMap(st);
  assert.strictEqual(m.nomina.n, 'Nómina Bar');
  assert.strictEqual(m.nomina.corto, 'Nómina');
  assert.strictEqual(m.extras.grupo, 'Bar');
  assert.strictEqual(m.beca.n, 'Beca');
  const L = [
    { tipo: 'ingreso', cat: 'extras', importe: 6000 }, { tipo: 'ingreso', cat: 'nomina', importe: 40000 },
    { tipo: 'ingreso', cat: 'beca', importe: 30000 }, { tipo: 'ingreso', cat: 'extras', importe: 2000 },
    { tipo: 'gasto', cat: 'comidas', importe: 999 },
    { tipo: 'gasto', cat: 'juego-a', importe: 1000 }, { tipo: 'ingreso', cat: 'juego-a', importe: 3000 }
  ];
  const rows = C.ingresosMes(L, st);
  assert.deepStrictEqual(rows.map(r => [r.n, r.v]), [['Bar', 48000], ['Beca', 30000], ['Juego (resultado)', 2000]]);
  assert.deepStrictEqual(rows[0].partes.map(p => [p.n, p.v]), [['Nómina', 40000], ['Extras', 8000]]); // en el orden de las categorías
  assert.strictEqual(rows[0].i, 'briefcase');
  // suman lo mismo que los ingresos del resumen
  assert.strictEqual(rows.reduce((a, r) => a + r.v, 0), C.resumenMes(L, C.juegoIds(st)).ingreso);
  // con el juego en contra no sale fila de juego
  assert.ok(!C.ingresosMes(L.concat([{ tipo: 'gasto', cat: 'juego-a', importe: 5000 }]), st).some(r => r.key === '__juego'));
});

t('prompt para la IA (v1.8): lleva todo, con importes en español y sin la llave', () => {
  const st = {
    cuentas: [{ id: 'a', nombre: 'Banco', tipo: 'liquidez', principal: true, saldo: 100000, fecha: '2026-10-01', ts: 1 },
      { id: 'b', nombre: 'Broker', tipo: 'inversion', saldo: 500000, efectivo: 20000, fecha: '2026-10-01', ts: 1 }],
    saldos: [{ fecha: '2026-10-01', ts: 1, cuenta: 'a', saldo: 100000 }],
    subs: [{ id: 's1', nombre: 'Netflix', importe: 1299, cada: 'mes', dia: 5, desde: '2026-10-01' }],
    movs: [{ id: '1', fecha: '2026-11-01', tipo: 'gasto', cat: 'comidas', importe: 123456, nota: 'Mercadona', creado: 5e12 },
      { id: '2', fecha: '2026-11-02', tipo: 'traspaso', cat: 'traspaso', importe: 20000, origen: 'a', cuenta: 'b', nota: 'DCA', creado: 5e12 + 1 }],
    auto: { movs: [{ id: 'x', fecha: '2026-11-02', tipo: 'gasto', cat: 'comidas', importe: 500, nota: 'Auto', creado: 5e12 + 2 }] }
  };
  const p = C.promptIA(st, '2026-11-03');
  assert.ok(p.includes('1.234,56 €') && p.includes('Mercadona') && p.includes('Netflix') && p.includes('Banco → Broker (efectivo)'));
  assert.ok(p.includes('Todos los movimientos (3)') && p.includes('[auto]'));
  assert.ok(p.includes('## Patrimonio hoy') && p.includes('% invertido'));
  assert.ok(!/token|llave/i.test(p.split('## Cómo leer')[1]));
  assert.strictEqual(C.eurTxt(-5), '-0,05 €');
});

t('presupuesto por categoría (v1.12): se guarda, avisa al 80 % y al pasarse', () => {
  const cats = C.copyCats({});
  const r = C.catSave(cats, 'gasto', { n: 'Ocio', i: 'dots', tope: 15000 }, 'ocio', () => true);
  assert.ok(!r.err);
  assert.strictEqual(r.cats.gasto.filter(c => c.id === 'ocio')[0].tope, 15000);
  assert.strictEqual(C.catMap({ cats: r.cats }).ocio.tope, 15000);
  // sin la clave «tope» no se toca; con tope vacío se quita; en ingresos o juego no se guarda
  C.catSave(r.cats, 'gasto', { n: 'Ocio', i: 'dots' }, 'ocio', () => true);
  assert.strictEqual(r.cats.gasto.filter(c => c.id === 'ocio')[0].tope, 15000);
  C.catSave(r.cats, 'gasto', { n: 'Ocio', i: 'dots', tope: 0 }, 'ocio', () => true);
  assert.strictEqual(r.cats.gasto.filter(c => c.id === 'ocio')[0].tope, undefined);
  assert.strictEqual(C.presupuesto(5000, 0), null);
  assert.strictEqual(C.presupuesto(7900, 10000).estado, 'ok');
  assert.strictEqual(C.presupuesto(8000, 10000).estado, 'warn');
  const o = C.presupuesto(12500, 10000);
  assert.strictEqual(o.estado, 'over'); assert.strictEqual(o.queda, -2500);
});

t('mes contra el anterior (v1.12): el mes de hoy se corta en el mismo día', () => {
  const g = (id, fecha, importe) => ({ id, fecha, tipo: 'gasto', cat: 'comidas', importe, creado: 1 });
  const st = { cuentas: [], movs: [g('a', '2026-10-02', 1000), g('b', '2026-10-20', 9000), g('c', '2026-11-01', 500), g('d', '2026-11-03', 700)] };
  const k = C.compMes(st, '2026-11', '2026-11-03');
  assert.deepStrictEqual([k.pym, k.parcial, k.cur, k.prev], ['2026-10', true, 1200, 1000]);
  const o = C.compMes(st, '2026-10', '2026-11-03');
  assert.deepStrictEqual([o.pym, o.parcial, o.cur, o.prev], ['2026-09', false, 10000, 0]);
  assert.strictEqual(C.compMes(st, '2027-01', '2027-01-31').pym, '2026-12');
});

t('evolución del patrimonio (v1.12): reconstruida con saldos y movimientos, sin saltos', () => {
  const st = {
    cuentas: [{ id: 'd', nombre: 'Día', tipo: 'liquidez', principal: true, saldo: 100000, fecha: '2026-10-10', ts: 5 },
      { id: 'b', nombre: 'Broker', tipo: 'inversion', saldo: 50000, efectivo: 0, fecha: '2026-10-12', ts: 9 }],
    saldos: [{ cuenta: 'd', fecha: '2026-10-10', ts: 5, saldo: 100000 }, { cuenta: 'b', fecha: '2026-10-12', ts: 9, saldo: 50000, efectivo: 0 }],
    movs: [{ id: 'g', fecha: '2026-10-11', tipo: 'gasto', cat: 'comidas', importe: 2000, creado: Date.parse('2026-10-11T10:00:00Z') }],
    auto: { saldos: [{ cuenta: 'b', fecha: '2026-10-14', ts: 20, inv: 53000, fuente: 'IBKR' }] }
  };
  // el broker existe desde antes de su primer saldo (sin salto) y el gasto del 11 solo cuenta desde el 11
  assert.strictEqual(C.patrimonioA(st, '2026-10-10').total, 150000);
  assert.strictEqual(C.patrimonioA(st, '2026-10-11').total, 148000);
  assert.strictEqual(C.patrimonioA(st, '2026-10-13').total, 148000);
  assert.strictEqual(C.patrimonioA(st, '2026-10-14').total, 151000);
  const s = C.serie(st, '2026-10-14');
  assert.strictEqual(s.length, 5);
  assert.deepStrictEqual([s[0].f, s[4].f, s[4].t], ['2026-10-10', '2026-10-14', 151000]);
  assert.deepStrictEqual(C.serie({ cuentas: [], saldos: [], movs: [] }, '2026-10-14'), []);
});

t('por confirmar (v1.13): comercios recordados y config.json', () => {
  const st = { cats: C.copyCats({}), reglas: { mercadona: 'comidas', viejo: 'no-existe' }, cuentas: [], subs: [], saldos: [] };
  assert.strictEqual(C.normCom('  MERCADONA,  València '), 'mercadona valencia');
  assert.strictEqual(C.reglaDe(st, 'Mercadona'), 'comidas');
  assert.strictEqual(C.reglaDe(st, 'mercadona!'), 'comidas');
  assert.strictEqual(C.reglaDe(st, 'Viejo'), null);       // la categoría ya no está: no se apunta solo
  assert.strictEqual(C.reglaDe(st, ''), null);
  assert.deepStrictEqual(JSON.parse(C.configDoc(st)).reglas, st.reglas);
  assert.strictEqual(JSON.parse(C.configDoc({ cuentas: [], subs: [], saldos: [], reglas: {} })).reglas, undefined);
});

t('buscar y exportar (v1.13)', () => {
  const st = { cats: C.copyCats({}), cuentas: [{ id: 'd', nombre: 'Día', tipo: 'liquidez' }, { id: 'b', nombre: 'Bróker', tipo: 'inversion' }] };
  const L = [
    { id: '1', fecha: '2026-10-02', tipo: 'gasto', cat: 'comidas', importe: 2340, nota: 'Mercadona', creado: 1 },
    { id: '2', fecha: '2026-11-03', tipo: 'gasto', cat: 'ocio', importe: 1200, nota: 'Cine; "Dune"', creado: 2 },
    { id: '3', fecha: '2026-11-04', tipo: 'ingreso', cat: 'nomina', importe: 140000, nota: '', creado: 3 },
    { id: '4', fecha: '2026-11-05', tipo: 'traspaso', cat: 'traspaso', importe: 50000, nota: '', cuenta: 'b:inv', origen: 'd', creado: 4 }
  ];
  const ids = f => C.filtrar(L, f, st).map(m => m.id).join('');
  assert.strictEqual(ids({}), '1234');
  assert.strictEqual(ids({ q: 'mercadona' }), '1');
  assert.strictEqual(ids({ q: 'ócio' }), '2');           // busca también por categoría y sin tildes
  assert.strictEqual(ids({ q: '23,4' }), '1');
  assert.strictEqual(ids({ q: '23.40' }), '1');
  assert.strictEqual(ids({ que: 'gasto' }), '12');
  assert.strictEqual(ids({ que: 'mov' }), '4');
  assert.strictEqual(ids({ que: 'cat:nomina' }), '3');
  assert.strictEqual(ids({ desde: '2026-11-01', hasta: '2026-11-04' }), '23');
  const csv = C.exportCsv(L, st);
  assert.ok(csv.charCodeAt(0) === 0xfeff);
  const rows = csv.slice(1).trim().split('\r\n');
  assert.strictEqual(rows[0], 'Fecha;Tipo;Categoría;Importe;Nota;Cuenta;Origen');
  assert.strictEqual(rows[1], '2026-10-02;Gasto;Comidas;-23,40;Mercadona;;');
  assert.strictEqual(rows[2], '2026-11-03;Gasto;Ocio;-12,00;"Cine; ""Dune""";;');
  assert.strictEqual(rows[4], '2026-11-05;Entre cuentas;;500,00;;Bróker (invertido);Día');
});

t('tus inversiones y margen (v1.14)', () => {
  const st = {
    cats: C.copyCats({}),
    cuentas: [
      { id: 'tr', nombre: 'TR', tipo: 'inversion', principal: true, saldo: 300000, efectivo: 600000, fecha: '2026-11-01', ts: 1, interes: 2.5,
        posiciones: [{ id: 'p1', nombre: 'Oro', coste: 200000, valor: 220000, desde: '2026-01-10' }, { id: 'p2', nombre: 'BTC', valor: 80000 }] },
      { id: 'my', nombre: 'MyI', tipo: 'inversion', saldo: 1000000, efectivo: 100000, fecha: '2026-11-01', ts: 1 },
      { id: 'ib', nombre: 'IBKR', tipo: 'inversion', saldo: 700000, efectivo: 300000, fecha: '2026-11-01', ts: 1 },
      { id: 'ef', nombre: 'Billetes', tipo: 'liquidez', metalico: true, saldo: 5000, fecha: '2026-11-01', ts: 1 }
    ],
    saldos: [], subs: [],
    movs: [{ id: 'g', fecha: '2026-10-05', tipo: 'gasto', cat: 'comidas', importe: 100000, creado: 1 }],
    auto: {
      posiciones: { my: [{ nombre: 'S&P', isin: 'X1', valor: 1000000 }], ib: [{ nombre: 'CB', cantidad: 7, moneda: 'USD', valorMon: 95000, costeMon: 100000, valor: 700000 }] },
      fondos: { my: [{ isin: 'X1', coste: 800000, desde: '2024-10-02', vlFecha: '2026-11-04' }] },
      ordenes: { my: [{ fondo: 'A', importe: 20000, dia: 3 }, { fondo: 'B', importe: 10000, dia: 13 }] }
    }
  };
  const R = C.inversiones(st, '2026-11-08');
  assert.deepStrictEqual(R.bloques.map(b => b.c.id), ['my', 'ib', 'tr']);
  const my = R.bloques[0], ib = R.bloques[1], tr = R.bloques[2];
  assert.strictEqual(Math.round(my.g.pct * 1000), 250);           // coste desde fondos por ISIN
  assert.strictEqual(my.items[0].desde, '2024-10-02');
  assert.strictEqual(my.fecha, '2026-11-04'); assert.ok(my.valorDe);
  assert.deepStrictEqual([ib.g.mon, ib.g.v], ['USD', -5000]);     // en dólares
  assert.ok(tr.manual); assert.strictEqual(tr.g, null);           // a BTC le falta lo que pusiste: sin % del bloque
  assert.strictEqual(Math.round(tr.items[0].g.pct * 100), 10);
  assert.strictEqual(R.libre, 1000000);                           // sin los billetes
  assert.strictEqual(R.parado, 400000);                           // MyI + IBKR (TR está remunerada)
  assert.deepStrictEqual(R.margen.map(m => [m.c.id, m.ya]), [['tr', false], ['ib', true], ['my', true]]);
  assert.strictEqual(R.margen[2].mesAport, 30000);
  assert.deepStrictEqual([R.prox.fecha, R.prox.fondo, R.prox.cubierta], ['2026-11-13', 'B', true]);
  assert.deepStrictEqual(C.gastoMedio(st, '2026-11-08'), { v: 100000, meses: 1 });
  assert.strictEqual(C.inversiones(st, '2026-11-20').prox.fecha, '2026-12-03'); // pasa al mes siguiente
});

console.log(n + ' pruebas OK');
