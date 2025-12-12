export interface Comment {
    user: string;
    text: string;
    timestamp: number;
    profilePicUrl?: string;
    raw?: any;
}

export interface Gift {
    id: string;
    user: string;
    giftName: string;
    giftId: number;
    repeatCount: number;
    diamondCount: number;
    timestamp: number;
    profilePicUrl?: string;
}

export interface Like {
    user: string;
    likeCount: number;
    totalLikeCount: number;
    timestamp: number;
}

export interface Follow {
    user: string;
    timestamp: number;
    profilePicUrl?: string;
}

export interface Share {
    user: string;
    timestamp: number;
}

export interface RoomStats {
    viewerCount: number;
    likeCount: number;
    totalViewerCount: number;
}

export interface StreamEvent {
    type: 'comment' | 'gift' | 'like' | 'follow' | 'share' | 'roomStats' | 'connected' | 'disconnected';
    data: Comment | Gift | Like | Follow | Share | RoomStats | { username: string };
    timestamp: number;
}

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
    giftCount: number;
    likeCount: number;
    viewerCount: number;
    intervals: NodeJS.Timeout[];
    lastCommentTimestamp: Record<string, number>;
    gifts: Gift[];
    eventSource: EventSource | null;
}

export interface TTSSettings {
    voice: SpeechSynthesisVoice | null;
    remoteVoice: RemoteVoice | null;
    useRemote: boolean;
    speed: number;
    volume: number;
    filterMentions: boolean;
    readUsername: boolean;
}

export interface RemoteVoice {
    id: string;
    name: string;
    language: string;
    gender?: 'male' | 'female' | 'neutral';
    provider: 'google' | 'elevenlabs' | 'azure' | 'streamelements' | 'custom';
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface CommentsResponse {
    success: boolean;
    comments: Comment[];
    username: string;
    message?: string;
}

export interface RemoteTTSResponse {
    success: boolean;
    audioUrl: string;
    format: 'mp3' | 'wav' | 'ogg';
}

export interface AlertConfig {
    enabled: boolean;
    soundUrl?: string;
    volume: number;
    minValue?: number;
}

export interface WidgetTheme {
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    fontFamily: string;
    fontSize: string;
}
