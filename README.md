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

## Por confirmar, buscar y presupuestos en una hoja (v1.13)

- **Mes tiene tres pestañas:** Resumen (lo de siempre), Buscar y Por confirmar (esta solo con GitHub conectado o si hay
  pagos en la bandeja). La pestaña Mes de abajo lleva un número rojo con los pagos sin confirmar; en Apuntar queda un
  aviso pequeño con «Ver», que lleva a Por confirmar.
- **Por confirmar:** una tarjeta por pago, del más antiguo al más nuevo. Se puede cambiar el **importe** (si pagaste por
  más gente, pones lo tuyo) y la nota. Tocar una categoría **solo la marca**; se apunta al pulsar «Apuntar» (un toque sin
  querer no apunta nada). La categoría que ya usaste con ese comercio sale marcada como «sugerida». «Confirmar lo
  sugerido» apunta de golpe los que tienen sugerencia (pide un segundo toque). «Descartar» lo quita, con Deshacer.
- **Recordar un comercio:** al apuntar, «Recordar» guarda el comercio en `reglas` de `config.json`
  (`{"mercadona": "comidas"}`, clave de `normCom`). La próxima vez que llegue un pago de ese comercio se apunta solo, con el
  importe entero, y sale un aviso con Deshacer (lo deshecho vuelve a Por confirmar y no se apunta solo otra vez). Solo en
  un móvil que ya está conectado y al día (`sync.last`), para no pisar meses en GitHub. La lista de comercios recordados
  está al final de Por confirmar, con «Olvidar».
- **Buscar:** texto (busca en la nota y en el nombre de la categoría, sin tildes, y en el importe: «23,4» encuentra 23,40),
  «Qué» (todo, gastos, ingresos, entre cuentas e inversión, o una categoría, también las borradas) y «Cuándo» (este mes,
  últimos 3 meses, este año o todo). Tocar un apunte lo edita. **Exportar CSV** saca lo que se ve en un archivo para Excel o
  Numbers (punto y coma, coma decimal, gastos en negativo). Funciones `filtrar` y `exportCsv` de `core.js`.
- **Ajustes → Presupuestos:** todas las categorías de gasto en una hoja, con lo gastado este mes, para poner o quitar el
  presupuesto de cada una de una vez. Es el mismo `tope` de antes (también se puede seguir poniendo desde la categoría).

## Tus inversiones y margen de maniobra (v1.14)

- **Patrimonio → «Invertido», «Liquidez» o «Ver tus inversiones»** abre una hoja con: lo invertido y qué parte del patrimonio
  es, con la barra del reparto por cuenta; el bloque **Margen de maniobra**; y un bloque por cuenta de inversión con su %
  propio y cada posición (valor, % sobre todo lo invertido, ganancia en % grande y en euros o dólares pequeño, «desde»).
  Colores tranquilos: flechas ▲▼ sin rojo ni verde. Función `inversiones` de `core.js`.
- **De dónde salen las posiciones:** `auto.json` → `posiciones[idCuenta]` (las pone un asistente) con
  `{nombre, valor, coste, desde}` o, en otra divisa, `{nombre, cantidad, moneda, valorMon, costeMon, valor}` (la ganancia va
  en esa divisa); si a un fondo le falta `coste`, se toma de `fondos[idCuenta]` por ISIN. Si no hay, las que se ponen **a
  mano** en la cuenta (`cuenta.posiciones` de `config.json`: nombre, lo que pusiste, vale hoy, desde); entonces lo invertido de
  la cuenta pasa a ser su suma (sin tocar su efectivo).
- **Margen de maniobra:** el efectivo de cada cuenta (sin la de billetes): «al momento» si ya está en un bróker, «1 día» si
  está en la del día a día o en otra de liquidez. Cuenta con `interes` (% anual, en la hoja de la cuenta) → lo que rinde al
  mes. Datos: meses de gasto que cubre (gasto medio de hasta 3 meses completos), dinero parado en brókers sin rendir y la
  próxima aportación programada (`auto.json` → `ordenes[idCuenta] = [{fondo, importe, dia}]`), cubierta o no.
- La hoja de la cuenta tiene «Para qué es» (`etiqueta`, sale junto al nombre) y «Remunerada al».

## Pagado con, gastos fijos, traspasos de cada mes y apartados (v1.15)

Todo es opcional: no cambia nada hasta que se activa.
- **«¿Con qué has pagado?»**: con dos cuentas o más marcadas «La uso para pagar» (hoja de la cuenta), en Apuntar sale una fila
  de cuentas encima del importe. Se queda elegida la última. El gasto o ingreso lleva esa `cuenta` y sale de ella. En Mes,
  «Por cuenta» dice lo gastado con cada una; al tocar un apunte, «Pagado con» lo cambia.
- **Recurrentes en apartados**: Ingresos, **Gastos fijos** (`fijo: true` + `cat`: casa, seguros…), Suscripciones y **Traspasos
  entre tus cuentas** (`tipo: "traspaso"`, `origen`, `cuenta`; `"id:inv"` = a lo invertido). `noApuntar: true` = solo para
  tenerlo en cuenta (lo trae el extracto). `reparto` = texto que explica un gasto repartido por mes (p. ej. la comunidad).
- **Apartado en una cuenta** (`cuenta.apartado = {n, v, fecha, sub}`): dinero aparte (p. ej. «Verano y viajes») que no cuenta
  como listo para invertir; crece con cada traspaso del recurrente `sub`. Sale en Patrimonio y en el Margen de maniobra.
- **«No contarla como lista para invertir»** (`noMargen`): para las cuentas de gastos.
