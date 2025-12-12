import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
import { Comment, Gift, StreamEvent, RoomStats } from './types';
import { TTSService } from './services/ttsService';
import { initializeDatabase, saveSetting, getSetting, saveGift, getGifts, saveCustomWidget, getCustomWidgets, deleteCustomWidget, saveGoal, getGoals, updateGoalProgress, deleteGoal, saveAction, getActions, deleteAction, saveEvent, getEvents, clearEvents } from './services/database';
import { normalizeGift } from './services/tiktokGifts';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/dist', express.static('dist'));
app.use('/cache', express.static('cache'));
app.use('/uploads', express.static('uploads'));
app.use('/widgets', express.static('public/widgets'));
app.use('/overlays', express.static('public/overlays'));

// Configurar multer para subir archivos
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads', 'widgets');
        if (!require('fs').existsSync(uploadDir)) {
            require('fs').mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max
app.use('/widgets', express.static('public/widgets'));

interface ActiveConnection {
    connection: any;
    comments: Comment[];
    gifts: Gift[];
    sseClients: Set<Response>;
    roomStats: RoomStats;
    isConnected: boolean;
}

const activeConnections = new Map<string, ActiveConnection>();
const ttsService = new TTSService();

function broadcastEvent(username: string, event: StreamEvent): void {
    const conn = activeConnections.get(username);
    if (conn) {
        const eventData = JSON.stringify(event);
        conn.sseClients.forEach(client => {
            try {
                client.write(`data: ${eventData}\n\n`);
            } catch (e) {
                conn.sseClients.delete(client);
            }
        });
    }
}

app.get('/api/tiktok/events/:username', (req: Request, res: Response): void => {
    const username = req.params.username.replace('@', '').trim();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');

    const conn = activeConnections.get(username);
    if (conn) {
        conn.sseClients.add(res);
        
        if (conn.isConnected) {
            const event: StreamEvent = {
                type: 'connected',
                data: { username },
                timestamp: Date.now()
            };
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        req.on('close', () => {
            conn.sseClients.delete(res);
        });
    } else {
        res.write(`data: ${JSON.stringify({ type: 'error', data: { message: 'No hay conexión activa' }, timestamp: Date.now() })}\n\n`);
    }
});

app.post('/api/tiktok/start/:username', async (req: Request, res: Response): Promise<void> => {
    const username = req.params.username.replace('@', '').trim();

    if (!username) {
        res.status(400).json({ success: false, error: 'Nombre de usuario requerido', username: '' });
        return;
    }

    if (activeConnections.has(username)) {
        const conn = activeConnections.get(username)!;
        res.json({
            success: true,
            message: 'Ya está conectado',
            username,
            stats: conn.roomStats
        });
        return;
    }

    console.log(`\n🔗 [${new Date().toISOString()}] Conectando con @${username}...`);

    let tiktokConnection: any = null;
    const comments: Comment[] = [];
    const gifts: Gift[] = [];
    const maxItems = 100;
    const roomStats: RoomStats = { viewerCount: 0, likeCount: 0, totalViewerCount: 0 };

    try {
        tiktokConnection = new TikTokLiveConnection(username);

        const connData: ActiveConnection = {
            connection: tiktokConnection,
            comments,
            gifts,
            sseClients: new Set(),
            roomStats,
            isConnected: false
        };
        activeConnections.set(username, connData);

        tiktokConnection.on(WebcastEvent.CHAT, async (data: any) => {
            try {
                const comment: Comment = {
                    user: data.user?.uniqueId || data.uniqueId || data.nickname || 'Usuario',
                    text: data.comment || data.text || '',
                    timestamp: Date.now(),
                    profilePicUrl: data.user?.profilePicture?.urls?.[0] || data.profilePictureUrl,
                    raw: data,
                };

                if (comment.text && comment.text.trim()) {
                    comments.push(comment);
                    if (comments.length > maxItems) comments.shift();
                    
                    console.log(`💬 [${username}] @${comment.user}: ${comment.text.substring(0, 50)}`);
                    
                    // Generate TTS URL for the comment (streamed, no caching)
                    const ttsText = encodeURIComponent(`${comment.user} dice: ${comment.text}`);
                    comment.audioUrl = `/api/tts/stream?text=${ttsText}&lang=es`;
                    console.log(`🔊 TTS URL: ${comment.audioUrl}`);
                    broadcastEvent(username, {
                        type: 'comment',
                        data: comment,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                console.error(`Error procesando chat:`, e);
            }
        });

        tiktokConnection.on(WebcastEvent.GIFT, async (data: any) => {
            try {
                // Normalizar el regalo usando la base de datos de regalos reales
                const normalizedGift = normalizeGift(data);
                const giftId = data.giftId || data.gift?.gift_id || data.gift?.giftId || 0;
                const repeatCount = data.repeatCount || data.repeat_count || 1;
                
                const gift: Gift = {
                    id: `${data.user?.uniqueId || data.uniqueId}-${giftId}-${Date.now()}`,
                    user: data.user?.uniqueId || data.uniqueId || data.nickname || 'Usuario',
                    giftName: normalizedGift.name,
                    giftId: giftId,
                    repeatCount: repeatCount,
                    diamondCount: normalizedGift.diamonds, // Usar valor real del regalo
                    timestamp: Date.now(),
                    profilePicUrl: data.user?.profilePicture?.urls?.[0] || data.profilePictureUrl,
                };

                // Guardar en base de datos
                try {
                    await saveGift({
                        ...gift,
                        username: username
                    });
                } catch (dbError) {
                    console.error('Error guardando regalo en BD:', dbError);
                }

                if (data.repeatEnd || data.giftType === 1 || !data.repeatEnd) {
                    gifts.push(gift);
                    if (gifts.length > maxItems) gifts.shift();
                    
                    console.log(`🎁 [${username}] @${gift.user} envió ${gift.repeatCount}x ${gift.giftName} (${gift.diamondCount * gift.repeatCount} diamonds)`);
                    
                    broadcastEvent(username, {
                        type: 'gift',
                        data: gift,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                console.error(`Error procesando regalo:`, e);
            }
        });

        tiktokConnection.on(WebcastEvent.LIKE, (data: any) => {
            try {
                connData.roomStats.likeCount = data.totalLikeCount || connData.roomStats.likeCount;
                
                broadcastEvent(username, {
                    type: 'like',
                    data: {
                        user: data.user?.uniqueId || data.uniqueId || 'Usuario',
                        likeCount: data.likeCount || 1,
                        totalLikeCount: data.totalLikeCount || 0,
                        timestamp: Date.now()
                    },
                    timestamp: Date.now()
                });
            } catch (e) {
                console.error(`Error procesando like:`, e);
            }
        });

        tiktokConnection.on(WebcastEvent.FOLLOW, (data: any) => {
            try {
                broadcastEvent(username, {
                    type: 'follow',
                    data: {
                        user: data.user?.uniqueId || data.uniqueId || data.nickname || 'Usuario',
                        timestamp: Date.now(),
                        profilePicUrl: data.user?.profilePicture?.urls?.[0] || data.profilePictureUrl
                    },
                    timestamp: Date.now()
                });
                console.log(`👤 [${username}] Nuevo seguidor: @${data.user?.uniqueId || data.uniqueId}`);
            } catch (e) {
                console.error(`Error procesando follow:`, e);
            }
        });

        tiktokConnection.on(WebcastEvent.SHARE, (data: any) => {
            try {
                broadcastEvent(username, {
                    type: 'share',
                    data: {
                        user: data.user?.uniqueId || data.uniqueId || 'Usuario',
                        timestamp: Date.now()
                    },
                    timestamp: Date.now()
                });
            } catch (e) {
                console.error(`Error procesando share:`, e);
            }
        });

        tiktokConnection.on(WebcastEvent.ROOM_USER, (data: any) => {
            try {
                connData.roomStats.viewerCount = data.viewerCount || 0;
                connData.roomStats.totalViewerCount = data.topViewers?.length || 0;
                
                broadcastEvent(username, {
                    type: 'roomStats',
                    data: connData.roomStats,
                    timestamp: Date.now()
                });
            } catch (e) {
                console.error(`Error procesando roomUser:`, e);
            }
        });

        tiktokConnection.on(WebcastEvent.CONNECTED, (state: any) => {
            console.log(`✅ [${username}] Conectado! Room ID: ${state?.roomId}`);
            connData.isConnected = true;
            connData.roomStats.viewerCount = state?.viewerCount || 0;
            
            broadcastEvent(username, {
                type: 'connected',
                data: { username },
                timestamp: Date.now()
            });
        });

        tiktokConnection.on(WebcastEvent.STREAM_END, () => {
            console.log(`📺 [${username}] Stream terminado`);
            connData.isConnected = false;
            broadcastEvent(username, {
                type: 'disconnected',
                data: { username },
                timestamp: Date.now()
            });
        });

        tiktokConnection.on(WebcastEvent.DISCONNECTED, () => {
            console.log(`🔌 [${username}] Desconectado`);
            connData.isConnected = false;
            broadcastEvent(username, {
                type: 'disconnected',
                data: { username },
                timestamp: Date.now()
            });
        });

        tiktokConnection.on(WebcastEvent.ERROR, (err: unknown) => {
            let errorMsg = 'Unknown error';
            try {
                if (err instanceof Error) {
                    errorMsg = err.message;
                } else if (typeof err === 'object' && err !== null) {
                    errorMsg = JSON.stringify(err);
                } else {
                    errorMsg = String(err);
                }
            } catch (e) {
                errorMsg = 'Error parsing error';
            }
            console.error(`❌ [${username}] Error:`, errorMsg);
        });

        console.log(`⏳ [${username}] Intentando conectar...`);
        
        await Promise.race([
            tiktokConnection.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de conexión')), 30000))
        ]);

        console.log(`✅ [${username}] Conexión establecida`);

        res.json({
            success: true,
            message: `Conectado a @${username}`,
            username,
            stats: roomStats
        });

    } catch (error: unknown) {
        let errorMessage = 'Error al conectar con TikTok';
        let errorStr = 'Unknown error';
        
        try {
            if (error instanceof Error) {
                errorStr = error.message;
                console.error(`❌ [${username}] Error completo:`, error.stack || error);
            } else if (typeof error === 'object' && error !== null) {
                errorStr = JSON.stringify(error, null, 2);
                console.error(`❌ [${username}] Error objeto:`, error);
            } else {
                errorStr = String(error);
            }
        } catch (e) {
            errorStr = 'Error parsing error';
            console.error(`❌ [${username}] Error original:`, error);
        }
        
        console.error(`❌ [${username}] Error al conectar:`, errorStr);
        
        activeConnections.delete(username);
        
        if (tiktokConnection) {
            try { 
                await tiktokConnection.disconnect(); 
            } catch (disconnectError) {
                console.error(`Error disconnecting:`, disconnectError);
            }
        }
        
        if (errorStr.toLowerCase().includes('not found') || 
            errorStr.toLowerCase().includes('roomid') ||
            errorStr.toLowerCase().includes('offline') ||
            errorStr.toLowerCase().includes('no live')) {
            errorMessage = 'El usuario no está en vivo. Asegúrate de que esté transmitiendo.';
        } else if (errorStr.toLowerCase().includes('timeout')) {
            errorMessage = 'Tiempo de espera agotado. Intenta de nuevo.';
        } else if (errorStr.toLowerCase().includes('network') || errorStr.toLowerCase().includes('fetch')) {
            errorMessage = 'Error de red. Verifica tu conexión a internet.';
        } else {
            errorMessage = 'No se pudo conectar. Verifica que el usuario esté en vivo.';
        }

        res.status(500).json({ success: false, error: errorMessage, username });
    }
});

app.post('/api/tiktok/stop/:username', async (req: Request, res: Response): Promise<void> => {
    const username = req.params.username.replace('@', '');

    if (activeConnections.has(username)) {
        const conn = activeConnections.get(username)!;
        try {
            await conn.connection.disconnect();
            conn.sseClients.forEach(client => {
                try { client.end(); } catch (e) {}
            });
        } catch (error) {
            console.error(`Error al desconectar ${username}:`, error);
        }
        activeConnections.delete(username);
        console.log(`🛑 [${username}] Desconectado`);
        res.json({ success: true, message: `Desconectado de @${username}`, username });
        return;
    }

    res.json({ success: false, message: 'No hay conexión activa', username });
});

app.get('/api/tiktok/comments/:username', (req: Request, res: Response): void => {
    const username = req.params.username.replace('@', '');
    const conn = activeConnections.get(username);

    if (conn) {
        res.json({ success: true, comments: conn.comments, username });
    } else {
        res.status(404).json({ success: false, comments: [], username });
    }
});

app.get('/api/tiktok/gifts/:username', (req: Request, res: Response): void => {
    const username = req.params.username.replace('@', '');
    const conn = activeConnections.get(username);

    if (conn) {
        res.json({ success: true, gifts: conn.gifts, username });
    } else {
        res.status(404).json({ success: false, gifts: [], username });
    }
});

app.get('/api/tiktok/stats/:username', (req: Request, res: Response): void => {
    const username = req.params.username.replace('@', '');
    const conn = activeConnections.get(username);

    if (conn) {
        res.json({ success: true, stats: conn.roomStats, isConnected: conn.isConnected, username });
    } else {
        res.status(404).json({ success: false, stats: null, username });
    }
});

app.get('/api/tiktok/status', (_req: Request, res: Response): void => {
    const users = Array.from(activeConnections.entries()).map(([username, conn]) => ({
        username,
        isConnected: conn.isConnected,
        stats: conn.roomStats,
        commentsCount: conn.comments.length,
        giftsCount: conn.gifts.length
    }));
    res.json({ success: true, users, count: users.length });
});

app.post('/api/tiktok/stop-all', async (_req: Request, res: Response): Promise<void> => {
    const usernames = Array.from(activeConnections.keys());

    for (const username of usernames) {
        const conn = activeConnections.get(username);
        if (conn) {
            try {
                await conn.connection.disconnect();
                conn.sseClients.forEach(client => {
                    try { client.end(); } catch (e) {}
                });
            } catch (error) {
                console.error(`Error al desconectar ${username}:`, error);
            }
        }
    }

    activeConnections.clear();
    res.json({ success: true, message: 'Todas las conexiones cerradas', stopped: usernames });
});

app.get('/api/tts/voices', async (_req: Request, res: Response): Promise<void> => {
    try {
        const voices = await ttsService.getAvailableVoices();
        res.json({ success: true, voices });
    } catch (error) {
        console.error('Error al obtener voces:', error);
        res.status(500).json({ success: false, error: 'Error al obtener voces', voices: [] });
    }
});

app.get('/api/tts/stream', async (req: Request, res: Response): Promise<void> => {
    try {
        const text = req.query.text as string;
        const lang = (req.query.lang as string) || 'es';

        if (!text) {
            res.status(400).json({ success: false, error: 'Texto requerido' });
            return;
        }

        const audioBuffer = await ttsService.generateSpeechBuffer(decodeURIComponent(text), lang);
        
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length.toString(),
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.send(audioBuffer);
    } catch (error) {
        console.error('Error al generar TTS stream:', error);
        res.status(500).json({ success: false, error: 'Error al generar audio' });
    }
});

app.post('/api/tts/speak', async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, voiceId } = req.body;

        if (!text || !voiceId) {
            res.status(400).json({ success: false, error: 'Texto y voiceId son requeridos' });
            return;
        }

        const audioUrl = `/api/tts/stream?text=${encodeURIComponent(text)}&lang=${voiceId}`;
        res.json({ success: true, audioUrl, format: 'mp3' });
    } catch (error) {
        console.error('Error al generar speech:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error al generar speech';
        res.status(500).json({ success: false, error: errorMessage });
    }
});

app.get('/widget/chat/:username', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'chat.html'));
});

app.get('/widget/chat', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'chat.html'));
});

