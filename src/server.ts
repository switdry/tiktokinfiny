import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebcastPushConnection } from 'tiktok-live-connector';
import { Comment } from './types';
import { TTSService } from './services/ttsService';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/dist', express.static('dist'));
app.use('/cache', express.static('cache'));

// Almacenar conexiones activas
interface ActiveConnection {
    connection: WebcastPushConnection;
    comments: Comment[];
    sse: Response | null;
}

const activeConnections = new Map<string, ActiveConnection>();

// Servicio de TTS
const ttsService = new TTSService();

// Servir app-bundle.js con el tipo correcto
app.get('/app-bundle.js', (_req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile('app-bundle.js', { root: 'public' });
});

// Endpoint para iniciar monitoreo de un usuario
app.post('/api/tiktok/start/:username', async (req: Request, res: Response): Promise<void> => {
    const username = req.params.username.replace('@', '').trim();

    if (!username) {
        res.status(400).json({
            success: false,
            error: 'Nombre de usuario requerido',
            username: '',
        });
        return;
    }

    if (activeConnections.has(username)) {
        res.json({
            success: true,
            message: 'Ya está monitoreando este usuario',
            username,
        });
        return;
    }

    console.log(`\n🔗 [${new Date().toISOString()}] Intentando conectar con @${username}...`);

    let tiktokConnection: WebcastPushConnection | null = null;
    const comments: Comment[] = [];
    const maxComments = 100;

    try {
        // Crear conexión
        tiktokConnection = new WebcastPushConnection(username, {
            enableExtendedGiftInfo: true,
        });

        // Configurar handlers ANTES de conectar
        tiktokConnection.on('chat', (data: any) => {
            try {
                const comment: Comment = {
                    user: data.uniqueId || data.nickname || data.userId || 'Usuario',
                    text: data.comment || data.text || '',
                    timestamp: Date.now(),
                    raw: data,
                };

                if (comment.text && comment.text.trim()) {
                    comments.push(comment);
                    console.log(`💬 [${username}] @${comment.user}: ${comment.text.substring(0, 50)}`);

                    if (comments.length > maxComments) {
                        comments.shift();
                    }

                    // Emitir SSE si está disponible
                    const conn = activeConnections.get(username);
                    if (conn?.sse) {
                        try {
                            conn.sse.write(`data: ${JSON.stringify(comment)}\n\n`);
                        } catch (e) {
                            // Ignorar errores de SSE
                        }
                    }
                }
            } catch (e) {
                console.error(`Error procesando chat de ${username}:`, e);
            }
        });

        tiktokConnection.on('connected', () => {
            console.log(`✅ [${username}] Evento 'connected' recibido`);
            // Guardar conexión cuando se confirme que está conectado
            if (!activeConnections.has(username)) {
                activeConnections.set(username, {
                    connection: tiktokConnection!,
                    comments: comments,
                    sse: null,
                });
            }
        });

        tiktokConnection.on('streamEnd', () => {
            console.log(`📺 [${username}] Stream terminado`);
        });

        tiktokConnection.on('disconnected', () => {
            console.log(`🔌 [${username}] Desconectado`);
            activeConnections.delete(username);
        });

        tiktokConnection.on('error', (err: any) => {
            const errorMsg = err?.message || err?.toString() || String(err);
            console.error(`❌ [${username}] Error en conexión:`, errorMsg);
            
            // No eliminar inmediatamente, algunos errores son temporales
            if (errorMsg.includes('roomId') || errorMsg.includes('not found') || errorMsg.includes('404')) {
                console.error(`❌ [${username}] Error crítico, eliminando conexión`);
                activeConnections.delete(username);
            }
        });

        // Intentar conectar con lógica mejorada
        console.log(`⏳ [${username}] Conectando (esto puede tardar hasta 60 segundos)...`);
        
        let connectionSuccess = false;
        let connectionError: any = null;
        let criticalError = false;
        
        // Handler para capturar errores durante la conexión
        const errorHandler = (err: any) => {
            const errorMsg = err?.message || err?.toString() || String(err);
            console.error(`⚠️ [${username}] Error durante conexión:`, errorMsg);
            
            // Solo considerar errores realmente críticos
            if ((errorMsg.includes('roomId') && errorMsg.includes('not found')) || 
                (errorMsg.includes('No roomId') && errorMsg.includes('undefined'))) {
                criticalError = true;
                connectionError = new Error('El usuario no está en vivo o no se pudo encontrar el stream.');
            } else if (errorMsg.includes('404') && errorMsg.includes('roomId')) {
                criticalError = true;
                connectionError = new Error('No se encontró el stream en vivo para este usuario.');
            } else {
                // Errores menores o temporales, ignorar por ahora
                console.log(`ℹ️ [${username}] Error menor/temporal, continuando conexión...`);
            }
        };
        
        tiktokConnection.on('error', errorHandler);
        
        // Variable para rastrear si recibimos eventos
        let receivedEvents = false;
        const eventHandler = () => {
            receivedEvents = true;
            console.log(`✅ [${username}] Evento recibido - conexión funcionando`);
        };
        
        // Escuchar eventos que confirman la conexión
        tiktokConnection.on('chat', eventHandler);
        tiktokConnection.on('gift', eventHandler);
        tiktokConnection.on('like', eventHandler);
        
        // Intentar conectar
        try {
            // Conectar con timeout más largo
            const connectStartTime = Date.now();
            
            await Promise.race([
                tiktokConnection.connect().then(() => {
                    const elapsed = ((Date.now() - connectStartTime) / 1000).toFixed(1);
                    console.log(`✅ [${username}] Método connect() completado en ${elapsed}s`);
                    connectionSuccess = true;
                }).catch((err) => {
                    console.error(`❌ [${username}] Error en connect():`, err?.message || err);
                    // No lanzar error todavía, puede que funcione
                }),
                new Promise<void>((resolve) => {
                    setTimeout(() => {
                        console.log(`⏳ [${username}] Timeout de 60s alcanzado, verificando estado...`);
                        resolve();
                    }, 60000); // 60 segundos
                })
            ]);
            
            // Esperar confirmación adicional
            console.log(`⏳ [${username}] Esperando confirmación de conexión (hasta 10 segundos más)...`);
            
            // Esperar hasta 10 segundos para recibir eventos o confirmación
            await new Promise((resolve) => {
                let waitTime = 0;
                const checkInterval = setInterval(() => {
                    waitTime += 500;
                    
                    // Si recibimos eventos, la conexión está funcionando
                    if (receivedEvents) {
                        console.log(`✅ [${username}] Conexión confirmada por eventos recibidos`);
                        connectionSuccess = true;
                        clearInterval(checkInterval);
                        resolve(undefined);
                    }
                    // Si pasaron 10 segundos, continuar de todas formas si connect() completó
                    else if (waitTime >= 10000) {
                        clearInterval(checkInterval);
                        if (connectionSuccess) {
                            console.log(`✅ [${username}] Conexión confirmada (connect completado)`);
                        }
                        resolve(undefined);
                    }
                }, 500);
            });
            
            // Verificar si hay un error crítico
            if (criticalError && connectionError) {
                console.error(`❌ [${username}] Error crítico detectado:`, connectionError.message);
                throw connectionError;
            }
            
            // Si connect() completó exitosamente, guardar la conexión
            if (connectionSuccess) {
                // Guardar conexión ahora que está confirmada
                if (!activeConnections.has(username)) {
                    activeConnections.set(username, {
                        connection: tiktokConnection,
                        comments: comments,
                        sse: null,
                    });
                    console.log(`✅ [${username}] Conexión guardada exitosamente`);
                }
            } else {
                // Si no hay éxito pero tampoco error crítico, puede que esté funcionando
                // Esperar un poco más y verificar
                console.log(`⚠️ [${username}] Sin confirmación clara, esperando eventos adicionales...`);
                await new Promise((resolve) => setTimeout(resolve, 5000));
                
                if (receivedEvents || comments.length > 0) {
                    // Si recibimos eventos o comentarios, la conexión está funcionando
                    if (!activeConnections.has(username)) {
                        activeConnections.set(username, {
                            connection: tiktokConnection,
                            comments: comments,
                            sse: null,
                        });
                    }
                    connectionSuccess = true;
                    console.log(`✅ [${username}] Conexión confirmada por eventos/comentarios`);
                } else if (!criticalError) {
                    // Si no hay error crítico, asumir que funciona y guardar
                    activeConnections.set(username, {
                        connection: tiktokConnection,
                        comments: comments,
                        sse: null,
                    });
                    connectionSuccess = true;
                    console.log(`✅ [${username}] Conexión guardada (sin error crítico)`);
                }
            }
            
        } catch (connectError: any) {
            console.error(`❌ [${username}] Error en conexión:`, connectError?.message || connectError);
            
            // Si hay un error pero recibimos eventos, puede que funcione
            if (receivedEvents || comments.length > 0) {
                console.log(`⚠️ [${username}] Error pero hay eventos, guardando conexión...`);
                if (!activeConnections.has(username)) {
                    activeConnections.set(username, {
                        connection: tiktokConnection,
                        comments: comments,
                        sse: null,
                    });
                }
                connectionSuccess = true;
            } else if (!criticalError) {
                // Si no es error crítico, intentar guardar de todas formas
                console.log(`⚠️ [${username}] Error no crítico, guardando conexión de todas formas...`);
                activeConnections.set(username, {
                    connection: tiktokConnection,
                    comments: comments,
                    sse: null,
                });
                connectionSuccess = true;
            }
            
            // Solo lanzar error si es crítico y no hay eventos
            if (criticalError && !receivedEvents && !connectionSuccess) {
                if (activeConnections.has(username)) {
                    activeConnections.delete(username);
                }
                throw connectError;
            }
        }
        
        // Remover handlers temporales
        tiktokConnection.off('error', errorHandler);
        
        // Verificar estado final
        if (!activeConnections.has(username) && !connectionSuccess) {
            throw new Error('No se pudo establecer la conexión con el stream después de múltiples intentos.');
        }
        
        console.log(`✅ [${username}] Conexión establecida exitosamente`);

        res.json({
            success: true,
            message: `Conectado a @${username}`,
            username,
        });

    } catch (error: any) {
        console.error(`\n❌ [${username}] Error al conectar:`, error?.message || error);
        
        // Limpiar conexión si existe
        if (tiktokConnection) {
            try {
                await tiktokConnection.disconnect().catch(() => {});
            } catch (e) {
                // Ignorar
            }
        }

        // Determinar mensaje de error de forma más precisa
        let errorMessage = 'Error al conectar con TikTok';
        
        if (error) {
            const errorStr = error?.message || error?.toString() || String(error);
            
            // Log detallado del error para depuración
            console.error(`📋 [${username}] Detalles del error:`, {
                message: error?.message,
                stack: error?.stack,
                name: error?.name,
                errorStr: errorStr,
                hasConnection: activeConnections.has(username)
            });
            
            // Verificar si realmente falló o solo tardó
            if (activeConnections.has(username)) {
                // La conexión existe, puede que esté funcionando
                console.log(`⚠️ [${username}] Error reportado pero conexión existe, puede estar funcionando`);
                errorMessage = 'La conexión se estableció pero hubo un error inicial. Verifica si estás recibiendo comentarios.';
            } else if (errorStr.includes('no está en vivo') || errorStr.includes('No roomId') || errorStr.includes('roomId') && errorStr.includes('not found')) {
                errorMessage = 'El usuario no está en vivo en TikTok Live. Asegúrate de que el usuario esté transmitiendo en este momento.';
            } else if (errorStr.includes('TIMEOUT') || errorStr.includes('timeout')) {
                errorMessage = 'La conexión tardó demasiado. Si el usuario está en vivo, intenta nuevamente o verifica tu conexión a internet.';
            } else if (errorStr.includes('status') || errorStr.includes('undefined') || errorStr.includes('Cannot read')) {
                // Estos errores pueden ser temporales, el usuario puede estar en vivo
                errorMessage = 'Error temporal al conectar. Si el usuario está en vivo, intenta nuevamente en unos segundos.';
            } else if (errorStr.includes('not found') || errorStr.includes('404')) {
                errorMessage = 'Usuario no encontrado o no está en vivo. Verifica que el nombre de usuario sea correcto y que esté transmitiendo.';
            } else {
                errorMessage = `Error: ${errorStr.substring(0, 150)}. Si el usuario está en vivo, intenta nuevamente.`;
            }
        }

        res.status(500).json({
            success: false,
            error: errorMessage,
            username,
        });
    }
});

