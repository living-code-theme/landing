# Auditoría técnica de living-code.dev

**Fecha:** 6 de noviembre de 2026

**Base auditada:** `a3581630a435928f34736bfa12a11bfbca7e9f54`

**Alcance:** sitio público, repositorio local, HTML generado, interacciones, rendimiento, SEO técnico, accesibilidad, seguridad, compatibilidad y validación continua.

## 1. Resultado ejecutivo

Se han implementado las correcciones en este checkout, **sin desplegar, hacer push, ejecutar discovery ni escribir en Cloudflare/R2**. La consulta del sitio público fue de solo lectura. No se ejecutaron `pnpm deploy`, `wrangler deploy`, `pnpm images:prepare` ni la sincronización de repositorios.

Se conserva la identidad existente: Geist y JetBrains Mono, las cuatro paletas, composición ordinaria, camaleón de glifos, cámara 3D, escáner, transiciones de navegación y selección de tema. No se modificaron `data/theme.json`, `src/styles/theme.css` ni los archivos de las fuentes. Las correcciones de contraste reutilizan colores existentes; los ajustes de reflujo actúan cuando el contenido o el texto ampliado no caben.

### Resumen verificable

| Comprobación | Antes | Después |
|---|---:|---:|
| Build estático | Correcto; 60 páginas HTML | Correcto; 60 páginas HTML y sitemap XML |
| Pruebas Node/build | 211/211 | **218/218** |
| Pruebas de navegador | 29/29 | **36/36** |
| Diagnósticos de Astro | 40 errores en la comprobación inicial | **0 errores, 0 warnings y 0 hints**, 72 archivos |
| Avisos de dependencias | 8: cuatro high y cuatro moderate | **0**, con `pnpm audit` |
| Lighthouse móvil: rendimiento | 99 | **99** |
| Lighthouse móvil: accesibilidad | 96 | **100** |
| Lighthouse móvil: buenas prácticas / SEO | 100 / 100 | **100 / 100** |
| Recalcular estilos durante el escáner, movimiento normal | 1,761 s | **0,482 s**, aproximadamente un 73% menos |
| Intervalo p95 entre frames del mismo recorrido | 33,4 ms | **16,8 ms** |
| Sitemap | `/sitemap.xml` devolvía 404 en producción | Generado localmente, 200 y 59 URL canónicas |

Las puntuaciones Lighthouse son de laboratorio local, no de producción después de un despliegue. **No equivalen a una certificación WCAG ni a datos de usuarios reales.** Los resultados completos de las seis ejecuciones Lighthouse, perfiles, tamaños de bundles y smoke tests se conservan en [`audit/measurements.json`](audit/measurements.json).

Se agrupan **19 hallazgos corregidos: 0 P0, 4 P1, 14 P2 y 1 P3**. Los avisos que resultaron ser falsos positivos se documentan aparte y no se cuentan como defectos corregidos.

### Evaluación de salud del frontend

Valoración orientativa de la implementación revisada, no una puntuación normativa:

| Dimensión | Resultado / 4 | Evidencia y límite |
|---|---:|---|
| Accesibilidad | 3 | Semántica, teclado, contraste y preferencias comprobados; falta validación con lectores de pantalla reales |
| Rendimiento | 3 | Carga inicial excelente y menor coste del escáner; WebGL sigue teniendo un coste deliberado |
| Tematización | 4 | Cuatro temas coherentes con sus tokens, persistencia y páginas de sabor explícito |
| Responsive | 3 | Viewports, tacto sintetizado y ampliación de texto comprobados; no dispositivos físicos |
| Integridad de implementación | 4 | Sistema específico del producto, entradas versionadas y límites de confianza claros |
| **Total** | **17/20: bueno** | Sin atribuir cobertura que no se ha ejecutado |

## 2. Método y entorno

