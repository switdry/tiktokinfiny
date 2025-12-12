// Tipos para comentarios
export interface Comment {
    user: string;
    text: string;
    timestamp: number;
    raw?: any;
}

// Tipos para estado de la aplicación
export interface AppState {
    users: string[];
    isReading: boolean;
    commentQueue: Comment[];
    currentReading: Comment | null;
    tts: SpeechSynthesis | null;
    voices: SpeechSynthesisVoice[];
    remoteVoices: RemoteVoice[];
    settings: TTSSettings;
    commentCount: number;
    intervals: NodeJS.Timeout[];
    lastCommentTimestamp: Record<string, number>;
}

// Configuración de TTS
export interface TTSSettings {
    voice: SpeechSynthesisVoice | null;
    remoteVoice: RemoteVoice | null;
    useRemote: boolean;
    speed: number;
    volume: number;
    filterMentions: boolean;
}

// Voz remota
export interface RemoteVoice {
    id: string;
    name: string;
    language: string;
    gender?: 'male' | 'female' | 'neutral';
    provider: 'google' | 'elevenlabs' | 'azure' | 'custom';
}

// Respuesta de API
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// Respuesta de comentarios
export interface CommentsResponse {
    success: boolean;
    comments: Comment[];
    username: string;
    message?: string;
}

// Respuesta de TTS remoto
export interface RemoteTTSResponse {
    audioUrl: string;
    format: 'mp3' | 'wav' | 'ogg';
}


