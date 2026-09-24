# CELRED ADS MANAGER

Crea campañas, conjuntos y anuncios de Meta Ads para **cualquiera de las 13
sedes**, aplicando el *Manual de nomenclatura de campañas Celred v1.2*, con
destino solo WhatsApp, expansión de público apagada, cero optimizaciones
automáticas de Meta, una aprobación humana antes de tocar la API y **todo en
borrador**.

Hay dos formas de usarlo: el **panel** en el navegador y la **consola**. Las dos
hacen exactamente lo mismo y pasan por las mismas validaciones.

---

## Instalar en un equipo nuevo

Versiones con las que el proyecto está probado:

| Programa | Versión | Para qué |
|---|---|---|
| **Node.js** | **22.21.0** (serie 22 LTS) | Ejecuta el sistema. Trae **npm 10.9.4** incluido |
| **Git** | 2.4x o más nueva | Descarga el proyecto y sus actualizaciones |

Las librerías (axios 1.20.0, dotenv 16.6.1, facebook-nodejs-business-sdk 24.0.1,
form-data 4.0.6) no se instalan a mano: quedan fijadas en `package-lock.json`.

Todo lo que sigue se escribe en **PowerShell** (tecla Windows → escribir
"PowerShell" → abrir). Copia **una línea a la vez**.

### Paso 1 · Instalar Node.js y Git (solo la primera vez)

```powershell
winget install -e --id OpenJS.NodeJS.LTS --version 22.21.0
winget install -e --id Git.Git
```

- Si pregunta si aceptas los términos, escribe **S** (o **Y**) y Enter.
- Si Windows pide permiso de administrador, dale **Sí**.
- Si el primer comando no encuentra esa versión, descarga el instalador y dale
  Siguiente → Siguiente → Instalar:
  https://nodejs.org/dist/v22.21.0/node-v22.21.0-x64.msi

### Paso 2 · Cerrar PowerShell y abrirlo de nuevo

Es obligatorio: sin esto, Windows sigue diciendo que *"npm no se reconoce"*.

### Paso 3 · Comprobar que quedó instalado

```powershell
node -v
npm -v
git --version
```

Debe salir **v22.21.0**, **10.9.4** y una versión de git.

Si `npm -v` da un error rojo que dice *"la ejecución de scripts está
deshabilitada"*, pega esto, responde **S** y repite `npm -v`:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Paso 4 · Descargar el proyecto en el escritorio

```powershell
cd ([Environment]::GetFolderPath('Desktop'))
git clone https://github.com/ValeriaAlarcon119/metaADS.git
cd metaADS
npm ci
```

- La primera línea lleva al escritorio aunque se llame "Escritorio" o esté
  dentro de OneDrive.
- Si el repositorio pide iniciar sesión en GitHub, se abre una ventana para
  hacerlo. Tu usuario tiene que estar invitado como colaborador del repositorio.
- Usa **`npm ci`**, no `npm install`: `ci` instala exactamente las versiones de
  `package-lock.json`; `install` puede traer otras más nuevas.

### Paso 5 · Poner los tres archivos que no vienen en el repositorio

El repositorio trae **todo el código**, pero a propósito **no trae tres cosas**.
Ninguna debe viajar por internet, así que se pasan por un canal privado y se
ponen a mano en la carpeta `metaADS`:

| Qué falta | Dónde va | Por qué no está en git |
|---|---|---|
| **`.env`** | en la raíz del proyecto | Lleva un token con control total sobre las dos cuentas publicitarias. Nunca por un grupo ni por correo abierto. Si no te lo pasan, copia `.env.ejemplo` como `.env` y rellénalo. |
| **`lineas.xlsx`** | en la raíz del proyecto | Los 13 teléfonos de WhatsApp y el nombre del líder de cada sede. Son datos personales. |
| **Las piezas** | `creativos/<sede>/` | Fotos y videos, decenas de MB cada uno. Viven en el Drive del equipo creativo (punto 12 del manual). |

Las carpetas de `creativos/` sí vienen creadas, vacías. El archivo se nombra con
la marca y el modelo: `tecnocamon50pro-mocoa.png`.

### Paso 6 · Comprobar que todo responde