- Linux/NixOS, Node **22.23.3**, pnpm **12.9.0**, Chrome **155.0.8059.39**.
- Lighthouse **13.6.0**; axe-core **4.14.0** en la regresión incorporada al repositorio.
- Baseline construido antes de editar y conservado en `/tmp/lc-audit/before-dist`.
- Build final servido mediante Wrangler **local**, sobre HTTPS, con las mismas reglas `_headers` que usa la aplicación. La excepción del certificado autofirmado se limitó al servidor local de pruebas; no se desactivó la validación TLS del sitio público.
- Tres ejecuciones Lighthouse móviles secuenciales por versión, sin ejecutar la suite en paralelo a las mediciones. Se reportan medianas y también se conservan las muestras individuales.
- Recorrido de scroll de cinco segundos por la historia, viewport 390 × 844, DPR 2, emulación móvil/táctil y CPU ralentizada 4× mediante CDP. Una muestra por versión y preferencia de movimiento; no es un estudio estadístico de múltiples dispositivos.
- Análisis estático y pruebas del HTML generado para todas las páginas; recorridos de navegador representativos para `/`, `/ports/`, guías de VS Code y Pi, páginas de los cuatro sabores y una ruta inexistente.
- Axe se ejecuta en **24 combinaciones de ruta/tema más el finder abierto**. Incluye reglas A/AA de WCAG 2.0, 2.1 y 2.2 y buenas prácticas. Los dos casos de interpretación de herramientas de la sección 7 tienen comprobaciones acotadas, no desactivaciones globales de reglas.
- En producción se visitaron `/`, `/ports/`, `/ports/vscode/` y `/flavors/paper/`: respuestas 200, inicialización de controles y finder con **53 resultados**, sin excepciones de página en ese recorrido.
- Se revisaron arquitectura Astro, utilidades de presentación/datos, Markdown/sanitización, carga de capturas, scripts de interacción, WebGL, configuración de hosting, dependencias y workflows.

## 3. Arquitectura y aspectos correctos que se conservaron

El sitio es una aplicación **Astro estática**, no una SPA con backend propio ni un servicio con base de datos. Astro y Tailwind generan las páginas; el router cliente mejora la navegación, pero catálogo, guías y enlaces fundamentales ya existen en HTML.

### Límites de responsabilidad

1. `data/theme.json` y `src/styles/theme.css` son exportaciones de la paleta mantenida en core. No se regeneraron durante esta auditoría.
2. `data/ports.json` es el índice; cada guía se lee de su documento local, limitado en tamaño y verificado por SHA-256. No se descarga ni ejecuta código de los ports al construir el sitio.
3. `src/lib/readme.mjs` trata Markdown/HTML del repositorio como contenido no confiable: sanitización, esquemas de URL limitados y referencias a revisiones fijadas.
4. Finder y previews se entregan como JSON estático con direcciones derivadas del contenido. El finder construye nodos con APIs DOM y `textContent`, no con HTML arbitrario del catálogo.
5. Las capturas usan variantes responsivas y carga diferida. La selección de previews se resuelve antes de activar los `src`, evitando descargar una selección que vaya a descartarse.
6. El campo WebGL persiste entre páginas deliberadamente. Sus cambios de objetivo no deben crear bucles RAF adicionales; el teardown de cada mejora por página está separado de ese renderer persistente.

No se encontró justificación para migrar de framework, añadir una librería de estado, reescribir el renderer o dividir masivamente `site.ts`. Se añadieron contratos de datos y se corrigieron límites concretos, en lugar de una refactorización de alto riesgo.

### Seguridad y operaciones que ya estaban bien

- HTTPS público con redirección HTTP → HTTPS **301**, HSTS, `nosniff`, `DENY`, política de referer y permisos restrictivos.
- CSP generada desde hashes de los scripts emitidos. JavaScript **sin** `unsafe-inline` ni `unsafe-eval`; `script-src-attr 'none'`, `object-src 'none'`, `base-uri 'none'` y `frame-ancestors 'none'`.
- El `unsafe-inline` de **estilos** se mantiene: lo necesita el sistema existente de variables/posicionamiento y no es equivalente a permitir scripts inline.
- Política común entre páginas compatible con las transiciones de Astro. Las pruebas insertan un script no autorizado **solo en el navegador local** y comprueban que no se ejecuta.
- Caching largo e inmutable para assets identificados por contenido; HTML con revalidación. No se impuso un cache largo sobre HTML mutable.
- Acciones de GitHub fijadas a SHA y credenciales de checkout no persistidas. Se conservaron las comprobaciones existentes contra publicar un checkout obsoleto.
- Búsquedas ejecutadas de nombres habituales de archivos secretos y patrones de tokens/claves privadas en los archivos revisados no encontraron coincidencias. Esto no sustituye un análisis de todo el historial o de secretos configurados en GitHub.

## 4. Hallazgos y correcciones

**Prioridades:** P0 bloquea tareas; P1 es una barrera importante o incumplimiento de accesibilidad reproducido; P2 tiene impacto acotado o alternativa; P3 es una mejora técnica de bajo riesgo. La severidad de un aviso upstream no se equipara automáticamente al riesgo de este sitio estático.

