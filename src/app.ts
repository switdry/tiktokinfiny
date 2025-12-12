import { Comment, Gift, StreamEvent, RemoteVoice } from './types';

interface AppState {
    username: string;
    isConnected: boolean;
    isReading: boolean;
    commentQueue: Comment[];
    currentReading: Comment | null;
    tts: SpeechSynthesis | null;
    voices: SpeechSynthesisVoice[];
    remoteVoices: RemoteVoice[];
    settings: {
        voice: SpeechSynthesisVoice | null;
        remoteVoice: RemoteVoice | null;
        useRemote: boolean;
        speed: number;
        volume: number;
        filterMentions: boolean;
        readUsername: boolean;
        ttsEnabled: boolean;
        soundAlertsEnabled: boolean;
    };
    stats: {
        viewerCount: number;
        commentCount: number;
        giftCount: number;
        likeCount: number;
    };
    eventSource: EventSource | null;
}

const state: AppState = {
    username: '',
    isConnected: false,
    isReading: false,
    commentQueue: [],
    currentReading: null,
    tts: null,
    voices: [],
    remoteVoices: [],
    settings: {
        voice: null,
        remoteVoice: null,
        useRemote: false,
        speed: 1.0,
        volume: 1.0,
        filterMentions: false,
        readUsername: true,
        ttsEnabled: true,
        soundAlertsEnabled: true
    },
    stats: {
        viewerCount: 0,
        commentCount: 0,
        giftCount: 0,
        likeCount: 0
    },
    eventSource: null
};

const API_URL = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando TikFinity...');
    initializeTTS();
    setupEventListeners();
    loadVoices();
    loadRemoteVoices();
    setupNavigation();
});

function initializeTTS(): void {
    if ('speechSynthesis' in window) {
        state.tts = window.speechSynthesis;
    }
}

function loadVoices(): void {
    const loadVoicesList = (): void => {
        if (!state.tts) return;
        
        state.voices = state.tts.getVoices();
        const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;
        if (!voiceSelect) return;
        
        voiceSelect.innerHTML = '';
        
        state.voices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        if (state.voices.length > 0) {
            state.settings.voice = state.voices[0];
        }
    };

    loadVoicesList();
    if (state.tts && state.tts.onvoiceschanged !== undefined) {
        state.tts.onvoiceschanged = loadVoicesList;
    }
}

async function loadRemoteVoices(): Promise<void> {
    try {
        const response = await fetch(`${API_URL}/api/tts/voices`);
        const data = await response.json();
        
        if (data.success && data.voices) {
            state.remoteVoices = data.voices;
            const remoteVoiceSelect = document.getElementById('remoteVoiceSelect') as HTMLSelectElement;
            if (!remoteVoiceSelect) return;

            remoteVoiceSelect.innerHTML = '';
            
            const grouped: Record<string, RemoteVoice[]> = {};
            state.remoteVoices.forEach(voice => {
                const lang = voice.language.split('-')[0];
                if (!grouped[lang]) grouped[lang] = [];
                grouped[lang].push(voice);
            });

            Object.entries(grouped).forEach(([lang, voices]) => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = getLanguageName(lang);
                voices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.id;
                    option.textContent = voice.name;
                    optgroup.appendChild(option);
                });
                remoteVoiceSelect.appendChild(optgroup);
            });

            if (state.remoteVoices.length > 0) {
                state.settings.remoteVoice = state.remoteVoices[0];
            }
        }
    } catch (error) {
        console.error('Error loading remote voices:', error);
    }
}

function getLanguageName(code: string): string {
    const names: Record<string, string> = {
        'es': 'Español', 'en': 'English', 'pt': 'Português', 'fr': 'Français',
        'de': 'Deutsch', 'it': 'Italiano', 'ja': '日本語', 'ko': '한국어',
        'zh': '中文', 'ru': 'Русский', 'pl': 'Polski', 'nl': 'Nederlands',
        'sv': 'Svenska', 'nb': 'Norsk', 'tr': 'Türkçe'
    };
    return names[code] || code.toUpperCase();
}