```powershell
npm test               # 542 comprobaciones, sin red ni credenciales
npm run revisar-sedes  # las 13 sedes armadas sin conexión: debe decir "problemas: 0"
npm run cuentas        # que el token alcance las cuentas y pueda CREAR en ellas
npm run lineas         # el WhatsApp que le toca a cada sede
```

`npm test` tiene que terminar en **"542 comprobaciones, todas pasaron"**. Si
falla algo, la instalación no quedó bien: no pautes hasta resolverlo.

Para abrir el panel: `npm run panel`, o doble clic en **`abrir-panel.bat`**, que
arranca el panel y abre el navegador sin tocar la consola.

---

## Traer los cambios nuevos (git pull)

Cada vez que alguien avise que subió cambios, en el equipo de cada compañero:

1. **Cerrar el panel** si está abierto (cerrar la ventana negra del panel).
2. Abrir PowerShell y entrar a la carpeta del proyecto:

   ```powershell
   cd ([Environment]::GetFolderPath('Desktop'))\metaADS
   ```

3. Traer los cambios, reinstalar librerías y comprobar:

   ```powershell
   git pull
   npm ci
   npm test
   ```

4. Volver a abrir el panel (`abrir-panel.bat` o `npm run panel`).

`git pull` **no toca** el `.env`, `lineas.xlsx` ni las piezas de `creativos/`:
esos archivos no están en git y se quedan como estaban.

**Si `git pull` dice** *"Your local changes to the following files would be
overwritten"* es que en ese equipo se editó algún archivo del código. Para
dejarlo igual que el repositorio (se pierden esos cambios locales):

```powershell
git stash
git pull
npm ci
```

Si esos cambios locales importan, no lo hagas: avisa antes a quien mantiene el
proyecto.

---

## Subir cambios (git push)

Solo para quien mantiene el proyecto. Desde la carpeta del proyecto:

```powershell
npm test                  # que todo pase ANTES de subir
git status                # revisar qué archivos cambiaron
git add -A
git commit -m "Qué se cambió, en una línea"
git push
```

Después, avisar al equipo para que hagan **git pull** (sección anterior).

El `.env`, `lineas.xlsx`, los PDF y las piezas de `creativos/` **nunca se suben**
aunque se use `git add -A`: el `.gitignore` los excluye. Aun así, revisa
`git status` antes del commit: si alguna vez aparece `.env` en la lista, **no
hagas commit** y avisa.

---

## El panel (recomendado)

```bash
npm run panel        # y abrir http://127.0.0.1:4317
```

### Se dicta en español

Arriba hay un campo de texto. Se escribe como se le diría a alguien:

```
campaña para neiva con infinix hot 60 pro a crédito
campaña para la sede La 16 con iphone 15 de contado objetivo: mensajes
campaña para la victoria con redmi 15, samsung a07 y iphone 13 a crédito
campaña para zafiro a crédito archivo: creativos/zafiro/samsunga17-zafiro.jpg
```

De ahí sale la campaña entera: sede, objetivo, conjuntos, anuncios, creativos y
textos.

**La orden completa, un dato por renglón.** Cuando hay varias piezas o rutas
largas es lo más claro:

```
sede: Victoria
objetivo: mensajes
pago: contado
presupuesto: 30000
archivos:
  C:\Users\...\creativos\victoria\iphone13-victoria.png
  creativos/victoria/infinixhot60pro-victoria.mp4
```

| Dato | Qué se escribe | Si no se dice |
|---|---|---|
| **sede** | El nombre de la tienda: `Victoria`, `La 16`, `Mocoa`… | Obligatorio |
| **equipos** | **Marca y modelo** (`iphone 13`, `tecnocamon50pro`), o la **ruta del archivo** | Obligatorio |
| **objetivo** | `mensajes`, `clientes potenciales` (o `leads`), `ventas`, `reconocimiento`, `tráfico` | El que esté marcado en el selector (Mensajes a WhatsApp) |
| **pago** | `crédito`, `contado` o `retoma` | Crédito |
| **presupuesto** | `30000`, `30 mil`, `$30.000` | $25.000 al día por conjunto |

**El modelo es obligatorio.** «campaña para neiva de android» ya no toma lo que
haya en la carpeta: pide el modelo y muestra cuáles hay. Así nunca se pauta con
el creativo de otro equipo.