Todos los elementos siguientes están **corregidos localmente**. La producción seguirá usando su versión anterior hasta un despliegue autorizado.

| ID / prioridad | Evidencia y causa raíz | Corrección y archivos principales | Verificación |
|---|---|---|---|
| **A01 · P1 — Tabs de sabor con estados ARIA incompatibles** | `syncFlavorUi` añadía `aria-pressed` a los cuatro controles `role="tab"`. El foco secuencial y el nombre del panel tampoco seguían consistentemente a la selección. WCAG 4.1.2. | Distinguir tabs de botones toggle; tabs con `aria-selected`, un único `tabindex="0"` y panel etiquetado por la tab seleccionada. `src/scripts/flavor.ts`, `src/components/Flavors.astro`. | Axe en los cuatro temas; prueba con tecla End, selección, foco y relación tab/panel. |
| **A02 · P1 — Contrastes de texto en previews, rampa y guías Paper** | Números de línea con color de overlay, selección del lenguaje sobre una superficie inadecuada y texto de rampa elegido por un umbral OKLCH/opacity. Los snippets Paper se apoyaban sobre un fondo más oscuro que el base para el que se calculó el contraste. WCAG 1.4.3. | Reutilizar `fg-muted` para números; fondo base para tab seleccionada y snippets Paper; seleccionar tinta de rampa por luminancia sRGB entre los extremos existentes y eliminar opacidad de texto. `LanguagePreview.astro`, `src/pages/flavors/[id].astro`, `src/styles/site.css`. | Axe y cálculo independiente. El par Paper cercano a 4,5 se explica en la sección 7; no se alteró la paleta. |
| **A03 · P1 — Código desbordado no desplazable con teclado** | Los `pre` de guías podían necesitar scroll horizontal sin ser alcanzables por teclado. WCAG 2.1.1. | Regiones de código con `tabindex="0"`, `role="region"` y nombre accesible. El sanitizador normaliza esos atributos en vez de aceptar valores arbitrarios. `src/lib/markdown.mjs`, `src/lib/readme.mjs`. | Guía Pi a 390 px: foco real y ArrowRight producen scroll horizontal; contenido y copia permanecen disponibles. |
| **A04 · P1 — Texto ampliado desbordaba cabecera, hero y contenido** | A 390 px y tamaño de fuente raíz 200%, se reproducían 492 px de ancho de documento; dimensiones rem de los controles y mínimos intrínsecos de grids/tablas empujaban contenido fuera. Relacionado con WCAG 1.4.4/1.4.10. | Tracks `minmax(0,1fr)` donde faltaban, wrapping de acciones, tamaños mínimos de cabecera conservados en 44 px y marca gráfica etiquetada cuando el nombre no cabe mediante container query. Tabla de acentos dentro de una región de scroll nombrada y enfocable. `Header.astro`, `Flavors.astro`, `AppShowcase.astro`, `src/pages/index.astro`, `site.css`. | A 390 px/200%: documento de 390 px y controles dentro del viewport. A 1440 px, redondeo subpíxel de 1 px, sin desbordamiento superior a esa tolerancia. Regresión usa viewport de escritorio estrecho para que la expansión automática del viewport móvil no oculte el problema. |
| **A05 · P2 — Salto de encabezados en el índice de ports** | Componente compartido con h3 incluso al usarse directamente bajo h1 en `/ports/`; axe `heading-order`. | Prop configurable para nivel de encabezado; h2 en índice y h3 donde corresponde en home. `PortList.astro`, `src/pages/ports/index.astro`. | Axe y comprobaciones de estructura generada. |
| **A06 · P2 — Foco dentro de un menú ya cerrado** | Elegir sabor desde el dropdown cerraba la lista dejando el foco en un control oculto. | Restaurar foco al disparador antes de aplicar el tema. `src/scripts/site.ts`. | Prueba del dropdown y elemento activo después de seleccionar. |
| **A07 · P2 — Controles de mejora aparentaban funcionar sin JS** | Tabs/toggles de sabor, adopción y copia seguían siendo botones activos aunque dependían de scripts. | Deshabilitados en HTML y habilitados durante la inicialización correspondiente; ocultar dropdown de tema sin JS, conservando navegación y contenido. `Header.astro`, `Flavors.astro`, `AppShowcase.astro`, páginas de detalle, `markdown.mjs`, `readme.mjs`, `flavor.ts`, `site.ts`, `site.css`. | Navegador con ejecución de scripts deshabilitada: controles de sabor/copia deshabilitados, guías, imágenes de fallback y enlaces disponibles. |
| **A08 · P2 — Cambio de preferencia de movimiento incompleto** | El cursor comprobaba reduced motion solo al iniciar; podía seguir parpadeando tras cambiar la preferencia. Los delays de entrada seguían aplazando contenido. | Sincronizar cursor con media query y visibilidad; cancelar intervalo al desmontar; eliminar delays bajo reduced motion; despertar la historia al cambiar la preferencia. `site.ts`, `site.css`. | Prueba de cambio no-preference → reduce y permanencia del cursor estático; pruebas existentes de historia plana y camaleón reducido. |
| **P01 · P2 — Recálculo de estilos amplificado por variables heredadas** | `--front`, `--band`, `--dir` y `--story-p` cambiaban en ancestros durante scroll y afectaban a muchos descendientes de código. El perfil mostró un coste real, no una conjetura basada en CSS. | Misma fórmula de luz en JS, escribir solo líneas cuyo valor cambia, `@property --glow` no heredable, actualizar escáner y rail localmente. `src/scripts/site.ts`, `src/components/Story.astro`. | Perfil antes/después y regresión que compara la luz de cada línea con la fórmula original; scroll, reverse y navegación por pasos siguen probados. |
| **F01 · P2 — Frame estático de WebGL omitido en reduced motion** | La optimización de dibujar frames alternos podía saltarse el único refresco de un estado estático y quedar idle sin pintarlo. Se reprodujo con una prueba fallida antes de corregir. | Los refrescos event-driven de reduced motion dibujan siempre antes de quedar idle. `src/scripts/living/field.ts`. | Regresión sobre varios retargets: exactamente un dibujo por refresco, sin RAF residual. |
| **L01 · P2 — Liberación incompleta y callbacks tardíos** | La destrucción dependía de perder el contexto, sin liberar explícitamente buffers/textura/programa/shaders; error de link no limpiaba. El companion podía inicializar atlas después del teardown si las fuentes terminaban tarde. | Teardown idempotente, borrado de cuatro buffers, una textura, un programa y dos shaders; vaciar caché; destruir también al fallar el link. Guard `disposed` en companion. `field.ts`, `chameleon-cameo.ts`. | Pruebas de liberación exactamente una vez, error de compilación/link y cero RAF pendientes; regresiones de navegación del companion. No se afirma haber medido una reducción de heap. |
| **F02 · P2 — Fragmento de URL malformado abortaba inicialización** | `decodeURIComponent(location.hash)` podía lanzar antes de terminar el setup de página. | Captura local de ese error sin suprimir el resto de inicialización. `src/scripts/site.ts`. | Carga con `#%E0%A4%A`: controles habilitados y sin excepción no capturada. |
| **F03 · P2 — Finder podía permanecer esperando indefinidamente** | Fetch tenía manejo de rechazo, pero ninguna cota temporal para una conexión que no terminase. | Timeout de 10 s, manteniendo error, enlace a catálogo completo y posibilidad de retry. `src/scripts/port-finder.ts`. | Fallo de red simulado, desaparición de `aria-busy`, enlace `/ports/` y reapertura con carga correcta. La prueba de navegador fuerza un fallo inmediato, no espera diez segundos para simular el timeout. |
| **SEO01 · P2 — Sin sitemap ni referencia propia en robots** | GET público de `/sitemap.xml`: 404. Robots servido por el edge no anunciaba sitemap. | Sitemap estático desde rutas canónicas y robots explícito. `src/lib/seo.mjs`, `src/pages/sitemap.xml.ts`, `public/robots.txt`. | XML 200 en preview, 59 entradas únicas, todas las páginas indexables y ninguna 404 o fragmento JSON. |
| **SEO02 · P2 — Página de error indexable con canonical propio** | Layout compartido generaba canonical también para la 404 y no declaraba noindex. | Prop `noindex`; 404 con `noindex, follow`, sin canonical. `src/layouts/Base.astro`, `src/pages/404.astro`. | Ruta inexistente responde HTTP 404, no soft-404; prueba del HTML y exclusión del sitemap. |
| **SEO03 · P3 — Metadata social sin fallback común** | Home, sabores y ports sin tarjeta específica no tenían imagen de preview propia. | Tarjeta local 1280 × 640 con la marca y colores existentes; fallback OG/Twitter, site_name/locale y WebSite JSON-LD en home. Se conservan tarjetas específicas. `public/social/living-code.jpg`, `Base.astro`. | Dimensiones/formato/bytes servidos comprobados; metadata absoluta y JSON-LD parseable, sin ratings ni claims inventados. |
| **SEC01 · P2 — Ocho avisos transitivos de undici** | `wrangler > miniflare > undici@7.29.1`; cuatro high y cuatro moderate. Afecta herramientas, no un servidor HTTP Node que ejecute el frontend en producción. | Override acotado `miniflare>undici: 7.30.1`, con justificación y lockfile. `pnpm-workspace.yaml`, `pnpm-lock.yaml`. Sin actualización general de Wrangler. | `pnpm audit`: cero en todos los niveles; build, servidor local y 36 pruebas de navegador correctos con el override. |
| **ENG01 · P2 — Tipado fuera de la validación habitual** | Build pasaba pese a 40 errores de diagnósticos iniciales. Contratos de roles/datos y algunas props no coincidían con el uso real. | `tsconfig.json` estricto, `pnpm check`, checker/TypeScript/Node types de desarrollo, contratos en `src/lib/types.ts`, JSDoc en helpers y correcciones puntuales de props/narrowing. | 72 archivos: 0 errores, warnings e hints. No se activó una reescritura/checkJs de todos los módulos JS. |
| **CI01 · P2 — Sin validación aislada de pull requests** | Workflow existente publicaba main/discovery, sin un job equivalente de PR sin credenciales de despliegue. | `.github/workflows/validate.yml`: permisos de lectura, checkout sin credenciales persistidas, install congelado, audit high, check, build y ambas suites. Añadir check al camino de publicación existente. Documentación en `README.md`. | Comandos locales ejecutados; regresiones del workflow existente pasan. **No se ejecutó GitHub Actions remoto ni se activó el despliegue.** |

