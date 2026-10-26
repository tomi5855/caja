# Caja

App personal para apuntar gastos, ingresos e inversión desde el móvil, con el patrimonio y las
suscripciones. Es una web que se instala en la pantalla de inicio del iPhone (Safari → Compartir →
Añadir a pantalla de inicio) y funciona sin conexión.

Este repositorio solo tiene el código. **Aquí no hay datos:** cada persona guarda los suyos en su móvil y,
si quiere, en un repositorio privado suyo de GitHub.

## Probar en local

- Lógica: `node tests/core-test.js`
- App con un GitHub simulado: `python3 tests/mock_server.py . 8765 /tmp/caja-remoto.json`, abrir
  `http://127.0.0.1:8765/`, guardar en `localStorage` la clave `caja-api` = `http://127.0.0.1:8765/mockgh`
  y conectar con la llave de prueba `prueba-local`.

## Datos que añade un asistente (opcional, v1.4)

Además de `config.json` y `movimientos/AAAA-MM.csv` (que escribe el móvil), el repositorio privado puede tener
`auto.json`, que escribe otra herramienta (por ejemplo, un asistente que lee el bróker o los correos del banco).
El móvil **solo lo lee**, nunca lo sube:

- `saldos`: `[{cuenta, fecha, ts, inv, ef, fuente}]` — saldo real leído de fuera (gana al de la cuenta si es más reciente).
- `movs`: movimientos con el mismo formato que los del CSV. `dedupe: true` = no contarlo si ya hay uno apuntado igual
  (mismo importe y cuenta de destino, a menos de 3 días).
- `avisos`: `[{id, texto, hasta}]` — se enseñan arriba en Apuntar hasta que se pulsa «Vale».
- `gestionadas`: `{idCuenta: "quién la actualiza"}` y `posiciones`: `{idCuenta: [{nombre, valor, nota}]}`.

Bolsillos: en los movimientos, `cuenta`/`origen` = `id` es el efectivo de la cuenta e `id:inv` lo invertido.

## Categorías con grupo y cuenta de efectivo (v1.6)

- En `config.json`, una categoría puede llevar `grupo` (`{id, n, i, grupo}`): se llama «n + grupo» (p. ej. «Nómina» +
  «Bar» = «Nómina Bar») y en Mes se suma con las demás de su grupo en una sola fila de Ingresos, con el detalle.
- Una cuenta de liquidez con `metalico: true` (y que no sea la del día a día) es el **efectivo**: billetes y monedas.
  Al apuntar un gasto o ingreso sale «Tarjeta» (o «Banco») y un toque lo pasa a «Efectivo» para ese apunte; entonces
  el movimiento lleva `cuenta` = esa cuenta y sale o entra de ahí en vez de la del día a día. Sacar del cajero es un
  traspaso de la cuenta del día a día a la de efectivo.

## Categorías desde el móvil y copia en un archivo (v1.7)

- **Ajustes → Cambiar categorías:** añadir (16 como mucho por lista; desde la 1.7.1), cambiar nombre e icono, marcar «Es de juego»
  (va en las dos listas con el mismo id) y borrar. Borrar una que ya tiene movimientos o habituales solo la oculta
  (`oculta: true`): no sale en los botones, pero el historial sigue diciendo su nombre y, si era de juego, sigue en neto.
  Se guardan en `cats` de `config.json`. Mientras un cambio hecho en el móvil no se ha subido, las categorías del
  móvil mandan sobre las de GitHub; después, vuelve a mandar GitHub.
- **Ajustes → Copia en un archivo:** «Guardar copia» crea `caja-copia-AAAA-MM-DD.json` (en el iPhone abre Compartir →
  Guardar en Archivos) con `config` (lo mismo que `config.json`) y `movs`. Nunca lleva la llave. «Recuperar copia» la
  lee, dice qué trae y sustituye lo del móvil (con «Deshacer»). Sin GitHub, Apuntar avisa de guardar copia con 10
  movimientos sin ninguna copia o si la última tiene más de un mes.
- El repositorio de GitHub ya no viene escrito: cada persona pone el suyo (`usuario/caja-datos`).
