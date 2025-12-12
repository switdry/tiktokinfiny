// Base de datos de regalos reales de TikTok
// Mapeo de giftId a información del regalo (nombre, diamonds, emoji)

export interface TikTokGiftInfo {
    giftId: number;
    name: string;
    nameEn: string;
    diamonds: number;
    emoji: string;
    category: string;
}

// Lista completa de regalos de TikTok con sus valores reales
export const TIKTOK_GIFTS: Record<number, TikTokGiftInfo> = {
    // Regalos básicos (1-100 diamonds)
    1: { giftId: 1, name: 'Rosa', nameEn: 'Rose', diamonds: 1, emoji: '🌹', category: 'básico' },
    2: { giftId: 2, name: 'Panda', nameEn: 'Panda', diamonds: 5, emoji: '🐼', category: 'básico' },
    3: { giftId: 3, name: 'Perfume', nameEn: 'Perfume', diamonds: 20, emoji: '💄', category: 'básico' },
    4: { giftId: 4, name: 'Te Amo', nameEn: 'I Love You', diamonds: 49, emoji: '💕', category: 'básico' },
    5: { giftId: 5, name: 'Confeti', nameEn: 'Confetti', diamonds: 100, emoji: '🎊', category: 'básico' },
    
    // Regalos intermedios (100-1000 diamonds)
    6: { giftId: 6, name: 'Gafas de Sol', nameEn: 'Sunglasses', diamonds: 199, emoji: '🕶️', category: 'intermedio' },
    7: { giftId: 7, name: 'Lluvia de Dinero', nameEn: 'Money Rain', diamonds: 500, emoji: '💸', category: 'intermedio' },
    8: { giftId: 8, name: 'Bola de Disco', nameEn: 'Disco Ball', diamonds: 1000, emoji: '🪩', category: 'intermedio' },
    
    // Regalos premium (1000-10000 diamonds)
    9: { giftId: 9, name: 'Sirena', nameEn: 'Mermaid', diamonds: 2988, emoji: '🧜‍♀️', category: 'premium' },
    10: { giftId: 10, name: 'Avión', nameEn: 'Airplane', diamonds: 6000, emoji: '✈️', category: 'premium' },
    11: { giftId: 11, name: 'Planeta', nameEn: 'Planet', diamonds: 15000, emoji: '🪐', category: 'premium' },
    12: { giftId: 12, name: 'Vuelo Diamante', nameEn: 'Diamond Flight', diamonds: 18000, emoji: '💎✈️', category: 'premium' },
    13: { giftId: 13, name: 'León', nameEn: 'Lion', diamonds: 29999, emoji: '🦁', category: 'premium' },
    14: { giftId: 14, name: 'TikTok Universe', nameEn: 'TikTok Universe', diamonds: 44999, emoji: '🌌', category: 'premium' },
    
    // Regalos especiales adicionales
    15: { giftId: 15, name: 'Corazón', nameEn: 'Heart', diamonds: 1, emoji: '❤️', category: 'básico' },
    16: { giftId: 16, name: 'Corona', nameEn: 'Crown', diamonds: 9999, emoji: '👑', category: 'premium' },
    17: { giftId: 17, name: 'Fuego', nameEn: 'Fire', diamonds: 99, emoji: '🔥', category: 'básico' },
    18: { giftId: 18, name: 'Estrella', nameEn: 'Star', diamonds: 50, emoji: '⭐', category: 'básico' },
    19: { giftId: 19, name: 'Cake', nameEn: 'Cake', diamonds: 299, emoji: '🎂', category: 'intermedio' },
    20: { giftId: 20, name: 'Diamante', nameEn: 'Diamond', diamonds: 5000, emoji: '💎', category: 'premium' },
    
    // Más regalos de TikTok
    21: { giftId: 21, name: 'Beso', nameEn: 'Kiss', diamonds: 10, emoji: '💋', category: 'básico' },
    22: { giftId: 22, name: 'Cerveza', nameEn: 'Beer', diamonds: 30, emoji: '🍺', category: 'básico' },
    23: { giftId: 23, name: 'Pizza', nameEn: 'Pizza', diamonds: 50, emoji: '🍕', category: 'básico' },
    24: { giftId: 24, name: 'Cofre', nameEn: 'Treasure', diamonds: 200, emoji: '💎', category: 'intermedio' },
    25: { giftId: 25, name: 'Rayo', nameEn: 'Lightning', diamonds: 150, emoji: '⚡', category: 'intermedio' },
    26: { giftId: 26, name: 'Tornado', nameEn: 'Tornado', diamonds: 800, emoji: '🌪️', category: 'intermedio' },
    27: { giftId: 27, name: 'Dragón', nameEn: 'Dragon', diamonds: 12000, emoji: '🐉', category: 'premium' },
    28: { giftId: 28, name: 'Fénix', nameEn: 'Phoenix', diamonds: 20000, emoji: '🔥', category: 'premium' },
    29: { giftId: 29, name: 'Galaxia', nameEn: 'Galaxy', diamonds: 25000, emoji: '🌠', category: 'premium' },
    30: { giftId: 30, name: 'Universo', nameEn: 'Universe', diamonds: 50000, emoji: '🌌', category: 'premium' },
};

// Función para obtener información de un regalo por su ID
export function getGiftInfo(giftId: number): TikTokGiftInfo | null {
    return TIKTOK_GIFTS[giftId] || null;
}

// Función para obtener información de un regalo por nombre (búsqueda aproximada)
export function getGiftInfoByName(giftName: string): TikTokGiftInfo | null {
    const normalizedName = giftName.toLowerCase().trim();
    
    for (const gift of Object.values(TIKTOK_GIFTS)) {
        if (
            gift.name.toLowerCase() === normalizedName ||
            gift.nameEn.toLowerCase() === normalizedName ||
            gift.name.toLowerCase().includes(normalizedName) ||
            gift.nameEn.toLowerCase().includes(normalizedName)
        ) {
            return gift;
        }
    }
    
    return null;
}

// Función para normalizar un regalo recibido de TikTok
export function normalizeGift(data: any): { name: string; diamonds: number; emoji: string } {
    const giftId = data.giftId || data.gift?.gift_id || data.gift?.giftId || 0;
    const giftInfo = getGiftInfo(giftId);
    
    if (giftInfo) {
        return {
            name: giftInfo.name,
            diamonds: giftInfo.diamonds,
            emoji: giftInfo.emoji
        };
    }
    
    // Si no encontramos el regalo por ID, intentamos por nombre
    const giftName = data.giftName || data.gift?.name || data.gift?.gift_name || 'Regalo';
    const giftByName = getGiftInfoByName(giftName);
    
    if (giftByName) {
        return {
            name: giftByName.name,
            diamonds: giftByName.diamonds,
            emoji: giftByName.emoji
        };
    }
    
    // Fallback: usar los datos recibidos directamente
    const diamondCount = data.diamondCount || data.gift?.diamondCount || data.gift?.diamond_count || 0;
    
    return {
        name: giftName,
        diamonds: diamondCount,
        emoji: '🎁'
    };
}

// Función para obtener todos los regalos ordenados por valor
export function getAllGiftsSorted(): TikTokGiftInfo[] {
    return Object.values(TIKTOK_GIFTS).sort((a, b) => a.diamonds - b.diamonds);
}

// Función para obtener regalos por categoría
export function getGiftsByCategory(category: string): TikTokGiftInfo[] {
    return Object.values(TIKTOK_GIFTS).filter(gift => gift.category === category);
}