function setupNavigation(): void {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('pageTitle');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = (item as HTMLElement).dataset.section;
            
            navItems.forEach(n => n.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(section || 'dashboard')?.classList.add('active');
            
            if (pageTitle) {
                pageTitle.textContent = item.textContent?.trim() || 'Dashboard';
            }
        });
    });

    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

function setupEventListeners(): void {
    const connectBtn = document.getElementById('connectBtn');
    const usernameInput = document.getElementById('tiktokUsername') as HTMLInputElement;
    
    connectBtn?.addEventListener('click', () => {
        if (state.isConnected) {
            disconnect();
        } else {
            const username = usernameInput?.value.replace('@', '').trim();
            if (username) {
                connect(username);
            }
        }
    });

    usernameInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            connectBtn?.click();
        }
    });

    const ttsEnabled = document.getElementById('ttsEnabled') as HTMLInputElement;
    ttsEnabled?.addEventListener('change', (e) => {
        state.settings.ttsEnabled = (e.target as HTMLInputElement).checked;
    });

    const useRemoteTTS = document.getElementById('useRemoteTTS') as HTMLInputElement;
    useRemoteTTS?.addEventListener('change', (e) => {
        state.settings.useRemote = (e.target as HTMLInputElement).checked;
        updateVoiceSelectVisibility();
    });

    const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;
    voiceSelect?.addEventListener('change', (e) => {
        const index = parseInt((e.target as HTMLSelectElement).value);
        if (state.voices[index]) {
            state.settings.voice = state.voices[index];
        }
    });

    const remoteVoiceSelect = document.getElementById('remoteVoiceSelect') as HTMLSelectElement;
    remoteVoiceSelect?.addEventListener('change', (e) => {
        const voiceId = (e.target as HTMLSelectElement).value;
        const voice = state.remoteVoices.find(v => v.id === voiceId);
        if (voice) {
            state.settings.remoteVoice = voice;
        }
    });

    const speedRange = document.getElementById('speedRange') as HTMLInputElement;
    speedRange?.addEventListener('input', (e) => {
        state.settings.speed = parseFloat((e.target as HTMLInputElement).value);
        const speedValue = document.getElementById('speedValue');
        if (speedValue) speedValue.textContent = state.settings.speed.toFixed(1);
    });

    const volumeRange = document.getElementById('volumeRange') as HTMLInputElement;
    volumeRange?.addEventListener('input', (e) => {
        state.settings.volume = parseInt((e.target as HTMLInputElement).value) / 100;
        const volumeValue = document.getElementById('volumeValue');
        if (volumeValue) volumeValue.textContent = (e.target as HTMLInputElement).value;
    });

    const filterMentions = document.getElementById('filterMentions') as HTMLInputElement;
    filterMentions?.addEventListener('change', (e) => {
        state.settings.filterMentions = (e.target as HTMLInputElement).checked;
    });

    const readUsername = document.getElementById('readUsername') as HTMLInputElement;
    readUsername?.addEventListener('change', (e) => {
        state.settings.readUsername = (e.target as HTMLInputElement).checked;
    });

    const soundAlertsEnabled = document.getElementById('soundAlertsEnabled') as HTMLInputElement;
    soundAlertsEnabled?.addEventListener('change', (e) => {
        state.settings.soundAlertsEnabled = (e.target as HTMLInputElement).checked;
    });
}

function updateVoiceSelectVisibility(): void {
    const localContainer = document.getElementById('localVoiceContainer');
    const remoteContainer = document.getElementById('remoteVoiceContainer');
    
    if (state.settings.useRemote) {
        localContainer?.classList.add('hidden');
        remoteContainer?.classList.remove('hidden');
    } else {
        localContainer?.classList.remove('hidden');
        remoteContainer?.classList.add('hidden');
    }
}