app.get('/widget/alerts/:username', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'alerts.html'));
});

app.get('/widget/alerts', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'alerts.html'));
});

app.get('/widget/goals/:username', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'goals.html'));
});

app.get('/widget/goals', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'goals.html'));
});

app.get('/widget/gifts/:username', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'gifts.html'));
});

app.get('/widget/gifts', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'gifts.html'));
});

// Rutas para overlays y widgets adicionales
app.get('/widgets/recent-gifts.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'recent-gifts.html'));
});

app.get('/widgets/top-gifters.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'top-gifters.html'));
});

app.get('/widgets/gift-goal.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'gift-goal.html'));
});

app.get('/widgets/gift-alert.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'gift-alert.html'));
});

// Rutas para overlays (redirigen a widgets)
app.get('/overlays/recent-gifts.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'recent-gifts.html'));
});

app.get('/overlays/chat.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'chat.html'));
});

app.get('/overlays/gifts.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'gifts.html'));
});

app.get('/overlays/viewers.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'chat.html')); // Reutilizar chat para viewers
});

app.get('/overlays/stats.html', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'gifts.html')); // Reutilizar gifts para stats
});

// Widget personalizado
app.get('/widgets/custom/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const widgets = await getCustomWidgets();
        const widget = widgets.find((w: any) => w.id === req.params.id);
        
        if (!widget || !widget.enabled) {
            res.status(404).send('Widget no encontrado o deshabilitado');
            return;
        }
        
        const config = typeof widget.config === 'string' ? JSON.parse(widget.config) : widget.config;
        const html = generateCustomWidgetHTML(widget, config);
        res.send(html);
    } catch (error) {
        console.error('Error generando widget:', error);
        res.status(500).send('Error al generar widget');
    }
});

