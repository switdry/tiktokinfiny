# 🎵 TikTok Live Comments Reader (TypeScript)

Aplicación web que lee los comentarios de TikTok Live en tiempo real usando Text-to-Speech (TTS) con soporte para voces locales y remotas.

## ✨ Características

- 📱 Monitoreo de múltiples usuarios de TikTok en tiempo real
- 🔊 Lectura automática de comentarios con TTS
- 🌐 **Soporte para voces remotas** (mejor calidad de audio)
- 🎤 Voces locales del navegador
- 🎚️ Configuración de voz, velocidad y volumen
- 🎨 Interfaz moderna y responsiva
- ⚡ Actualización en tiempo real de comentarios
- 🔍 Filtro opcional para solo leer menciones (@)
- 💾 Sistema de caché para audio generado

## 🚀 Instalación

### Requisitos previos

- Node.js (v16 o superior)
- npm o yarn
- TypeScript 5.x

### Pasos de instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Compilar TypeScript:**
```bash
npm run build
```

3. **Iniciar el servidor:**
```bash
npm start
```

4. **Abrir en el navegador:**
   - El servidor estará corriendo en `http://localhost:3000`
   - Abre tu navegador y ve a esa dirección

## 📖 Uso

1. **Abrir la aplicación:**
   - Ve a `http://localhost:3000` en tu navegador (Chrome, Edge o Safari recomendados)

2. **Agregar usuarios:**
   - Ingresa el @ del usuario de TikTok (sin el @)
   - Haz clic en "Agregar Usuario"
   - Puedes agregar múltiples usuarios

3. **Configurar TTS:**
   - **Voces Locales:** Usa las voces instaladas en tu sistema
   - **Voces Remotas:** Activa "Usar voces remotas" para mejor calidad
     - Selecciona una voz remota de la lista
     - Las voces remotas usan APIs de TTS en la nube
   - Ajusta la velocidad (0.5x - 2.0x)
   - Ajusta el volumen (0% - 100%)
   - Activa/desactiva el filtro de menciones

4. **Iniciar monitoreo:**
   - Haz clic en "Iniciar Lectura"
   - Los comentarios aparecerán en tiempo real
   - Se leerán automáticamente con TTS

5. **Detener:**
   - Haz clic en "Detener" para pausar el monitoreo

## 🔧 Configuración del Backend

El servidor backend (`src/server.ts`) se conecta a TikTok Live usando la librería `tiktok-live-connector` y proporciona servicios de TTS remoto.

### Endpoints disponibles:

#### TikTok:
- `POST /api/tiktok/start/:username` - Iniciar monitoreo de un usuario
- `POST /api/tiktok/stop/:username` - Detener monitoreo de un usuario
- `GET /api/tiktok/comments/:username` - Obtener comentarios (polling)
- `GET /api/tiktok/stream/:username` - Stream de comentarios (SSE)
- `GET /api/tiktok/status` - Estado de conexiones activas
- `POST /api/tiktok/stop-all` - Detener todas las conexiones

#### TTS Remoto:
- `GET /api/tts/voices` - Obtener voces remotas disponibles
- `POST /api/tts/speak` - Generar audio desde texto
  ```json
  {
    "text": "Texto a leer",
    "voiceId": "es-ES-Standard-A",
    "provider": "google",
    "speed": 1.0,
    "volume": 1.0
  }
  ```

## 🌐 Voces Remotas

El sistema soporta múltiples proveedores de TTS:

### Google Cloud TTS (Gratis hasta cierto límite)
- Usa Google Translate TTS como fallback gratuito
- No requiere API key para uso básico
- Soporta múltiples idiomas y acentos

### ElevenLabs (Requiere API Key)
Para usar ElevenLabs, configura la variable de entorno:
```bash
ELEVENLABS_API_KEY=tu_api_key
```

### Azure Speech Services (Requiere API Key)
Para usar Azure, configura las variables de entorno:
```bash
AZURE_SPEECH_KEY=tu_api_key
AZURE_SPEECH_REGION=tu_region
```

## 🛠️ Desarrollo

### Modo desarrollo con auto-reload:

```bash
npm run dev
```

### Compilar TypeScript en modo watch:

```bash
npm run watch
```

### Estructura del proyecto:

```
tiktok/
├── src/
│   ├── app.ts              # Lógica del frontend (TypeScript)
│   ├── server.ts           # Servidor backend (TypeScript)
│   ├── types/
│   │   └── index.ts        # Definiciones de tipos
│   └── services/
│       ├── remoteTTS.ts    # Cliente de TTS remoto
│       └── ttsService.ts    # Servicio de TTS en servidor
├── public/
│   ├── index.html          # Interfaz principal
│   └── styles.css          # Estilos
├── dist/                   # Archivos compilados (generado)
├── cache/                  # Caché de audio (generado)
├── tsconfig.json           # Configuración TypeScript
├── package.json            # Dependencias
└── README.md               # Este archivo
```

## ⚠️ Notas importantes

1. **API de TikTok:**
   - Esta aplicación usa una librería de terceros para conectarse a TikTok Live
   - TikTok puede cambiar su API en cualquier momento
   - Asegúrate de mantener las dependencias actualizadas

2. **Navegadores compatibles:**
   - Chrome/Edge: Soporte completo de TTS local y remoto
   - Safari: Soporte completo de TTS local y remoto
   - Firefox: Soporte limitado de TTS local

3. **Permisos:**
   - El navegador puede pedir permiso para usar el micrófono/audio
   - Asegúrate de permitir el acceso para que funcione el TTS

4. **Límites:**
   - TikTok puede limitar el número de conexiones simultáneas
   - Se recomienda monitorear máximo 3-5 usuarios a la vez
   - Las APIs de TTS remotas pueden tener límites de uso

5. **Caché:**
   - Los archivos de audio generados se guardan en `cache/tts/`
   - Esto mejora el rendimiento y reduce llamadas a APIs

## 🐛 Solución de problemas

### El TTS no funciona:
- Verifica que estés usando Chrome, Edge o Safari
- Asegúrate de permitir el acceso de audio en el navegador
- Para voces locales, verifica que haya voces disponibles en tu sistema
- Para voces remotas, verifica que el servidor esté corriendo

### No se obtienen comentarios:
- Verifica que el usuario esté en vivo
- Asegúrate de que el servidor backend esté corriendo
- Revisa la consola del navegador para errores
- Verifica que el nombre de usuario sea correcto (sin @)

### Error de conexión:
- Verifica que el servidor esté corriendo en el puerto 3000
- Asegúrate de que no haya un firewall bloqueando la conexión
- Revisa los logs del servidor para más detalles

### Error con voces remotas:
- Verifica que el servidor esté corriendo
- Revisa los logs del servidor para errores de API
- Si usas ElevenLabs o Azure, verifica que las API keys estén configuradas

## 📝 Licencia

MIT

## 🙏 Agradecimientos

- [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) - Librería para conectar con TikTok Live
- TypeScript - Por el sistema de tipos
- Google Cloud TTS - Por el servicio de TTS gratuito
