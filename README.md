# Zumbido

Terror en primera persona en un laberinto procedural de luces fluorescentes.

Pasillos amarillentos que no terminan, alfombra húmeda, techos bajos y el zumbido eléctrico de las luces. No hay armas: solo puedes explorar, esconderte y escapar. Y algo te escucha.

> **Aviso de contenido:** oscuridad, tensión, espacios cerrados, luces parpadeantes suaves y sonido envolvente. Sin sangre ni imágenes explícitas. El parpadeo y el movimiento de cámara se pueden reducir en los ajustes. Edad orientativa: 12+ (orientación propia, no es una clasificación oficial).

## Cómo jugar

El juego funciona en el navegador, con teclado y ratón. Haz clic en la vista para capturar el ratón; `Esc` lo suelta y pausa la partida.

**Modos**

- **Salida:** tres niveles (oficina, cochera y almacén). Encuentra la puerta de salida; desde el segundo nivel, primero hay que reunir fusibles para activarla. Se pueden jugar seguidos o por separado, y se guardan los mejores tiempos.
- **Deriva:** un mundo sin fin y sin salida, que cambia de oficina a cochera o almacén según la zona. Cuanto más terreno nuevo explores y más tiempo sobrevivas, más puntos. La criatura se vuelve más atenta con el paso del tiempo.

Cada partida usa una **semilla**: la misma semilla genera siempre el mismo mundo. Puedes elegir una aleatoria, la del día o escribir la tuya (letras y números, de 1 a 16 caracteres).

**La criatura** te oye antes de verte. Los pasos, correr y tocar objetos hacen ruido que viaja por los pasillos y no atraviesa las paredes. Correr hace mucho ruido; agachado y quieto apenas se te oye. Las taquillas y armarios sirven de escondite, salvo si te ven entrar.

### Controles

| Tecla | Acción |
|---|---|
| `W` `A` `S` `D` | Moverse |
| Ratón o flechas | Mirar (las flechas sirven sin ratón) |
| `Shift` | Correr (hace ruido y gasta resistencia) |
| `C` | Agacharse (alterna) |
| `E` | Interactuar: recoger, usar la salida, esconderse |
| `Q` | Marcar con tiza |
| `Esc` o `P` | Pausa |
| `M` | Silenciar |

### Accesibilidad

- **Reducir parpadeo** y **Reducir movimiento**, en el inicio, la pausa y los ajustes. Se activan solos si el sistema pide reducir el movimiento.
- Ningún parpadeo pasa de 3 por segundo y los cambios de brillo son suaves.
- **Se puede jugar sin sonido:** la cercanía de la criatura se muestra con una viñeta y un indicador, el ruido que haces aparece en pantalla y hay subtítulos de sonido.
- Campo de visión, sensibilidad del ratón, inversión del eje vertical y punto central ajustables.
- Calidad gráfica baja, media o alta, y resolución dinámica opcional, que baja la resolución si el juego va lento.

## Privacidad

El juego no recolecta datos personales, no usa cuentas, analítica ni cookies, y no se conecta a ningún servicio externo. Solo guarda en tu navegador, bajo la clave `zumbido:v1` de `localStorage`, los ajustes, el progreso, los mejores tiempos y la última semilla. Puedes borrarlos desde los datos del sitio en tu navegador. El detalle está en [docs/PRIVACY-INVENTORY.md](docs/PRIVACY-INVENTORY.md).

## Desarrollo

Requisitos: Node.js 24 (ver `.nvmrc`) y npm.

```bash
npm ci            # instala las dependencias exactas del lockfile
npm run dev       # servidor de desarrollo
npm run lint      # ESLint
npm run test      # pruebas (Vitest)
npm run build     # comprueba los tipos y genera dist/
npm run preview   # sirve dist/ para probar el build
```

La arquitectura del código se explica en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Despliegue

El juego es estático: todo lo necesario queda dentro de `dist/` y funciona desde cualquier hosting de archivos y bajo cualquier ruta.

Se publica en GitHub Pages con el workflow `.github/workflows/deploy.yml`, que en cada push a `main` ejecuta lint, pruebas y build, y después publica `dist/`. Para activarlo, en el repositorio: **Settings → Pages → Source: GitHub Actions**.

## Licencia

Todos los derechos reservados. Titular: Danny Sivinta. Ver [LICENSE](LICENSE).

El juego usa [Three.js](https://threejs.org/) (licencia MIT). Las licencias de todas las dependencias están en [docs/LICENSES.md](docs/LICENSES.md). El arte se genera por código y el sonido se sintetiza en el navegador: no se usan imágenes, sonidos, fuentes ni modelos de terceros.
