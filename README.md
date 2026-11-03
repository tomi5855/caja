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

## Recurrentes, compartir con una IA y diseños (v1.9)

- La pestaña **Habituales** se llama **Recurrentes** (ingresos fijos y suscripciones). Los datos no cambian.
- **Ajustes → Compartir con mi IA:** copia un texto con las instrucciones y todo lo que hay en Caja (patrimonio y cuentas,
  recurrentes, categorías, resumen de cada mes, historial de saldos y cada movimiento con su nota) para pegarlo en
  cualquier IA. Función `promptIA` de `core.js`. Nunca lleva la llave de GitHub.
- **Ajustes → Diseño:** Clásico (por omisión) y cinco de cristal (Cristal celeste, Hielo y menta, Noche de cristal, Aurora
  suave y Aurora naranja). Cada diseño es un bloque `html[data-skin=…]` de variables más una capa común de cristal; se guarda
  solo en el móvil (`localStorage` `caja-skin`) y la letra del diseño se pide a Google Fonts solo al elegirlo.
- El aviso de instalar distingue iPhone/iPad (Compartir), Android (menú) y ordenador (sin aviso).

## Detalle de una categoría (v1.10)

En **Mes**, tocar una fila de «En qué se va» o de «Ingresos» abre su detalle: total del mes, nº de apuntes y días, media,
el mayor, comparación con el mes anterior, «Dónde» (agrupado por la nota) y «Día a día». Tocar un apunte lo edita.

## Presupuestos, evolución y editar apuntes (v1.12)

- **Presupuesto por categoría de gasto** (`tope`, en céntimos, dentro de `cats` de `config.json`): se pone en Ajustes → Cambiar
  categorías → la categoría. En Mes cada fila enseña lo que queda (barra en ámbar desde el 80 % y roja al pasarse) y, al
  apuntar un gasto que cruza el 80 % o el 100 %, el aviso lo dice. Funciones `presupuesto` y `catSave` (`tope`) de `core.js`.
- **Mes contra el anterior:** bajo la cifra grande, lo gastado el mes anterior (en el mes de hoy, hasta el mismo día) y el
  % de diferencia (`compMes`).
- **Evolución del patrimonio** (pestaña Patrimonio): curva en **porcentaje** (sin euros) desde el primer saldo apuntado, con una
  escala que abarca al menos un 10 % para que lo pequeño se vea pequeño. No se guarda una foto diaria: se
  reconstruye con los saldos puestos a mano, los de `auto.json` y los movimientos de cada día (`serie`, `patrimonioA`).
  Una cuenta nueva se queda en su primer saldo antes de existir, sin saltos. Es una reconstrucción: si se corrige un apunte
  antiguo, la curva cambia.
- **Tocar un apunte** (en Mes o en el detalle de una categoría) abre una hoja para cambiar importe, fecha, categoría, nota y
  efectivo, o borrarlo, sin salir de la pantalla, con Deshacer. «Último» en Apuntar tiene «Editar» además de «Quitar».
  Los traspasos siguen con su hoja.
- El aviso con Deshacer dura 3,5 s (antes 6) y los botones pequeños miden 44 px.

## Bandeja de pagos (v1.11)

Un Atajo del iPhone (automatización «Transacción» de Cartera) puede dejar cada pago en el repositorio privado como
`bandeja/<fecha>.json` con `{"importe": "41,20 €", "comercio": "Mercadona", "fecha": "2026-11-02"}` (el importe admite
texto con coma y símbolo; la fecha es opcional y, si falta, se toma del nombre del archivo `AAAAMMDD-HHMMSS.json`). Al abrirse, Caja trae la bandeja y enseña arriba en Apuntar «N pagos por
confirmar»: **Ver** carga importe, comercio y fecha; se elige la categoría (o «Es <categoría>» si ya apuntaste antes ese
comercio) y queda apuntado. Descartar también vale. El archivo se borra de GitHub 7 segundos después (para poder deshacer).
Los archivos mal formados se ignoran. Prueba con el GitHub simulado: `tests/mock_server.py` ya acepta PUT y DELETE.