async function connect(username: string): Promise<void> {
    state.username = username;
    updateConnectionStatus('connecting');
    
    try {
        const response = await fetch(`${API_URL}/api/tiktok/start/${username}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.isConnected = true;
            updateConnectionStatus('connected');
            startEventStream(username);
            updateConnectButton();
        } else {
            updateConnectionStatus('error', data.error);
        }
    } catch (error) {
        console.error('Connection error:', error);
        updateConnectionStatus('error', 'Error de conexión');
    }
}

async function disconnect(): Promise<void> {
    if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
    }
    
    if (state.username) {
        try {
            await fetch(`${API_URL}/api/tiktok/stop/${state.username}`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }
    
    state.isConnected = false;
    state.username = '';
    updateConnectionStatus('disconnected');
    updateConnectButton();
}

function startEventStream(username: string): void {
    state.eventSource = new EventSource(`${API_URL}/api/tiktok/events/${username}`);
    
    state.eventSource.onmessage = (event) => {
        try {
            const streamEvent: StreamEvent = JSON.parse(event.data);
            handleStreamEvent(streamEvent);
        } catch (error) {
            console.error('Error parsing event:', error);
        }
    };
    
    state.eventSource.onerror = () => {
        console.log('SSE error, reconnecting...');
        if (state.isConnected) {
            state.eventSource?.close();
            setTimeout(() => {
                if (state.isConnected && state.username) {
                    startEventStream(state.username);
                }
            }, 3000);
        }
    };
}

function handleStreamEvent(event: StreamEvent): void {
    switch (event.type) {
        case 'comment':
            handleComment(event.data as Comment);
            break;
        case 'gift':
            handleGift(event.data as Gift);
            break;
        case 'like':
            handleLike(event.data as { totalLikeCount: number });
            break;
        case 'roomStats':
            handleRoomStats(event.data as { viewerCount: number });
            break;
        case 'connected':
            updateConnectionStatus('connected');
            break;
        case 'disconnected':
            updateConnectionStatus('disconnected');
            break;
    }
}

function handleComment(comment: Comment & { audioUrl?: string }): void {
    state.stats.commentCount++;
    updateStat('commentCount', state.stats.commentCount);
    displayComment(comment);
    
    if (state.settings.ttsEnabled) {
        if (state.settings.filterMentions && !comment.text.includes('@')) {
            return;
        }
        
        // If server sent pre-generated audio, use that
        if (comment.audioUrl) {
            playCommentAudio(comment.audioUrl);
        } else {
            queueForTTS(comment);
        }
    }
}

// Audio queue for playing server-generated TTS
const audioQueue: string[] = [];
let isPlayingAudio = false;

function playCommentAudio(audioUrl: string): void {
    audioQueue.push(audioUrl);
    if (!isPlayingAudio) {
        playNextAudio();
    }
}

async function playNextAudio(): Promise<void> {
    if (audioQueue.length === 0) {
        isPlayingAudio = false;
        return;
    }
    
    isPlayingAudio = true;
    const audioUrl = audioQueue.shift()!;
    
    try {
        const audio = new Audio(audioUrl);
        audio.volume = state.settings.volume;
        
        await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => {
                console.error('Error playing audio:', audioUrl);
                resolve();
            };
            audio.play().catch((e) => {
                console.error('Playback error:', e);
                resolve();
            });
        });
    } catch (error) {
        console.error('Audio error:', error);
    }
    
    setTimeout(() => playNextAudio(), 300);
}

function handleGift(gift: Gift): void {
    state.stats.giftCount++;
    updateStat('giftCount', state.stats.giftCount);
    displayGift(gift);
}

function handleLike(data: { totalLikeCount: number }): void {
    state.stats.likeCount = data.totalLikeCount;
    updateStat('likeCount', formatNumber(state.stats.likeCount));
}

function handleRoomStats(stats: { viewerCount: number }): void {
    state.stats.viewerCount = stats.viewerCount;
    updateStat('viewerCount', formatNumber(state.stats.viewerCount));
}

function displayComment(comment: Comment): void {
    const liveChat = document.getElementById('liveChat');
    if (!liveChat) return;
    
    const emptyState = liveChat.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.innerHTML = `
        <div class="chat-avatar" style="background: linear-gradient(135deg, #fe2c55, #25f4ee)"></div>
        <div class="chat-content">
            <span class="chat-user">@${escapeHtml(comment.user)}</span>
            <span class="chat-text">${escapeHtml(comment.text)}</span>
        </div>
    `;
    
    liveChat.insertBefore(messageDiv, liveChat.firstChild);
    
    while (liveChat.children.length > 50) {
        liveChat.removeChild(liveChat.lastChild!);
    }
}

function displayGift(gift: Gift): void {
    const liveChat = document.getElementById('liveChat');
    if (!liveChat) return;
    
    const giftDiv = document.createElement('div');
    giftDiv.className = 'chat-message gift-message';
    giftDiv.innerHTML = `
        <div class="gift-icon">🎁</div>
        <div class="chat-content">
            <span class="chat-user">@${escapeHtml(gift.user)}</span>
            <span class="gift-info">${gift.repeatCount}x ${escapeHtml(gift.giftName)} (${gift.diamondCount} 💎)</span>
        </div>
    `;
    
    liveChat.insertBefore(giftDiv, liveChat.firstChild);
}

function queueForTTS(comment: Comment): void {
    state.commentQueue.push(comment);
    if (!state.isReading) {
        readNextComment();
    }
}

async function readNextComment(): Promise<void> {
    if (state.commentQueue.length === 0) {
        state.isReading = false;
        state.currentReading = null;
        return;
    }

    state.isReading = true;
    const comment = state.commentQueue.shift()!;
    state.currentReading = comment;

    let textToRead = comment.text;
    if (state.settings.readUsername) {
        textToRead = `${comment.user} dice: ${comment.text}`;
    }

    try {
        if (state.settings.useRemote && state.settings.remoteVoice) {
            await readWithRemoteTTS(textToRead);
        } else {
            await readWithLocalTTS(textToRead);
        }
    } catch (error) {
        console.error('TTS error:', error);
    }

    setTimeout(() => readNextComment(), 500);
}

function readWithLocalTTS(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!state.tts) {
            reject(new Error('TTS not available'));
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        
        if (state.settings.voice) {
            utterance.voice = state.settings.voice;
        }
        
        utterance.rate = state.settings.speed;
        utterance.volume = state.settings.volume;
        
        utterance.onend = () => resolve();
        utterance.onerror = (e) => reject(e);
        
        state.tts.speak(utterance);
    });
}

async function readWithRemoteTTS(text: string): Promise<void> {
    if (!state.settings.remoteVoice) return;

    try {
        const response = await fetch(`${API_URL}/api/tts/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voiceId: state.settings.remoteVoice.id,
                provider: state.settings.remoteVoice.provider,
                speed: state.settings.speed,
                volume: state.settings.volume
            })
        });

        const data = await response.json();
        
        if (data.success && data.audioUrl) {
            const audio = new Audio(data.audioUrl);
            audio.volume = state.settings.volume;
            
            await new Promise<void>((resolve, reject) => {
                audio.onended = () => resolve();
                audio.onerror = () => reject(new Error('Audio playback error'));
                audio.play().catch(reject);
            });
        }
    } catch (error) {
        console.error('Remote TTS error:', error);
        throw error;
    }
}