**Rutas de archivo.** Se pueden dar de tres formas:

| Cómo | Ejemplo |
|---|---|
| Nombre suelto: se busca en `creativos/<sede>/` | `iphone13-victoria.png` |
| Ruta sin espacios, en la frase | `archivo: creativos/zafiro/samsunga17-zafiro.jpg` |
| Ruta con espacios: entre comillas o en su renglón bajo `archivos:` | `"C:\...\infinixhot60pro neiva.mp4"` |

El equipo **y si es iPhone o Android** se leen del **nombre del archivo**. Un
archivo sin marca ni modelo en el nombre (`foto final.png`) se rechaza con el
nombre que debería tener. Una ruta de la carpeta de **otra** sede se acepta
porque se pidió a propósito, pero sale un aviso para revisarla.

**Objetivo en la orden.** Si la orden lo dice, manda la orden: el selector de la
primera pantalla se mueve solo. `reconocimiento` y `tráfico` son campañas
**regionales** (R#): toman la región de la sede (Mocoa → Putumayo), que se
puede cambiar en esa pantalla.

**Contado lleva precio escrito a mano.** En la etapa 3 aparece el campo
«Precio de contado» por producto. Sin precio la campaña no se deja crear.

Lo demás se deduce:

| Se deduce | De dónde |
|---|---|
| El segmento (`IPH-CRED`, `AND-CONT`…) | De la marca y de si se dice «contado», «crédito» o «retoma» |
| Cuántos conjuntos | Uno por familia: los iPhone por un lado, los Android por otro |
| El formato de cada anuncio | **Del archivo**. Si hay foto **y** video del mismo equipo, crea los **dos** anuncios |
| Los 5 textos, 5 títulos y 5 descripciones | Se generan (ver abajo) y se editan en la etapa 3 |

No hay modelo de lenguaje detrás: es un analizador de reglas, así que es
predecible y funciona sin internet. **Cuando no entiende algo no lo adivina.**
«campaña para pasto» responde que en Pasto hay tres tiendas y pide que se
elija; un equipo sin pieza en la carpeta se reporta con el nombre de archivo que
debería tener.

`npm run interpretar -- "tu frase"` hace lo mismo desde la consola, sin abrir
nada.

### Y luego se aprueba paso a paso

Un asistente de cuatro etapas. En cada una se ve lo que se va a crear y hay tres
botones: **Aprobar**, **Editar** o **Cancelar**.

| Etapa | Qué muestra | Qué se puede editar |
|---|---|---|
| **1. Campaña** | Nombre, objetivo, consecutivo leído de Ads Manager, cuenta y Página | El nombre, si quedó mal |
| **2. Conjuntos** | Cada conjunto con su nombre, presupuesto diario exacto, geolocalización y edades; el WhatsApp de la sede; y la casilla **Expansión Advantage+: DESACTIVADA** | Presupuesto, radio, modo de ubicación, edades, segmento, sufijo, plataformas y dispositivos — **por conjunto** |
| **3. Anuncios** | Vista previa del archivo (la imagen se ve, el video se reproduce) y las 5 opciones de texto, 5 títulos y 5 descripciones de cada anuncio | Todos los textos y el mensaje prellenado |
| **4. Resumen** | Todo junto, y el único botón que llama a Meta: **Enviar a Meta en Borrador (PAUSED)** | — |

Tres cosas que conviene saber:

- **El servidor solo escucha en `127.0.0.1`.** El proceso tiene un token con
  control total sobre las cuentas publicitarias; no se expone a la red y el
  token nunca se manda al navegador.
- **Se crea exactamente el plan que se aprobó.** El plan aprobado se guarda con
  una firma y publicar solo acepta esa firma. Cualquier edición recalcula el
  plan, cambia la firma y borra las aprobaciones de esa etapa en adelante.
- **Desde el panel no se puede publicar en vivo.** El estado está fijado en
  `PAUSED` en el servidor, no en el navegador. Salir en vivo sigue siendo cosa
  de la consola, con doble confirmación.

---

## La consola

```bash
npm test                  # 219 comprobaciones, sin red ni credenciales
npm run campanas          # qué campañas hay definidas
npm run creativos         # qué piezas hay en la carpeta de cada sede
npm run lineas            # qué número de WhatsApp le toca a cada sede

node test-run.js <campana> --sin-meta   # resumen completo sin token de Meta
node test-run.js <campana>              # el flujo real: resumen → S/N → crear
```

`node test-run.js <campana>` hace, en este orden:

1. Carga la campaña desde `campanas/` y la valida entera sin tocar la red.
2. Lee la línea de WhatsApp de la sede en `lineas.xlsx`.
3. Lee de Ads Manager el consecutivo real de la sede y arma los nombres.
4. Imprime el resumen completo: nombres, presupuesto, ubicación, destino,
   expansión de público y los copys de cada anuncio con su conteo de caracteres.
5. **Se detiene** y pregunta `¿Deseas publicar el conjunto de anuncios? (S/N)`.
6. Solo con `S`, crea la campaña, el conjunto y los anuncios **en borrador**.
7. Relee todo en Meta y confirma estado, presupuesto, destino y expansión.

Con `N` o cualquier otra tecla no se envía ni una petición de creación.

---

## Crear una campaña nueva

Tres pasos, para cualquier sede:

**1. Pon las piezas en la carpeta de su sede.**

```
creativos/
  neiva/      tecnocamon50pro-neiva.png
              inifixhot60pro-neiva.mp4
  victoria/   iphone13-victoria.jpg
  la16/       ...
```

`npm run carpetas` crea las 13 de una vez. `npm run creativos` muestra qué hay
en cada una y avisa de los archivos que Meta no va a aceptar.

**2. Copia `campanas/_plantilla.js`** con el nombre que quieras, por ejemplo
`campanas/victoria-iphone-credito.js`, y edita los valores. Está comentado
campo por campo.

**3. Revisa y crea.**

```bash
node test-run.js victoria-iphone-credito --sin-meta   # revisar
node test-run.js victoria-iphone-credito              # crear en borrador
```

### Lo que NO se escribe en el archivo de la campaña

| Dato | De dónde sale |
|---|---|
| Número de campaña `C#` | Se lee de Ads Manager al correr |
| `CJTO#` y `ADS#` | Se calculan solos |
| La fecha `DDMMAA` | Se pone sola |
| El número de WhatsApp | De `lineas.xlsx`, según la sede |
| El estado | Siempre borrador (`PAUSED`) |

### Lo que sí se configura

| Campo | Qué es |
|---|---|
| `sede` | Código del manual: `NEIVA`, `VICTORIA`, `LA16`… |
| `sedeTargeting` | Cuál de las tiendas de esa ciudad (`IPIALES_ZAFIRO`…) |
| `segmento` | Lista cerrada: `AND-CRED`, `IPH-CONT`, `RETOMA`… |
| `sufijoConjunto` | `TEST` mientras se prueba, `OPT` para el ganador |
| `presupuestoDiarioCop` | Va en el **conjunto** (ABO), nunca en la campaña |
| `campanaExistenteId` | `null` crea campaña nueva; un id cuelga de una existente |
| `segmentacion` | Edades, géneros, radio, modo geo, plataformas, dispositivos |
| `anuncios` | Hasta 5, con sus 5 textos, 5 títulos y 5 descripciones |

---

## Las siete reglas que el código impone

No se configuran: están cableadas, y hay una verificación que las comprueba
releyendo los objetos después de crearlos.

1. **Nomenclatura obligatoria.** Cada nombre se arma con `src/nomenclatura.js`
   y pasa por `auditarNombre()` antes de enviarse. Un nombre que no cumpla el
   manual aborta la corrida: no se crea nada.
2. **Todo en borrador.** El archivo de la campaña no puede pedir `ACTIVE`: si
   lo intenta, la validación lo rechaza. Salir en vivo exige la bandera
   `--publicar-en-vivo` **y** teclear el presupuesto para confirmar.
3. **Destino solo WhatsApp.** `destination_type: WHATSAPP` en el conjunto y
   `WHATSAPP_MESSAGE` en el creativo. Los CTA de Messenger y de Instagram
   Direct están en una lista de prohibidos que hace fallar la creación.
4. **Expansión de público apagada por defecto, y explicada.** Todos los
   interruptores salen en 0. Se pueden encender desde el panel —es una decisión
   legítima del que paga— pero **nunca se encienden solos**, cada uno viene con
   su explicación de qué pasa si se activa, y encender cualquiera pide una
   confirmación aparte. Después de crear se relee el conjunto y se compara con
   lo aprobado.
5. **Presupuesto en el conjunto (ABO).** La campaña se crea sin presupuesto
   propio, y la verificación falla si Meta le puso uno.
6. **Aprobación humana.** `crearEstructuraCampana()` no pregunta nada; la pausa
   vive en `test-run.js` y en `servidor.js`, y nadie llama a la creación sin
   pasar por una de las dos.
7. **Cero optimizaciones automáticas.** Veinte funciones de
   `creative_features_spec` se declaran en `OPT_OUT`, una por una. La única
   inscripción activa es `text_optimizations`, y solo porque es lo que permite
   servir las 5 variantes de texto escritas a mano: no genera ni reescribe
   nada. Después de crear se relee el creativo y se reporta cualquier función
   que haya quedado en `OPT_IN`.

---

## Estructura

```
servidor.js                     npm run panel — el asistente web. No hay que editarlo.
test-run.js                     El flujo de consola. Tampoco.
panel/
  index.html                    Las cuatro etapas.
  estilos.css                   Sin fuentes remotas: abre sin internet.
  app.js                        Navegación, edición y la barra de progreso.
campanas/
  _plantilla.js                 Cópiala para crear una campaña nueva.
  mocoa-and-cred.js             La prueba de Mocoa: config + copys, todo junto.
  neiva-and-cred.js             La misma prueba para Neiva.
creativos/<sede>/               Una carpeta por sede, con sus piezas.
herramientas/
  pruebas.js                    npm test — todo lo verificable sin red.
  revisar-sedes.js              npm run revisar-sedes — las 13 sedes armadas sin red.
  ver-lineas.js                 npm run lineas — el número de cada sede.
  ver-creativos.js              npm run creativos — el inventario de piezas.
src/
  nomenclatura.js               El manual v1.2 en código.
  campanas.js                   Descubre y valida los archivos de campanas/.
  ajustes.js                    Lista blanca de lo que el panel puede editar.
  creativos-sede.js             Resuelve las piezas por carpeta de sede.
  lineas.js                     Lee lineas.xlsx sin dependencias externas.
  targeting.js                  Geolocalización por sede y apagado de expansión.
  creatives.js                  Sube imagen y video, y arma el AdCreative.
  tracker.js                    Consecutivos leídos de Ads Manager. Solo lectura.
  builder.js                    Orquesta piezas y creativos → Campaña → Conjunto → Anuncios.
  config.js                     .env, credenciales y datos de la cuenta.
```

---

## Los interruptores de expansión, uno por uno

En la etapa 2 el panel no enseña solo el nombre técnico: de cada interruptor
dice cómo se llama en Ads Manager, **qué pasa de verdad si se enciende** y por
qué está apagado. Todos se pueden marcar y desmarcar con el botón *Editar*.

| Interruptor | En Ads Manager | Si se enciende |
|---|---|---|
| **Público Advantage+**<br>`targeting_automation.advantage_audience` | «Llegar a más personas cuando sea probable que mejore el rendimiento» | Meta deja de respetar la edad y el público que pusiste y muestra el anuncio a quien su modelo crea que puede escribir. La ubicación sí la respeta |
| **Ampliar edad, género y ubicación**<br>`targeting_automation.individual_setting` | No tiene casilla propia: va dentro de Advantage+ | Meta puede salirse del rango de edad y del género. Es lo que hace que un conjunto pedido para 18-55 entregue hasta los 65 |
| **Relajación de públicos similares**<br>`targeting_relaxation_types.lookalike` | «Expansión de público similar» | Si el conjunto usa un lookalike, Meta puede buscar parecidos más lejanos |
| **Relajación de públicos personalizados**<br>`targeting_relaxation_types.custom_audience` | «Expansión de público personalizado» | Si el conjunto usa una lista de clientes, Meta puede salirse de ella |
| **Intereses y comportamientos**<br>`flexible_spec` | «Segmentación detallada» | Segmentaría por intereses en vez de ir a público abierto. **No se marca aquí**: hay que decir *cuáles*, y eso se escribe en el archivo de la campaña |
| **Reparto de presupuesto**<br>`is_adset_budget_sharing_enabled` | «Compartir presupuesto entre conjuntos» | Cada conjunto puede prestar hasta un 20 % de su presupuesto a otro. Con un conjunto por producto, el iPhone se come la plata del Android. Es de la **campaña**: se edita en la etapa 1 |

La lista vive en `INTERRUPTORES_DE_EXPANSION` (`src/targeting.js`) y es la
fuente única: de ahí salen los valores que se envían, la auditoría posterior y
lo que se pinta en pantalla. Si se agrega uno nuevo, aparece solo en el panel.

**Lo que Meta ya no deja apagar** va aparte, en amarillo: la orientación
detallada Advantage. Eliminaron `targeting_optimization` de la API y responden
que «se aplicará a tu conjunto de anuncios». El panel lo dice con esas palabras
en vez de fingir que está apagada.

---

## Los textos que escribe el sistema

Cuando la campaña se dicta, alguien tiene que escribir los 5 textos, 5 títulos y
5 descripciones de cada anuncio. Eso lo hace `src/copys.js`, y conviene saber
exactamente qué puede y qué no puede decir.

**No conoce las características de ningún teléfono.** No sabe qué cámara lleva
un Redmi 15 ni cuánta batería tiene un Samsung A17. Así que los textos hablan
solo de lo comprobable desde aquí: el producto, la tienda, la ciudad, las formas
de pago que permite el segmento y la invitación a escribir por WhatsApp.

**Nunca inventa cifras.** Ni megapíxeles, ni mAh, ni Hz, ni pulgadas, ni
precios, ni descuentos. Hay pruebas que fallan si aparece cualquiera de esas
cosas en un texto generado. Un anuncio con una cifra falsa es un problema de
verdad, no un detalle.

**Respeta las tres prohibiciones del cliente:** no nombra financieras, no pone
capacidad en GB y no menciona a personas en cámara. También hay pruebas para
las tres.

**Y no promete de más:** un conjunto `AND-CONT` no habla de crédito, porque el
asesor tendría que desmentirlo.

Son un punto de partida. La etapa 3 existe justo para leerlos y meterles lo que
el asesor sabe del equipo; el panel lo dice con esas palabras antes de
enseñarlos.

---

## Notas que conviene tener presentes

**El número de WhatsApp no se escribe a mano.** Sale de `lineas.xlsx`. Cuando
una sede tiene varias líneas se prefiere la marcada `LUCID`, que es la del bot
del CRM, y la vista previa lista las demás. `META_WHATSAPP_NUMBER` en el `.env`
es un override manual: si tiene valor, gana sobre el Excel.

**El número va en el conjunto, nunca en la URL.** Es la trampa más cara de los
anuncios de Click to WhatsApp. Es práctica común escribir el enlace como
`https://api.whatsapp.com/send?phone=57...&text=...`, pero Meta **no lo usa**:
resuelve el destino desde `promoted_object.whatsapp_phone_number` del conjunto.
Con el número en la URL el anuncio se publica igual y los mensajes caen en la
línea que tenga la Página — en una red de 13 sedes, eso es mandar los leads de
una tienda a otra sin que nadie se entere. Por eso aquí el enlace va pelado y
el número del Excel se escribe en el conjunto.

**El mensaje prellenado va en `page_welcome_message`**, no en el `?text=` de la
URL. Es el campo `autofill_message.content`, y es lo que permite tener un texto
distinto por producto para que el asesor sepa de qué anuncio viene el lead.

**La cuenta se elige sola según la sede** (manual, punto 7), así que no hay que
tocar el `.env` al cambiar de tienda — que es justo el momento en que uno se
equivoca y crea la campaña de Neiva en la cuenta de Ipiales.

- `2191226887906149` CA 01 — VICTORIA, TUQUERRES, ORITO, MOCOA, MEDELLIN
- `2776880309009610` CA 02 — LA16, SEBASTIAN, LICEO, ZAFIRO, MARKUS, HORMIGA,
  PTOASIS, MEDELLIN, NEIVA

La vista previa dice siempre qué cuenta se eligió y por qué. `META_AD_ACCOUNT_ID`
sigue existiendo como override: si tiene valor, gana sobre la sede, y si no
coincide con lo que dice el manual, aparece un aviso.

**Medellín es la excepción:** está en las dos cuentas, así que hay que decir en
cuál con `cuenta: 'CA 01'` en el archivo de la campaña. Y su `C#` es uno solo
entre ambas, pero `tracker.js` solo ve una cuenta a la vez, así que para
Medellín emite un aviso pidiendo confirmar el consecutivo contra la otra antes
de crear.

**Geolocalización: ciudad o punto.** Las claves de ciudad de Meta de las nueve
ciudades están leídas de los adsets que ya corren, no inventadas. Seis sedes
comparten ciudad —tres en Ipiales, tres en Pasto—: si las seis segmentaran la
ciudad entera competirían entre ellas en la misma subasta encareciéndose, así
que por defecto usan el punto de la tienda. Las otras siete, únicas en su
ciudad, usan la ciudad completa. Cualquier campaña puede forzar el otro modo
con `segmentacion.modoGeo`.

**Los videos grandes suben por partes.** Por encima de 50 MB se usa el protocolo
de tres fases de Meta, con reintento por trozo. La consola muestra la barra de
progreso y luego el estado de procesamiento hasta que quede `ready`.

**Las 5 opciones de texto son el punto no documentado.** Van en
`asset_feed_spec`, que es lo que en Ads Manager se ve como "opciones de texto".
Meta documenta ese campo para *Dynamic Creative* —que admite **un solo anuncio
por conjunto**— y para personalización por ubicación —que exige mínimo dos
reglas—, pero no para dos anuncios normales en un mismo conjunto. Los límites sí
están confirmados: 5 textos, 5 títulos, 5 descripciones, 30 assets en total.

Por eso `construirAdCreative()` prueba una escalera de cinco variantes. **Las
cinco llevan exactamente los mismos textos**: lo único que cambia entre ellas es
el envoltorio —cuántas mejoras se declaran y cómo se codifica el mensaje de
bienvenida—. Ningún reintento reduce el número de textos. Si los cinco fallan,
**el anuncio no se crea** y se reportan los cinco motivos: es preferible no
crearlo a crearlo distinto de lo que se aprobó en pantalla. Bajar a un solo
texto solo pasa si la campaña lo pide a propósito con `modoTexto: 'simple'`.

Un token inválido o un permiso que falta no se reintenta: se reporta y se corta.

**Las mejoras automáticas se apagan una por una.** El paquete
`standard_enhancements` dejó de honrarse en la versión 22 de la API, así que
declararlo no apaga nada por sí solo. Aquí se opta función por función: veinte
en `OPT_OUT`, desde `image_touchups` y `enhance_cta` hasta `text_generation`,
`music` y `3d_animation`.

La única en `OPT_IN` es `text_optimizations`, y conviene entender por qué no es
una excepción a la regla: no genera texto, no lo reescribe y no lo traduce.
Es la inscripción que hace que Meta entregue las 5 variantes que escribió una
persona; sin ella se serviría una sola. El panel lo dice con esas palabras en la
etapa 2, para que la decisión se tome viéndola.

Los nombres de algunas funciones cambian entre versiones de la API. Por eso van
en dos grupos: las confirmadas viajan siempre, y si Meta se queja de alguna de
las otras, el siguiente escalón manda solo las confirmadas. Si ni así acepta la
declaración, el creativo se crea sin ella —los textos no se tocan— y tanto la
consola como el panel lo dicen. **Después de crear, `verificarCreativo()` relee
el creativo desde Meta** y reporta cuántos textos quedaron de verdad y cualquier
función que haya quedado encendida. Eso es lo único que prueba el resultado: lo
que se envía es una intención.

**Después de crear no terminó el trabajo.** El punto 12 del manual pide
actualizar el mismo día el archivo de la sede en Drive, el archivo general de
anuncios por referencia, el Drive de piezas y el Panel de Pauta en Notion; y el
punto 4, anotar el consecutivo en la hoja "Consecutivos". La consola lo recuerda
al final de cada corrida.

---

## Seguridad

El `.env` lleva un token con control total sobre las cuentas publicitarias. No
va a git, no va por WhatsApp, y conviene que sea un token de usuario de sistema
del Business Manager, que no caduca cada 60 días.