Además se corrigieron inferencias y eliminaron variables realmente sin uso en el modelo del camaleón. Son limpiezas acotadas; no se atribuye a ellas una optimización de animación no medida.

## 5. Rendimiento antes/después

### Carga inicial: Lighthouse móvil

Medianas de tres ejecuciones por versión contra HTTPS local:

| Métrica | Antes | Después | Interpretación |
|---|---:|---:|---|
| Performance | 99 | 99 | Se mantiene la buena carga inicial |
| Accessibility | 96 | 100 | Corrige el estado ARIA inválido; ver límites de automatización |
| Best practices | 100 | 100 | Sin regresión |
| SEO | 100 | 100 | Lighthouse no detectaba por sí solo el sitemap ausente |
| FCP | 1.658,5 ms | 1.657,3 ms | Sin cambio significativo |
| LCP | 1.658,5 ms | 1.657,3 ms | Sin cambio significativo |
| CLS | 0 | 0 | Sin desplazamiento observado en estas cargas |
| TBT | 32,5 ms | 38 ms | **No mejoró**; +5,5 ms, con valores bajos en ambas versiones |
| Respuesta del servidor local | 3 ms | 4 ms | No representa latencia de producción |
| Bytes transferidos | 366.230 | 360.301 | La selección variable de previews afecta al resultado; no se atribuye esta diferencia a una optimización de red |