// Endpoint para detener monitoreo
app.post('/api/tiktok/stop/:username', async (req: Request, res: Response): Promise<void> => {
    const username = req.params.username.replace('@', '');

    if (activeConnections.has(username)) {
        const connection = activeConnections.get(username);
        if (connection) {
            try {
                await connection.connection.disconnect();
                console.log(`🛑 [${username}] Monitoreo detenido`);
            } catch (error) {
                console.error(`Error al desconectar ${username}:`, error);
            }
            activeConnections.delete(username);

            res.json({
                success: true,
                message: `Desconectado de @${username}`,
                username,
            });
            return;
        }
    }

    res.json({
        success: false,
        message: 'No hay conexión activa para este usuario',
        username,
    });
});

// Endpoint para obtener comentarios (polling)
app.get('/api/tiktok/comments/:username', (req: Request, res: Response): void => {
    const username = req.params.username.replace('@', '');

    if (activeConnections.has(username)) {
        const connection = activeConnections.get(username);
        if (connection) {
            res.json({
                success: true,
                comments: connection.comments,
                username,
            });
            return;
        }
    }

    res.status(404).json({
        success: false,
        message: 'No hay conexión activa para este usuario',
        comments: [],
        username,
    });
});

// Server-Sent Events para comentarios en tiempo real
app.get('/api/tiktok/stream/:username', (req: Request, res: Response): void => {
    const username = req.params.username.replace('@', '');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (activeConnections.has(username)) {
        const connection = activeConnections.get(username);
        if (connection) {
            connection.sse = res;

            req.on('close', () => {
                if (connection) {
                    connection.sse = null;
                }
            });
            return;
        }
    }

    res.write(`data: ${JSON.stringify({ error: 'No hay conexión activa' })}\n\n`);
    res.end();
});