function generateCustomWidgetHTML(widget: any, config: any): string {
    const bgStyle = widget.image_url 
        ? `background-image: url(${widget.image_url}); background-size: cover; background-position: center;`
        : `background-color: ${config.bgColor || '#000000'};`;
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${widget.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            overflow: hidden;
            ${bgStyle}
            color: ${config.textColor || '#ffffff'};
            font-size: ${config.fontSize || 16}px;
        }
        .widget-container {
            padding: 20px;
            border: 2px solid ${config.accentColor || '#ff0050'};
            border-radius: 12px;
            backdrop-filter: blur(10px);
            background: ${widget.image_url ? 'rgba(0, 0, 0, 0.5)' : 'transparent'};
        }
        .gift-alert {
            text-align: center;
        }
        .gift-user {
            font-weight: 700;
            color: ${config.accentColor || '#ff0050'};
            font-size: 1.2em;
            margin: 8px 0;
        }
        .gift-name {
            font-size: 1em;
            margin: 4px 0;
        }
        .gift-diamonds {
            color: ${config.accentColor || '#ff0050'};
            font-weight: 600;
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="widget-container gift-alert" id="widgetContent">
        <div>Esperando regalos...</div>
    </div>
    <script>
        const apiUrl = window.location.origin;
        const username = new URLSearchParams(window.location.search).get('user') || '';
        
        function updateWidget(gift) {
            const content = document.getElementById('widgetContent');
            content.innerHTML = \`
                <div style="font-weight: 700; margin-bottom: 8px;">🎁 Regalo Recibido</div>
                <div class="gift-user">@\${escapeHtml(gift.user)}</div>
                <div class="gift-name">\${escapeHtml(gift.giftName)} x\${gift.repeatCount || 1}</div>
                <div class="gift-diamonds">💎 \${(gift.diamondCount || 0) * (gift.repeatCount || 1)}</div>
            \`;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        if (username) {
            const eventSource = new EventSource(\`\${apiUrl}/api/tiktok/events/\${username}\`);
            eventSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'gift') {
                        updateWidget(data.data);
                    }
                } catch (err) {
                    console.error('Error:', err);
                }
            };
            eventSource.onerror = () => {
                eventSource.close();
                setTimeout(() => connectSSE(), 3000);
            };
        }
    </script>
</body>
</html>
    `;
}

// API para configuraciones
app.get('/api/settings/:key', async (req: Request, res: Response): Promise<void> => {
    try {
        const value = await getSetting(req.params.key);
        res.json({ success: true, key: req.params.key, value });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener configuración' });
    }
});

app.post('/api/settings/:key', async (req: Request, res: Response): Promise<void> => {
    try {
        await saveSetting(req.params.key, req.body.value);
        res.json({ success: true, message: 'Configuración guardada' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al guardar configuración' });
    }
});

// API para regalos guardados
app.get('/api/gifts/:username', async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const gifts = await getGifts(req.params.username.replace('@', ''), limit);
        res.json({ success: true, gifts });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener regalos' });
    }
});

// API para widgets personalizados
app.get('/api/widgets', async (req: Request, res: Response): Promise<void> => {
    try {
        const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
        const widgets = await getCustomWidgets(enabled);
        res.json({ success: true, widgets });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener widgets' });
    }
});

app.post('/api/widgets', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
    try {
        console.log('📥 ========== RECIBIENDO WIDGET ==========');
        console.log('Body keys:', Object.keys(req.body));
        console.log('Body completo:', JSON.stringify(req.body, null, 2));
        console.log('File:', req.file ? {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        } : 'No file');
        
        const { id, name, type, config, message, triggerGift, enabled } = req.body;
        
        // Validar campos requeridos
        if (!name || name.trim() === '') {
            console.error('❌ Nombre faltante');
            res.status(400).json({ success: false, error: 'El nombre del widget es requerido' });
            return;
        }
        
        if (!type || type.trim() === '') {
            console.error('❌ Tipo faltante');
            res.status(400).json({ success: false, error: 'El tipo del widget es requerido' });
            return;
        }
        
        const imageUrl = req.file ? `/uploads/widgets/${req.file.filename}` : undefined;
        console.log('✅ Image URL:', imageUrl || 'Sin imagen');
        
        // Parsear config de forma segura
        let widgetConfig: any = {};
        if (config) {
            try {
                widgetConfig = typeof config === 'string' ? JSON.parse(config) : config;
                if (!widgetConfig || typeof widgetConfig !== 'object') {
                    console.warn('⚠️ Config no es objeto válido, usando defaults');
                    widgetConfig = {};
                }
            } catch (parseError) {
                console.error('❌ Error parseando config:', parseError);
                widgetConfig = {};
            }
        }
        
        const widgetId = id || `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log('✅ Widget ID generado:', widgetId);
        
        const widgetData = {
            id: widgetId,
            name: String(name).trim(),
            type: String(type).trim(),
            config: widgetConfig,
            imageUrl,
            message: message ? String(message).trim() : undefined,
            triggerGift: triggerGift ? String(triggerGift).trim() : undefined,
            enabled: enabled === 'true' || enabled === true || enabled === '1' || enabled === 1 || enabled === 'true'
        };
        
        console.log('💾 Datos del widget a guardar:', {
            id: widgetData.id,
            name: widgetData.name,
            type: widgetData.type,
            hasConfig: !!widgetData.config,
            hasImage: !!widgetData.imageUrl,
            hasMessage: !!widgetData.message,
            hasTrigger: !!widgetData.triggerGift,
            enabled: widgetData.enabled
        });
        
        await saveCustomWidget(widgetData);
        
        console.log('✅ ========== WIDGET GUARDADO EXITOSAMENTE ==========');
        res.json({ success: true, message: 'Widget guardado exitosamente', id: widgetId, widget: widgetData });
    } catch (error) {
        console.error('❌ ========== ERROR GUARDANDO WIDGET ==========');
        console.error('Error completo:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ 
            success: false, 
            error: `Error al guardar widget: ${errorMessage}`,
            details: error instanceof Error ? error.stack : undefined
        });
    }
});

app.delete('/api/widgets/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        await deleteCustomWidget(req.params.id);
        res.json({ success: true, message: 'Widget eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al eliminar widget' });
    }
});

// API para metas
app.get('/api/goals', async (req: Request, res: Response): Promise<void> => {
    try {
        const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
        const goals = await getGoals(enabled);
        res.json({ success: true, goals });
    } catch (error) {
        console.error('Error obteniendo metas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener metas' });
    }
});

app.post('/api/goals', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id, name, type, target, current, color, enabled } = req.body;
        
        await saveGoal({
            id: id || `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            type,
            target: parseInt(target),
            current: parseInt(current) || 0,
            color: color || '#fe2c55',
            enabled: enabled !== false
        });
        
        res.json({ success: true, message: 'Meta guardada' });
    } catch (error) {
        console.error('Error guardando meta:', error);
        res.status(500).json({ success: false, error: 'Error al guardar meta' });
    }
});