TBT por ejecución: antes **32,5 / 24,5 / 36,5 ms**; después **38 / 34 / 38 ms**. No se afirma una mejora de TBT, INP ni Core Web Vitals reales. No se dispone de CrUX/Search Console/RUM para establecerlos.

### Interacción: escáner con CPU 4×

| Métrica durante 5 s de scroll | Antes | Después |
|---|---:|---:|
| Estilos, movimiento normal | 1,760873 s | **0,482376 s** (-72,6%) |
| Trabajo total de tareas, normal | 4,949890 s | **4,098909 s** (-17,2%) |
| Frames observados, normal | 254 | **301** |
| Intervalo p95, normal | 33,4 ms | **16,8 ms** |
| Estilos, reduced motion | 2,454874 s | **0,543103 s** (-77,9%) |
| Trabajo total de tareas, reducido | 4,670741 s | **3,912883 s** (-16,2%) |
| Frames observados, reducido | 285 | **298** |
| Intervalo p95, reducido | 33,3 ms | **16,8 ms** |
| Intervalos >50 ms | 0 en ambos modos | 0 en ambos modos |

El número de recálculos no necesariamente disminuye: se reduce principalmente **el coste de cada recálculo y su propagación**, no la existencia del efecto. La cámara, scan line, brillo, recoloración y morphing siguen presentes. El JS de la fórmula consume algo más de tiempo de script; el ahorro neto está en estilos. Estos perfiles son mediciones locales puntuales, no garantías de 60 fps en todos los dispositivos.