function updateConnectionStatus(status: string, message?: string): void {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('span:last-child');
    
    if (dot) {
        dot.className = 'status-dot';
        if (status === 'connected') {
            dot.classList.add('connected');
        } else if (status === 'connecting') {
            dot.classList.add('connecting');
        } else if (status === 'error') {
            dot.classList.add('error');
        }
    }
    
    if (text) {
        switch (status) {
            case 'connected':
                text.textContent = `Conectado a @${state.username}`;
                break;
            case 'connecting':
                text.textContent = 'Conectando...';
                break;
            case 'disconnected':
                text.textContent = 'Desconectado';
                break;
            case 'error':
                text.textContent = message || 'Error';
                break;
        }
    }
}

function updateConnectButton(): void {
    const btn = document.getElementById('connectBtn');
    const input = document.getElementById('tiktokUsername') as HTMLInputElement;
    
    if (btn) {
        if (state.isConnected) {
            btn.innerHTML = '<i class="fas fa-plug"></i> Desconectar';
            btn.classList.add('btn-danger');
            btn.classList.remove('btn-primary');
        } else {
            btn.innerHTML = '<i class="fas fa-plug"></i> Conectar';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-primary');
        }
    }
    
    if (input) {
        input.disabled = state.isConnected;
    }
}

function updateStat(id: string, value: number | string): void {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = typeof value === 'number' ? value.toString() : value;
    }
}

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('📦 TikFinity cargado');