// Endpoint de estado
app.get('/api/tiktok/status', (_req: Request, res: Response): void => {
    const users = Array.from(activeConnections.keys());
    res.json({
        success: true,
        activeUsers: users,
        count: users.length,
    });
});

// Limpiar todas las conexiones
app.post('/api/tiktok/stop-all', async (_req: Request, res: Response): Promise<void> => {
    const usernames = Array.from(activeConnections.keys());

    for (const username of usernames) {
        const connection = activeConnections.get(username);
        if (connection) {
            try {
                await connection.connection.disconnect();
            } catch (error) {
                console.error(`Error al desconectar ${username}:`, error);
            }
        }
    }

    activeConnections.clear();

    res.json({
        success: true,
        message: 'Todas las conexiones han sido cerradas',
        stopped: usernames,
    });
});

// Endpoint para obtener voces remotas
app.get('/api/tts/voices', async (_req: Request, res: Response): Promise<void> => {
    try {
        const voices = await ttsService.getAvailableVoices();
        res.json({
            success: true,
            voices: voices,
        });
    } catch (error) {
        console.error('Error al obtener voces:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener voces',
            voices: [],
        });
    }
});

// Endpoint para generar speech
app.post('/api/tts/speak', async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, voiceId, provider, speed, volume } = req.body;

        if (!text || !voiceId) {
            res.status(400).json({
                success: false,
                error: 'Texto y voiceId son requeridos',
            });
            return;
        }

        const audioUrl = await ttsService.generateSpeech(text, voiceId, provider, {
            speed: speed || 1.0,
            volume: volume || 1.0,
        });

        res.json({
            success: true,
            audioUrl: audioUrl,
            format: 'mp3',
        });
    } catch (error) {
        console.error('Error al generar speech:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error al generar speech';
        res.status(500).json({
            success: false,
            error: errorMessage,
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📡 Listo para recibir conexiones de TikTok\n`);
});
