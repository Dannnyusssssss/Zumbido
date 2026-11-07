# Parámetros de depuración

Están ocultos por defecto y no se enlazan desde ningún sitio. Se validan al leerlos; si un valor no es válido, se ignora.

| Parámetro | Ejemplo | Efecto |
|---|---|---|
| `debug` | `?debug` o `?debug=1` | Muestra el overlay: FPS, semilla, chunk actual, chunks cargados, ms de generación, luces reales activas, draw calls y geometrías/texturas en memoria. |
| `seed` | `?seed=OFICINA1` | Semilla del mundo de fondo del menú y semilla escrita ya elegida en la pantalla de selección. Solo letras A–Z y números, de 1 a 16 caracteres (se pasa a mayúsculas). |

Se pueden combinar: `?debug&seed=ABC123`.

Con el overlay desactivado no se mide ni se actualiza nada de depuración.
