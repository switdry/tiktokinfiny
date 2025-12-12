import { RemoteVoice } from '../types';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class TTSService {
    private voices: RemoteVoice[] = [];
    private cacheDir: string;

    constructor() {
        this.cacheDir = path.join(process.cwd(), 'cache', 'tts');
        this.ensureCacheDir();
        this.initializeVoices();
    }

    private ensureCacheDir(): void {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    private initializeVoices(): void {
        this.voices = [
            { id: 'es', name: 'Español', language: 'es', gender: 'female', provider: 'google' },
            { id: 'es-MX', name: 'Español México', language: 'es-MX', gender: 'female', provider: 'google' },
            { id: 'es-ES', name: 'Español España', language: 'es-ES', gender: 'female', provider: 'google' },
            { id: 'en', name: 'English', language: 'en', gender: 'female', provider: 'google' },
            { id: 'en-US', name: 'English US', language: 'en-US', gender: 'female', provider: 'google' },
            { id: 'en-GB', name: 'English UK', language: 'en-GB', gender: 'female', provider: 'google' },
            { id: 'pt', name: 'Português', language: 'pt', gender: 'female', provider: 'google' },
            { id: 'pt-BR', name: 'Português Brasil', language: 'pt-BR', gender: 'female', provider: 'google' },
            { id: 'fr', name: 'Français', language: 'fr', gender: 'female', provider: 'google' },
            { id: 'de', name: 'Deutsch', language: 'de', gender: 'female', provider: 'google' },
            { id: 'it', name: 'Italiano', language: 'it', gender: 'female', provider: 'google' },
            { id: 'ja', name: '日本語', language: 'ja', gender: 'female', provider: 'google' },
            { id: 'ko', name: '한국어', language: 'ko', gender: 'female', provider: 'google' },
            { id: 'zh-CN', name: '中文', language: 'zh-CN', gender: 'female', provider: 'google' },
            { id: 'ru', name: 'Русский', language: 'ru', gender: 'female', provider: 'google' },
            { id: 'ar', name: 'العربية', language: 'ar', gender: 'female', provider: 'google' },
            { id: 'hi', name: 'हिन्दी', language: 'hi', gender: 'female', provider: 'google' },
            { id: 'tr', name: 'Türkçe', language: 'tr', gender: 'female', provider: 'google' },
            { id: 'pl', name: 'Polski', language: 'pl', gender: 'female', provider: 'google' },
            { id: 'nl', name: 'Nederlands', language: 'nl', gender: 'female', provider: 'google' },
        ];
    }

    async getAvailableVoices(): Promise<RemoteVoice[]> {
        return this.voices;
    }

    async generateSpeech(
        text: string,
        voiceId: string,
        _provider: string = 'google',
        options: { speed?: number; volume?: number } = {}
    ): Promise<string> {
        const cacheKey = this.getCacheKey(text, voiceId, options);
        const cachedFile = path.join(this.cacheDir, `${cacheKey}.mp3`);

        if (fs.existsSync(cachedFile)) {
            return `/cache/tts/${cacheKey}.mp3`;
        }

        try {
            const audioUrl = await this.generateGoogleTTS(text, voiceId, cacheKey);
            return audioUrl;
        } catch (error) {
            console.error('Error generating TTS:', error);
            throw error;
        }
    }

    private async generateGoogleTTS(text: string, lang: string, cacheKey: string): Promise<string> {
        const cachedFile = path.join(this.cacheDir, `${cacheKey}.mp3`);
        
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
                console.error('Error with Google TTS chunk:', error?.message);
                throw error;
            }
        }

        const combinedBuffer = Buffer.concat(audioBuffers);
        fs.writeFileSync(cachedFile, combinedBuffer);
        return `/cache/tts/${cacheKey}.mp3`;
    }

    private splitTextIntoChunks(text: string, maxLength: number): string[] {
        if (text.length <= maxLength) {
            return [text];
        }

        const chunks: string[] = [];
        const sentences = text.split(/(?<=[.!?])\s+/);
        let currentChunk = '';

        for (const sentence of sentences) {
            if ((currentChunk + ' ' + sentence).trim().length <= maxLength) {
                currentChunk = (currentChunk + ' ' + sentence).trim();
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                if (sentence.length > maxLength) {
                    const words = sentence.split(' ');
                    currentChunk = '';
                    for (const word of words) {
                        if ((currentChunk + ' ' + word).trim().length <= maxLength) {
                            currentChunk = (currentChunk + ' ' + word).trim();
                        } else {
                            if (currentChunk) {
                                chunks.push(currentChunk);
                            }
                            currentChunk = word;
                        }
                    }
                } else {
                    currentChunk = sentence;
                }
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private getCacheKey(text: string, voiceId: string, options: { speed?: number; volume?: number }): string {
        const hash = crypto
            .createHash('md5')
            .update(`${text}-${voiceId}-${options.speed || 1.0}-${options.volume || 1.0}`)
            .digest('hex');
        return hash;
    }

    cleanCache(): void {
        try {
            const files = fs.readdirSync(this.cacheDir);
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000;

            for (const file of files) {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                }
            }
        } catch (error) {
            console.error('Error cleaning cache:', error);
        }
    }
}
