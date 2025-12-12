import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { WebcastPushConnection } from 'tiktok-live-connector';
import { Comment, Gift, StreamEvent, RoomStats } from './types';
import { TTSService } from './services/ttsService';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/dist', express.static('dist'));
app.use('/cache', express.static('cache'));
app.use('/widgets', express.static('public/widgets'));

interface ActiveConnection {
    connection: WebcastPushConnection;
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

    let tiktokConnection: WebcastPushConnection | null = null;
    const comments: Comment[] = [];
    const gifts: Gift[] = [];
    const maxItems = 100;
    const roomStats: RoomStats = { viewerCount: 0, likeCount: 0, totalViewerCount: 0 };

    try {
        tiktokConnection = new WebcastPushConnection(username, {
            enableExtendedGiftInfo: true,
        });

        const connData: ActiveConnection = {
            connection: tiktokConnection,
            comments,
            gifts,
            sseClients: new Set(),
            roomStats,
            isConnected: false
        };
        activeConnections.set(username, connData);

        tiktokConnection.on('chat', (data: any) => {
            try {
                const comment: Comment = {
                    user: data.uniqueId || data.nickname || 'Usuario',
                    text: data.comment || data.text || '',
                    timestamp: Date.now(),
                    profilePicUrl: data.profilePictureUrl,
                    raw: data,
                };

                if (comment.text && comment.text.trim()) {
                    comments.push(comment);
                    if (comments.length > maxItems) comments.shift();
                    
                    console.log(`💬 [${username}] @${comment.user}: ${comment.text.substring(0, 50)}`);
                    
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

        tiktokConnection.on('gift', (data: any) => {
            try {
                const gift: Gift = {
                    id: `${data.uniqueId}-${data.giftId}-${Date.now()}`,
                    user: data.uniqueId || data.nickname || 'Usuario',
                    giftName: data.giftName || 'Regalo',
                    giftId: data.giftId,
                    repeatCount: data.repeatCount || 1,
                    diamondCount: data.diamondCount || 0,
                    timestamp: Date.now(),
                    profilePicUrl: data.profilePictureUrl,
                };

                if (data.repeatEnd || data.giftType === 1) {
                    gifts.push(gift);
                    if (gifts.length > maxItems) gifts.shift();
                    
                    console.log(`🎁 [${username}] @${gift.user} envió ${gift.repeatCount}x ${gift.giftName} (${gift.diamondCount} diamonds)`);
                    
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

        tiktokConnection.on('like', (data: any) => {
            try {
                connData.roomStats.likeCount = data.totalLikeCount || connData.roomStats.likeCount;
                
                broadcastEvent(username, {
                    type: 'like',
                    data: {
                        user: data.uniqueId || 'Usuario',
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

        tiktokConnection.on('follow', (data: any) => {
            try {
                broadcastEvent(username, {
                    type: 'follow',
                    data: {
                        user: data.uniqueId || data.nickname || 'Usuario',
                        timestamp: Date.now(),
                        profilePicUrl: data.profilePictureUrl
                    },
                    timestamp: Date.now()
                });
                console.log(`👤 [${username}] Nuevo seguidor: @${data.uniqueId}`);
            } catch (e) {
                console.error(`Error procesando follow:`, e);
            }
        });

        tiktokConnection.on('share', (data: any) => {
            try {
                broadcastEvent(username, {
                    type: 'share',
                    data: {
                        user: data.uniqueId || 'Usuario',
                        timestamp: Date.now()
                    },
                    timestamp: Date.now()
                });
            } catch (e) {
                console.error(`Error procesando share:`, e);
            }
        });

        tiktokConnection.on('roomUser', (data: any) => {
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

        tiktokConnection.on('connected', (state: any) => {
            console.log(`✅ [${username}] Conectado! Room ID: ${state?.roomId}`);
            connData.isConnected = true;
            connData.roomStats.viewerCount = state?.viewerCount || 0;
            
            broadcastEvent(username, {
                type: 'connected',
                data: { username },
                timestamp: Date.now()
            });
        });

        tiktokConnection.on('streamEnd', () => {
            console.log(`📺 [${username}] Stream terminado`);
            connData.isConnected = false;
            broadcastEvent(username, {
                type: 'disconnected',
                data: { username },
                timestamp: Date.now()
            });
        });

        tiktokConnection.on('disconnected', () => {
            console.log(`🔌 [${username}] Desconectado`);
            connData.isConnected = false;
            broadcastEvent(username, {
                type: 'disconnected',
                data: { username },
                timestamp: Date.now()
            });
        });

        tiktokConnection.on('error', (err: unknown) => {
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
            } else if (typeof error === 'object' && error !== null) {
                errorStr = JSON.stringify(error);
            } else {
                errorStr = String(error);
            }
        } catch (e) {
            errorStr = 'Error parsing error';
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

app.post('/api/tts/speak', async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, voiceId, provider, speed, volume } = req.body;

        if (!text || !voiceId) {
            res.status(400).json({ success: false, error: 'Texto y voiceId son requeridos' });
            return;
        }

        const audioUrl = await ttsService.generateSpeech(text, voiceId, provider, {
            speed: speed || 1.0,
            volume: volume || 1.0,
        });

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

app.get('/widget/alerts/:username', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'alerts.html'));
});

app.get('/widget/goals/:username', (_req: Request, res: Response): void => {
    res.sendFile(path.join(process.cwd(), 'public', 'widgets', 'goals.html'));
});

const port = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
    console.log(`📡 Listo para recibir conexiones de TikTok\n`);
});