### Bundles y HTML

Suma de todos los archivos emitidos `_astro`, no necesariamente descargados juntos en una navegación. Gzip calculado por archivo:

| Salida | Antes | Después |
|---|---:|---:|
| JS bruto / gzip | 101.090 / 40.696 B | 101.673 / 40.826 B |
| CSS bruto / gzip | 79.125 / 16.319 B | 79.373 / 16.364 B |
| HTML home bruto / gzip | 368.153 / 81.064 B | 369.510 / 81.355 B |

La corrección no intenta presentar un ahorro ficticio de bundle: JS gzip aumenta **130 B**, CSS **45 B** y HTML **291 B**. Las herramientas de chequeo y axe son dependencias de desarrollo, no código de cliente. El HTML incluye el retrato SVG de glifos para los fallbacks; extraerlo o sustituirlo requeriría evaluar sus efectos sobre tema, animación y no-JS, por lo que no se reescribió sin necesidad.

La prueba de galería mantuvo **seis peticiones de capturas** para la selección inicial: cinco thumbnails y una captura completa, sin descargas descartadas. Se verifican tamaños reales de las variantes. No se generaron ni subieron imágenes nuevas a R2.

## 6. Accesibilidad, funcionalidad y compatibilidad ejecutadas

### Cobertura añadida

`test/browser/accessibility.test.mjs` incorpora:

- Escaneos de los cuatro temas, tipos de página representativos y finder abierto.
- Tabs por teclado: selección, un solo punto de tabulación y nombre del panel.
- Retorno del foco tras cerrar selección de tema.
- Scroll de código mediante ArrowRight.
- Copia correcta y fallback ante rechazo de Clipboard API mediante stubs explícitos del navegador; no depende de permisos del portapapeles del host.
- Finder con fallo de red y retry; opción activa desplazable por flechas manteniendo el foco en el combobox.
- URL con fragmento inválido sin abortar setup.
- Cambio de prefers-reduced-motion mientras la página está abierta.
- Fuente raíz al 200% en viewport estrecho, sin confiar en la expansión de viewport móvil.
- Scripting deshabilitado y controles de mejora correctamente inactivos.

`test/seo.test.mjs` comprueba todas las páginas generadas: sitemap exacto, títulos únicos, canonical propio, una h1, description, noindex de 404, metadata social, JSON-LD y referencias ARIA/fragmentos locales que resuelven sin IDs duplicados.

`test/living-field.test.mjs` añade regresiones del frame reducido y liberación de recursos, incluyendo error de link e idempotencia. `test/browser/story.test.mjs` verifica también que la luz local coincide con la fórmula anterior.

### Cobertura existente mantenida

- Navegación cliente, ida/vuelta a guías y sabores, restauración de selección/scroll, transiciones y fallback de imágenes rotas.
- Menú móvil con foco contenido, Escape, cambios de breakpoint, inert del fondo y targets de al menos 44 px en controles comprobados.
- Tacto sintetizado sobre la historia: scroll en ambos sentidos y pulsación de pasos; no es solo un viewport estrecho.
- Story a **320×568, 390×844, 844×390 y 1440×900**, más pruebas de navegación en 320, 390, 768, 844 y 1023 px. Capturas adicionales de home a 320, 390, 768, 1024 y 1440 px no mostraron overflow de página con texto normal.
- Companion: vida en reposo, activación por teclado, salida/regreso, offscreen, reducción de movimiento y reinicialización tras navegación.
- Sanitización de Markdown, validación de referencias/datos, integridad de documentos, selección de imágenes y política CSP.

### Pruebas adicionales puntuales

- **Forced colors emulado:** finder abre y enfoca `port-finder-input`. Es una prueba funcional, no una revisión visual exhaustiva de todos los contrastes de alto contraste.
- **WebGL deshabilitado:** `data-glyphs="off"` y stand-in del hero con opacidad final **1**. Se esperó a que finalizara la transición de fallback antes de medirlo.
- **Texto raíz 200%:** reproducción original de 492 px sobre viewport de 390; final 390 px. En 1440 px queda una diferencia de redondeo de 1 px. Esto aproxima ampliación de texto, no todos los modos de zoom de cada navegador.
- **Comprobación visual:** inspeccionadas capturas comparativas móvil/escritorio y capturas del scanner, pasos de historia y hero final. No se cambió dirección de arte. Las capturas no constituyen una suite de pixel-diff determinista: glifos y previews pueden variar.