app.put('/api/goals/:id/progress', async (req: Request, res: Response): Promise<void> => {
    try {
        const { current } = req.body;
        await updateGoalProgress(req.params.id, parseInt(current));
        res.json({ success: true, message: 'Progreso actualizado' });
    } catch (error) {
        console.error('Error actualizando progreso:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar progreso' });
    }
});

app.delete('/api/goals/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        await deleteGoal(req.params.id);
        res.json({ success: true, message: 'Meta eliminada' });
    } catch (error) {
        console.error('Error eliminando meta:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar meta' });
    }
});

// Widget HTML para metas
app.get('/widgets/goal/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const goals = await getGoals();
        const goal = goals.find((g: any) => g.id === req.params.id);
        
        if (!goal) {
            res.status(404).send('Meta no encontrada');
            return;
        }
        
        const percent = Math.min(100, (goal.current / goal.target) * 100);
        const goalIcons: { [key: string]: string } = {
            diamonds: '💎',
            gifts: '🎁',
            followers: '👥',
            likes: '❤️',
            comments: '💬'
        };
        
        res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meta: ${goal.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: transparent;
            padding: 20px;
        }
        .goal-container {
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            max-width: 400px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .goal-title {
            color: #fff;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .goal-icon {
            font-size: 24px;
        }
        .goal-progress {
            position: relative;
            height: 30px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            overflow: hidden;
            margin-bottom: 10px;
        }
        .goal-bar {
            height: 100%;
            background: linear-gradient(90deg, ${goal.color}, ${goal.color}dd);
            border-radius: 15px;
            transition: width 0.5s ease-out;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 10px;
            min-width: 40px;
        }
        .goal-percent {
            color: #fff;
            font-weight: 700;
            font-size: 14px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        .goal-stats {
            display: flex;
            justify-content: space-between;
            color: rgba(255, 255, 255, 0.8);
            font-size: 14px;
        }
        .goal-current {
            color: #25f4ee;
            font-weight: 600;
        }
        .goal-target {
            color: #fe2c55;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="goal-container">
        <div class="goal-title">
            <span class="goal-icon">${goalIcons[goal.type] || '🎯'}</span>
            <span id="goalName">${goal.name}</span>
        </div>
        <div class="goal-progress">
            <div class="goal-bar" id="goalBar" style="width: ${percent}%">
                <span class="goal-percent" id="goalPercent">${Math.round(percent)}%</span>
            </div>
        </div>
        <div class="goal-stats">
            <span>Actual: <span class="goal-current" id="goalCurrent">${goal.current.toLocaleString()}</span></span>
            <span>Meta: <span class="goal-target" id="goalTarget">${goal.target.toLocaleString()}</span></span>
        </div>
    </div>

    <script>
        const apiUrl = window.location.origin;
        const goalId = '${goal.id}';
        const goalTarget = ${goal.target};
        let currentValue = ${goal.current};
        
        const goalBar = document.getElementById('goalBar');
        const goalPercent = document.getElementById('goalPercent');
        const goalCurrent = document.getElementById('goalCurrent');
        
        function updateProgress(value) {
            currentValue = value;
            const percent = Math.min(100, (currentValue / goalTarget) * 100);
            goalBar.style.width = \`\${percent}%\`;
            goalPercent.textContent = \`\${Math.round(percent)}%\`;
            goalCurrent.textContent = currentValue.toLocaleString();
        }

        function fetchGoalProgress() {
            fetch(\`\${apiUrl}/api/goals\`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        const goal = data.goals.find(g => g.id === goalId);
                        if (goal) {
                            updateProgress(goal.current);
                        }
                    }
                })
                .catch(err => console.error('Error:', err));
        }

        // Actualizar cada 2 segundos
        setInterval(fetchGoalProgress, 2000);
        fetchGoalProgress();
    </script>
</body>
</html>
        `);
    } catch (error) {
        console.error('Error generando widget de meta:', error);
        res.status(500).send('Error al generar widget');
    }
});

// API para acciones
app.get('/api/actions', async (req: Request, res: Response): Promise<void> => {
    try {
        const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
        const actions = await getActions(enabled);
        res.json({ success: true, actions });
    } catch (error) {
        console.error('Error obteniendo acciones:', error);
        res.status(500).json({ success: false, error: 'Error al obtener acciones' });
    }
});

app.post('/api/actions', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id, name, triggerType, triggerConfig, actionType, actionConfig, enabled } = req.body;
        
        await saveAction({
            id: id || `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            triggerType,
            triggerConfig,
            actionType,
            actionConfig,
            enabled: enabled !== false
        });
        
        res.json({ success: true, message: 'Acción guardada' });
    } catch (error) {
        console.error('Error guardando acción:', error);
        res.status(500).json({ success: false, error: 'Error al guardar acción' });
    }
});

app.delete('/api/actions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        await deleteAction(req.params.id);
        res.json({ success: true, message: 'Acción eliminada' });
    } catch (error) {
        console.error('Error eliminando acción:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar acción' });
    }
});

// API para eventos (logs)
app.get('/api/events', async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const events = await getEvents(limit);
        res.json({ success: true, events });
    } catch (error) {
        console.error('Error obteniendo eventos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener eventos' });
    }
});

app.post('/api/events', async (req: Request, res: Response): Promise<void> => {
    try {
        const { eventType, eventData, actionId, actionExecuted } = req.body;
        await saveEvent({ eventType, eventData, actionId, actionExecuted });
        res.json({ success: true, message: 'Evento guardado' });
    } catch (error) {
        console.error('Error guardando evento:', error);
        res.status(500).json({ success: false, error: 'Error al guardar evento' });
    }
});

app.delete('/api/events', async (_req: Request, res: Response): Promise<void> => {
    try {
        await clearEvents();
        res.json({ success: true, message: 'Log de eventos limpiado' });
    } catch (error) {
        console.error('Error limpiando eventos:', error);
        res.status(500).json({ success: false, error: 'Error al limpiar eventos' });
    }
});

// Inicializar base de datos y servidor
initializeDatabase().then(() => {
    const port = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
    app.listen(port, '0.0.0.0', () => {
        console.log(`\n🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
        console.log(`📡 Listo para recibir conexiones de TikTok`);
        console.log(`💾 Base de datos SQLite inicializada\n`);
    });
}).catch((error) => {
    console.error('❌ Error al inicializar base de datos:', error);
    process.exit(1);
});
