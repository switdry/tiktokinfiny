import { RemoteVoice } from '../types';
import axios from 'axios';

export class TTSService {
    private voices: RemoteVoice[] = [];

    constructor() {
        this.initializeVoices();
    }

    private initializeVoices(): void {
        this.voices = [
            { id: 'es', name: 'Español', language: 'es', gender: 'female', provider: 'google' },
            { id: 'es-MX', name: 'Español México', language: 'es-MX', gender: 'female', provider: 'google' },
            { id: 'en', name: 'English', language: 'en', gender: 'female', provider: 'google' },
            { id: 'pt', name: 'Português', language: 'pt', gender: 'female', provider: 'google' },
            { id: 'fr', name: 'Français', language: 'fr', gender: 'female', provider: 'google' },
            { id: 'de', name: 'Deutsch', language: 'de', gender: 'female', provider: 'google' },
            { id: 'it', name: 'Italiano', language: 'it', gender: 'female', provider: 'google' },
            { id: 'ja', name: '日本語', language: 'ja', gender: 'female', provider: 'google' },
            { id: 'ko', name: '한국어', language: 'ko', gender: 'female', provider: 'google' },
            { id: 'zh-CN', name: '中文', language: 'zh-CN', gender: 'female', provider: 'google' },
            { id: 'ru', name: 'Русский', language: 'ru', gender: 'female', provider: 'google' },
        ];
    }

    async getAvailableVoices(): Promise<RemoteVoice[]> {
        return this.voices;
    }

    private normalizeLanguageCode(voiceId: string): string {
        const langMap: Record<string, string> = {
            'Brian': 'en', 'Amy': 'en', 'Emma': 'en', 'Joanna': 'en', 'Joey': 'en', 'Matthew': 'en',
            'Conchita': 'es', 'Enrique': 'es', 'Lucia': 'es', 'Mia': 'es', 'Miguel': 'es', 'Penelope': 'es', 'Lupe': 'es',
            'Camila': 'pt', 'Vitoria': 'pt', 'Ricardo': 'pt',
            'Celine': 'fr', 'Mathieu': 'fr',
            'Hans': 'de', 'Marlene': 'de', 'Vicki': 'de',
            'Giorgio': 'it', 'Carla': 'it', 'Bianca': 'it',
            'Takumi': 'ja', 'Mizuki': 'ja',
            'Seoyeon': 'ko', 'Zhiyu': 'zh-CN',
        };
        
        if (langMap[voiceId]) return langMap[voiceId];
        
        const validLangs = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh-CN', 'ru', 'ar', 'hi', 'tr', 'pl', 'nl'];
        if (validLangs.includes(voiceId)) return voiceId;
        
        return 'es';
    }

    async generateSpeechBuffer(text: string, voiceId: string): Promise<Buffer> {
        const lang = this.normalizeLanguageCode(voiceId);
        const textChunks = this.splitTextIntoChunks(text, 200);
        const audioBuffers: Buffer[] = [];

        for (const chunk of textChunks) {
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;
            
            try {
                const response = await axios.get(url, { 
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://translate.google.com/'
                    },
                    timeout: 10000
                });
                audioBuffers.push(Buffer.from(response.data));
            } catch (error: any) {
                console.error('Error with Google TTS:', error?.message);
                throw error;
            }
        }

        return Buffer.concat(audioBuffers);
    }

    private splitTextIntoChunks(text: string, maxLength: number): string[] {
        if (text.length <= maxLength) return [text];

        const chunks: string[] = [];
        const words = text.split(' ');
        let currentChunk = '';

        for (const word of words) {
            if ((currentChunk + ' ' + word).trim().length <= maxLength) {
                currentChunk = (currentChunk + ' ' + word).trim();
            } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = word;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        return chunks;
    }
}
