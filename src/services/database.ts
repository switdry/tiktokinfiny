import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'tikfinity.db');

// Asegurar que el directorio existe
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Promisificar métodos
const dbRun = (sql: string, params?: any[]) => {
    return new Promise<void>((resolve, reject) => {
        db.run(sql, params || [], (err: Error | null) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const dbGet = (sql: string, params?: any[]) => {
    return new Promise<any>((resolve, reject) => {
        db.get(sql, params || [], (err: Error | null, row: any) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (sql: string, params?: any[]) => {
    return new Promise<any[]>((resolve, reject) => {
        db.all(sql, params || [], (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

// Inicializar base de datos
export async function initializeDatabase(): Promise<void> {
    // Tabla de configuraciones
    await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de regalos
    await dbRun(`
        CREATE TABLE IF NOT EXISTS gifts (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            user TEXT NOT NULL,
            gift_name TEXT NOT NULL,
            gift_id INTEGER,
            repeat_count INTEGER DEFAULT 1,
            diamond_count INTEGER DEFAULT 0,
            total_diamonds INTEGER DEFAULT 0,
            timestamp INTEGER NOT NULL,
            profile_pic_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de widgets personalizados
    await dbRun(`
        CREATE TABLE IF NOT EXISTS custom_widgets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            config TEXT NOT NULL,
            image_url TEXT,
            message TEXT,
            trigger_gift TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Agregar columnas si no existen (para migración)
    try {
        await dbRun(`ALTER TABLE custom_widgets ADD COLUMN message TEXT`);
    } catch (e) {
        // Columna ya existe
    }
    try {
        await dbRun(`ALTER TABLE custom_widgets ADD COLUMN trigger_gift TEXT`);
    } catch (e) {
        // Columna ya existe
    }

    // Tabla de estadísticas
    await dbRun(`
        CREATE TABLE IF NOT EXISTS stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            date TEXT NOT NULL,
            viewers INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            gifts INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            diamonds INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(username, date)
        )
    `);

    // Tabla de metas
    await dbRun(`
        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            target INTEGER NOT NULL,
            current INTEGER DEFAULT 0,
            color TEXT DEFAULT '#fe2c55',
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de acciones
    await dbRun(`
        CREATE TABLE IF NOT EXISTS actions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            trigger_config TEXT,
            action_type TEXT NOT NULL,
            action_config TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de eventos (logs)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS events_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            event_data TEXT,
            action_id TEXT,
            action_executed INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Índices
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_gifts_username ON gifts(username)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_gifts_timestamp ON gifts(timestamp)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_stats_username_date ON stats(username, date)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_goals_enabled ON goals(enabled)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_actions_enabled ON actions(enabled)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events_log(timestamp)`);

    console.log('✅ Base de datos inicializada');
}

// Configuraciones
export async function saveSetting(key: string, value: any): Promise<void> {
    await dbRun(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, JSON.stringify(value)]
    );
}

export async function getSetting<T>(key: string, defaultValue?: T): Promise<T | null> {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', [key]) as { value: string } | undefined;
    if (row) {
        try {
            return JSON.parse(row.value) as T;
        } catch {
            return row.value as T;
        }
    }
    return defaultValue ?? null;
}

// Regalos
export async function saveGift(gift: {
    id: string;
    username: string;
    user: string;
    giftName: string;
    giftId: number;
    repeatCount: number;
    diamondCount: number;
    timestamp: number;
    profilePicUrl?: string;
}): Promise<void> {
    const totalDiamonds = gift.diamondCount * gift.repeatCount;
    await dbRun(
        `INSERT OR REPLACE INTO gifts 
        (id, username, user, gift_name, gift_id, repeat_count, diamond_count, total_diamonds, timestamp, profile_pic_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            gift.id,
            gift.username,
            gift.user,
            gift.giftName,
            gift.giftId,
            gift.repeatCount,
            gift.diamondCount,
            totalDiamonds,
            gift.timestamp,
            gift.profilePicUrl || null
        ]
    );
}

export async function getGifts(username?: string, limit: number = 100): Promise<any[]> {
    if (username) {
        return await dbAll(
            'SELECT * FROM gifts WHERE username = ? ORDER BY timestamp DESC LIMIT ?',
            [username, limit]
        ) as any[];
    }
    return await dbAll('SELECT * FROM gifts ORDER BY timestamp DESC LIMIT ?', [limit]) as any[];
}

// Widgets personalizados
export async function saveCustomWidget(widget: {
    id: string;
    name: string;
    type: string;
    config: any;
    imageUrl?: string;
    message?: string;
    triggerGift?: string;
    enabled?: boolean;
}): Promise<void> {
    try {
        console.log('💾 [DB] Guardando widget en base de datos:', {
            id: widget.id,
            name: widget.name,
            type: widget.type,
            hasImage: !!widget.imageUrl,
            hasMessage: !!widget.message,
            hasTrigger: !!widget.triggerGift,
            enabled: widget.enabled
        });
        
        await dbRun(
            `INSERT OR REPLACE INTO custom_widgets 
            (id, name, type, config, image_url, message, trigger_gift, enabled, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                widget.id,
                widget.name,
                widget.type,
                JSON.stringify(widget.config),
            widget.imageUrl || null,
            (widget.message !== undefined && widget.message !== null) ? widget.message : null,
            (widget.triggerGift !== undefined && widget.triggerGift !== null) ? widget.triggerGift : null,
                widget.enabled ? 1 : 0
            ]
        );
        
        console.log('✅ [DB] Widget guardado exitosamente en BD');
    } catch (error) {
        console.error('❌ [DB] Error guardando widget:', error);
        throw error;
    }
}

export async function getCustomWidgets(enabled?: boolean): Promise<any[]> {
    if (enabled !== undefined) {
        return await dbAll(
            'SELECT * FROM custom_widgets WHERE enabled = ? ORDER BY created_at DESC',
            [enabled ? 1 : 0]
        ) as any[];
    }
    return await dbAll('SELECT * FROM custom_widgets ORDER BY created_at DESC') as any[];
}

export async function deleteCustomWidget(id: string): Promise<void> {
    await dbRun('DELETE FROM custom_widgets WHERE id = ?', [id]);
}

// Estadísticas
export async function saveStats(username: string, stats: {
    viewers: number;
    comments: number;
    gifts: number;
    likes: number;
    diamonds: number;
}): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await dbRun(
        `INSERT OR REPLACE INTO stats (username, date, viewers, comments, gifts, likes, diamonds)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, today, stats.viewers, stats.comments, stats.gifts, stats.likes, stats.diamonds]
    );
}

export async function getStats(username: string, days: number = 7): Promise<any[]> {
    return await dbAll(
        `SELECT * FROM stats WHERE username = ? AND date >= date('now', '-' || ? || ' days') ORDER BY date DESC`,
        [username, days]
    ) as any[];
}

// Metas
export async function saveGoal(goal: {
    id: string;
    name: string;
    type: string;
    target: number;
    current?: number;
    color?: string;
    enabled?: boolean;
}): Promise<void> {
    await dbRun(
        `INSERT OR REPLACE INTO goals 
        (id, name, type, target, current, color, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            goal.id,
            goal.name,
            goal.type,
            goal.target,
            goal.current ?? 0,
            goal.color || '#fe2c55',
            goal.enabled ? 1 : 0
        ]
    );
}

export async function getGoals(enabled?: boolean): Promise<any[]> {
    if (enabled !== undefined) {
        return await dbAll(
            'SELECT * FROM goals WHERE enabled = ? ORDER BY created_at DESC',
            [enabled ? 1 : 0]
        ) as any[];
    }
    return await dbAll('SELECT * FROM goals ORDER BY created_at DESC') as any[];
}

export async function updateGoalProgress(id: string, current: number): Promise<void> {
    await dbRun(
        'UPDATE goals SET current = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [current, id]
    );
}

export async function deleteGoal(id: string): Promise<void> {
    await dbRun('DELETE FROM goals WHERE id = ?', [id]);
}

// Acciones
export async function saveAction(action: {
    id: string;
    name: string;
    triggerType: string;
    triggerConfig?: string;
    actionType: string;
    actionConfig: string;
    enabled?: boolean;
}): Promise<void> {
    await dbRun(
        `INSERT OR REPLACE INTO actions 
        (id, name, trigger_type, trigger_config, action_type, action_config, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            action.id,
            action.name,
            action.triggerType,
            action.triggerConfig || null,
            action.actionType,
            action.actionConfig,
            action.enabled ? 1 : 0
        ]
    );
}

export async function getActions(enabled?: boolean): Promise<any[]> {
    if (enabled !== undefined) {
        return await dbAll(
            'SELECT * FROM actions WHERE enabled = ? ORDER BY created_at DESC',
            [enabled ? 1 : 0]
        ) as any[];
    }
    return await dbAll('SELECT * FROM actions ORDER BY created_at DESC') as any[];
}

export async function deleteAction(id: string): Promise<void> {
    await dbRun('DELETE FROM actions WHERE id = ?', [id]);
}

// Log de eventos
export async function saveEvent(event: {
    eventType: string;
    eventData?: any;
    actionId?: string;
    actionExecuted?: boolean;
}): Promise<void> {
    await dbRun(
        `INSERT INTO events_log (event_type, event_data, action_id, action_executed)
        VALUES (?, ?, ?, ?)`,
        [
            event.eventType,
            event.eventData ? JSON.stringify(event.eventData) : null,
            event.actionId || null,
            event.actionExecuted ? 1 : 0
        ]
    );
}

export async function getEvents(limit: number = 100): Promise<any[]> {
    return await dbAll(
        'SELECT * FROM events_log ORDER BY timestamp DESC LIMIT ?',
        [limit]
    ) as any[];
}

export async function clearEvents(): Promise<void> {
    await dbRun('DELETE FROM events_log');
}

export { db };

