# 7TV · Set de temporada

Userscript para [7tv.app](https://7tv.app) que crea un set de emotes de temporada (Halloween, Navidad…) **sin que el chat pierda los emotes normales**.

El problema: si cambias el set activo del canal al de Halloween, desaparecen todos los emotes que solo estaban en el normal. Este script copia el set normal en el de temporada y, opcionalmente, sustituye por nombre los emotes que tienen versión especial. El chat sigue escribiendo `Pog` y ve el `Pog` de Halloween; todo lo demás sigue igual.

## Instalación

1. Instala la extensión [Tampermonkey](https://www.tampermonkey.net/) en tu navegador.
2. Abre este enlace y pulsa **Instalar**:
   **[Instalar el script](https://github.com/TU_USUARIO/7tv-set-temporada/raw/main/7tv-set-temporada.user.js)**
3. Entra en [7tv.app](https://7tv.app) con tu sesión iniciada. Aparecerá un botón **🎃 Set de temporada** abajo a la derecha.

## Uso

Necesitas la URL de cada set: en 7tv.app ve a **Emote Sets**, abre el set y copia la URL (empieza por `7tv.app/emote-sets/…`).

| Campo | Qué poner |
|---|---|
| **Set normal** | El set de siempre del canal. Solo se lee. |
| **Set de reemplazos** *(opcional)* | Un set solo con las versiones de temporada, cada una renombrada **igual** que su emote normal. Solo se lee. |
| **Set de temporada** | El set que se va a rellenar (puede estar vacío). Es el único que se modifica. |

Pulsa **Previsualizar** para ver qué se va a quitar y añadir sin tocar nada, y **Aplicar cambios** cuando te cuadre.

### Dos formas de trabajar

- **Sin set de reemplazos:** copia al set de temporada todo lo que le falte del normal y no quita nada. Si ya has puesto a mano una versión de Halloween con el mismo nombre, la respeta.
- **Con set de reemplazos:** deja el set de temporada como copia exacta del normal, pero con los reemplazos sustituyendo por nombre.

En ambos casos se puede volver a ejecutar cuando añadas emotes nuevos al set normal: solo cambia lo necesario.

## Editores de otros canales

Funciona con permisos de editor. Lo mínimo necesario en **Emote Sets** es **Manage** (y **Create** si el editor va a crear el set de temporada). No hace falta ningún permiso de **Emotes** ni de **User**.

## Privacidad

El script usa la sesión que ya tienes abierta en 7tv.app y solo se comunica con la API de 7TV (`7tv.io`). No envía nada a ningún otro sitio ni guarda tu token. Es un único archivo: puedes leer todo el código antes de instalarlo.

## Avisos

- No es un proyecto oficial de 7TV.
- Usa la API v3 de 7TV. Si 7TV la retira, el script dejará de poder aplicar cambios.
- Prueba primero con un set de destino de prueba.

## Licencia

MIT
