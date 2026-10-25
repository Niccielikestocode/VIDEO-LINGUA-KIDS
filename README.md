# Video Vocab Adventure

Actúa como un desarrollador experto en frontend y desarrollo web. Tu tarea es crear el código fuente completo, funcional y en un solo archivo (o con una estructura modular clara en HTML, CSS y JavaScript embebido) para un prototipo web educativo llamado "VideoLingua Kids", diseñado para enseñarle inglés a un niño de 10 años mediante videos de YouTube, preguntas interactivas, integración con una IA para feedback de texto y reconocimiento de voz para pronunciación.

Por favor, NO hagas ninguna pregunta aclaratoria, NO pidas confirmación, NO dejes partes incompletas con comentarios como "// TODO" y NO devuelvas explicaciones largas. Limítate a desarrollar y generar todo el código de programación necesario de principio a fin de manera inmediata.

El prototipo debe incluir estrictamente los siguientes componentes y características en una interfaz moderna, limpia, colorida y atractiva para niños:

1. Estructura y Diseño (UI/UX):

- Diseño responsivo (adaptable a PC y tablets), colores amigables, tipografía grande y legible, uso de tarjetas e iconos visuales (estilo lúdico).

- Una barra de navegación superior con el logo y el progreso del usuario (estrellas o puntos).

2. Módulo de Reproductor de YouTube y Añadir Video:

- Un campo de texto (input) donde se pueda pegar una URL de YouTube y un botón "Cargar Video".

- Un contenedor simulado o integrado para reproducir el video de YouTube mediante su enlace/ID.

- Un área debajo para activar/desactivar subtítulos de ejemplo (en inglés y español).

3. Módulo de Preguntas Interactivas:

- Una sección que muestre de 2 a 3 preguntas de opción múltiple basadas en la temática del video.

- Opciones para seleccionar respuestas y un botón para comprobar resultados con efectos visuales de acierto o error (estrellas, caritas o colores verdes/rojos).

- Un cuadro de texto para que el usuario escriba una pequeña respuesta abierta o resumen.

4. Módulo de Integración con IA (Google Gemini API - Simulación o Estructura):

- Un botón "Enviar respuesta a la IA para revisión".

- Un contenedor donde se muestre una respuesta simulada o estructurada de la API de Gemini (por ejemplo: "¡Muy bien escrito! Solo te faltó una 's' al final, pero vas por excelente camino"). El código debe dejar la API Key de Gemini lista en una variable para ser reemplazada fácilmente.

5. Módulo de Laboratorio de Voz (Speech Recognition):

- Un botón de "🎤 Hablar / Grabar" que utilice la Web Speech API nativa del navegador (SpeechRecognition / webkitSpeechRecognition).

- Un espacio visual que muestre en tiempo real lo que el niño va diciendo en inglés.

- Un botón o indicador de evaluación que le dé feedback sobre su pronunciación (por ejemplo, un porcentaje de coincidencia o un mensaje de aliento).

Requisitos técnicos obligatorios:

- Utiliza HTML5, CSS3 (puedes incluir Tailwind CSS mediante CDN en el <head> para que el diseño quede hermoso al instante) y JavaScript vainilla (ES6+) para toda la lógica.

- Asegúrate de que todo el código esté completamente funcional, interconectado y listo para abrirse en un navegador web.

- Entrega el código completo dentro de un bloque de código markdown, sin omitir ninguna sección.

Por favor, no hagas ninguna pregunta y simplemente limítate a desarrollar el prototipo completo ahora mismo.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/00d7bb50-db30-5a80-aa17-83e5a38e4320).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Generar preguntas desde subtítulos de videos propios

La generación automática usa la API oficial de YouTube y solo puede descargar subtítulos de videos que administra la cuenta de Google conectada. Configura un cliente OAuth web en Google Cloud, habilita **YouTube Data API v3**, y añade el origen autorizado `http://localhost:5173` en el cliente OAuth. La app solicita el permiso `youtube.force-ssl` al conectar la cuenta.

Crea `.env.local` en la raíz del proyecto con el ID del cliente OAuth (no es una clave secreta):

```env
VITE_GOOGLE_CLIENT_ID=tu-cliente-oauth.apps.googleusercontent.com
```

Reinicia `npm run dev`, pega la clave de Gemini en la sección de revisión con IA y pulsa **Conectar cuenta de Google** en la sección de preguntas. Inicia sesión con la cuenta propietaria o administradora del video. La API oficial no permite descargar subtítulos de cualquier video público solo porque se vean en el reproductor.

Los temas personalizados generados (preguntas, frases y título) y el tema seleccionado se guardan en el almacenamiento local del navegador para que sigan disponibles al recargar la página en el mismo navegador. El permiso temporal de YouTube también se guarda en ese navegador hasta que vence (normalmente en aproximadamente una hora); al vencer o revocarse, Google pedirá autorizar de nuevo.