## 7. Falsos positivos y decisiones conscientes

### Contraste Paper: precisión de OKLCH

Axe redondea el par a `#6b7378` / `#f4f7f9`, obteniendo aproximadamente **4,488:1**. La conversión de los colores CSS originales, sin cuantizarlos a 8 bits, produce:

- Comentario: `color(srgb 0.420011 0.450339 0.469263)`.
- Base: `color(srgb 0.958282 0.969128 0.977206)`.
- Contraste calculado con luminancia WCAG: **4,50367:1**; el snapshot publica 4,50365.

Se conserva la paleta. La prueba recalcula **solo ese par exacto** con la conversión CSS del navegador y exige ≥4,5. No ignora la regla `color-contrast` para un tema o componente completo. En el recorrido final se verificaron así **ocho nodos**. El margen es muy pequeño: futuras modificaciones, opacidad, otro fondo o exportaciones hex deben volver a medirse. El ratio publicado para OKLCH no garantiza el mismo resultado al convertirlo a hex; ese tema corresponde a core y no se cambió aquí.

### El camaleón es una imagen de glifos, no una etiqueta escrita

`label-content-name-mismatch` interpreta los números y signos del SVG decorativo como si fueran el texto visible del botón. El botón ya tiene `aria-label="Startle the chameleon"`; SVG y canvas están ocultos al árbol accesible. Son un dibujo, no una instrucción que deba recitarse como nombre del botón.

Se mantuvo la identidad del dibujo y su nombre accesible. La regresión verifica exclusivamente este botón nativo, el nombre esperado y que **todos** sus hijos sean gráficos `aria-hidden` o whitespace; si se añade una etiqueta legible, no quedará cubierta por esta excepción. Se revisaron **24 instancias**, una por documento de los recorridos. El advisory puede seguir apareciendo en el JSON crudo de Lighthouse aunque la categoría puntúe 100; no se afirma haber eliminado un fallo real de nombre que no existía.

### Detector mecánico de interfaz

Se ejecutó una vez `impeccable detect --json` sobre componentes, estilos, páginas y layout. Emitió:

- Dos supuestos `broken-image` en `Shot.astro`: spreads de atributos y fuentes diferidas. Las fuentes finales existen, están comprobadas por build/navegador y el estado diferido es intencional; no son placeholders rotos.
- Una preferencia contra Geist: es la tipografía vigente y conservarla es una restricción expresa, no un defecto técnico.
- Una preferencia contra easing spring: es parte de los efectos existentes; no se sustituyó por gusto del detector.

El código de salida 2 acompañó a esos avisos; no fue presentado como una comprobación limpia. No se aplicaron recomendaciones estéticas que contradijeran el alcance.

## 8. Build, tests y CI reproducibles

```sh
pnpm install --frozen-lockfile
pnpm audit
pnpm check
pnpm build
pnpm test
pnpm test:browser
```

Si Chrome no se llama `google-chrome`:

```sh
CHROME_BIN=/ruta/a/chrome pnpm test:browser
```

Resultados finales: **218/218 Node/build y 36/36 navegador**, sin fallos ni tests omitidos. También se completó `pnpm install --frozen-lockfile --offline` con el caché local disponible. Las pruebas de navegador requieren Chrome y usan HTTPS local; algunas comprobaciones de variantes de capturas acceden al host público de imágenes en modo lectura. No debe confundirse el build offline con una promesa de que todas las pruebas de red sean offline.

El nuevo workflow de PR usa Node 24, como el workflow existente. La ejecución local se hizo con Node 22.23.3, permitido por `engines`; la ejecución real de Node 24/GitHub Actions no se ha inventado. Solo se añadieron gates; no se cambió el destino de producción ni se ejecutaron los workflows.

Para repetir Lighthouse, instalar la herramienta de auditoría **en un directorio temporal**, sin convertirla en dependencia de producción, servir `dist` con Wrangler local y ejecutar tres veces:

```sh
pnpm exec wrangler dev --local --local-protocol https --port 4322
# Desde el entorno temporal que contiene Lighthouse:
pnpm exec lighthouse https://127.0.0.1:4322/ \
  --chrome-path=/ruta/a/chrome \
  --chrome-flags='--headless=new --ignore-certificate-errors' \
  --output=json --output-path=/tmp/lighthouse-local.json
```

