# Parámetros de depuración

Están ocultos por defecto y no se enlazan desde ningún sitio. Se validan al leerlos; si un valor no es válido, se ignora.

| Parámetro | Ejemplo | Efecto |
|---|---|---|
| `debug` | `?debug` o `?debug=1` | Muestra el overlay: FPS, semilla, chunk actual, chunks cargados, ms de generación, luces reales activas, draw calls y geometrías/texturas en memoria. |
| `seed` | `?seed=OFICINA1` | Semilla del mundo de fondo del menú y semilla escrita ya elegida en la pantalla de selección. Solo letras A–Z y números, de 1 a 16 caracteres (se pasa a mayúsculas). |
| `creature` | `?creature=off` | Partida sin criaturas (para recorrer el mundo y probar los niveles). Solo el valor exacto `off` las desactiva; cualquier otro valor se ignora. |

Con el overlay activo, cada criatura tiene una línea: estado (`dormant`, `wander`, `investigate`, `chase`, `search`, `retreat`), posición, distancia por camino hasta el jugador, si lo ve y la fuerza del último ruido que oyó.

Se pueden combinar: `?debug&seed=ABC123&creature=off`.

Con el overlay desactivado no se mide ni se actualiza nada de depuración.

Una partida con `debug` o con `creature=off` no guarda mejores tiempos, marcas de Deriva ni desbloqueos de niveles: los récords solo reflejan partidas normales. `seed` no cuenta como ayuda.