La excepción de certificado de este comando es **solo para la URL local**. No reutilizarla para evaluar TLS de producción. Los perfiles detallados usaron CDP `Performance.getMetrics`, diferencias de duración y una muestra RAF durante el recorrido de cinco segundos descrito arriba.

## 9. Limitaciones y recomendaciones pendientes

1. **No hubo despliegue.** Sitemap, metadata, fixes y validaciones quedan listos en el repositorio, no activos en el edge público por esta intervención. Tras un despliegue autorizado, verificar sitemap/robots, CSP, noindex y tarjetas sociales en la URL real; Cloudflare puede añadir directivas a robots.
2. **Firefox y WebKit no se validaron con éxito.** Se instaló Playwright aislado y se descargaron sus motores; el lanzamiento falló por bibliotecas compartidas faltantes en NixOS. No se modificó el sistema operativo para forzarlo. Faltan smoke/regresiones de esos motores, Safari/iOS y Android físico.
3. **No se hizo prueba con NVDA, JAWS, VoiceOver o TalkBack.** Axe y teclado no certifican toda WCAG 2.2 AA. Priorizar lector de pantalla + Safari/iOS para tabs, combobox, diálogo, menús y transiciones.
4. **Las mediciones son de laboratorio.** Falta INP/CrUX/RUM, condiciones de red reales, batería y GPU de gama baja. No se instaló telemetría ni se cambió un servicio de producción para obtenerlos. Repetir el perfil en hardware real antes de optimizaciones visualmente invasivas.
5. **No se instalaron los 53 ports ni se ejecutaron comandos de sus guías.** Se comprobó contenido generado, payload de copia y navegación; validar las integraciones de las aplicaciones sigue siendo responsabilidad de sus repositorios. Los enlaces locales se verifican, pero no se realizó un crawler exhaustivo de todos los destinos externos.
6. **Contenido básico sin JS, mejoras con JS.** Navegación, catálogo y guías siguen disponibles. Búsqueda dinámica, selección de sabor, transiciones y copia automática requieren scripts; no se añadieron endpoints ni funciones nuevas para replicarlas en servidor.
7. **Override temporal de seguridad.** Mantenerlo hasta que Wrangler/Miniflare incorporen la versión corregida y el audit siga limpio sin él; no retirarlo solo porque es transitorio. Revisar futuros advisories con contexto de exposición.
8. **Paleta Paper cerca del límite.** Si core publica hex para otros consumidores, volver a calcular el contraste de esa exportación específica. Evitar opacity y fondos alternativos sobre texto que ya tiene un margen mínimo.
9. **Límites de cobertura restantes:** no hay análisis exhaustivo del historial de secretos, pentest de infraestructura ni acceso a configuración administrativa, Search Console o métricas de Cloudflare. No se modificaron estos servicios.

No se recomienda una reescritura, cambiar fuentes/paleta, eliminar las animaciones distintivas ni añadir producto. El siguiente paso técnico es validar la misma implementación en los motores/dispositivos y tecnologías de asistencia que aquí no estaban disponibles.

## 10. Evidencias y archivos entregados

- **`AUDIT.md`**: alcance, severidades, causas, correcciones, mediciones, verificación y pendientes.
- **`audit/measurements.json`**: datos numéricos antes/después, versiones, perfiles, bundles, advisories y smoke tests públicos/locales.
- **Regresiones nuevas:** `test/seo.test.mjs`, `test/browser/accessibility.test.mjs`; ampliaciones en `test/living-field.test.mjs` y `test/browser/story.test.mjs`.
- **Validación:** `tsconfig.json`, `src/lib/types.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/workflows/validate.yml`, gate de check en `.github/workflows/sync-ports.yml` y documentación en `README.md`.
- **Correcciones de runtime/presentación y SEO:** archivos indicados por cada hallazgo de la sección 4.

Durante esta sesión, los informes Lighthouse completos, logs, reproducciones, scripts auxiliares y capturas quedaron en `/tmp/lc-audit/`; las capturas de suites también usan `/tmp/landing-*` y `/tmp/palette-*`. Son artefactos temporales del entorno, no una dependencia del proyecto ni evidencia que vaya a persistir por sí sola fuera de esta máquina. Los resultados esenciales sí quedan entregados en los dos documentos versionables anteriores.
