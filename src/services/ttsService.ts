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
        // Voces por defecto usando Google Cloud TTS (gratis hasta cierto límite)
        this.voices = [
            {
                id: 'es-ES-Standard-A',
                name: 'Español (España) - Femenina',
                language: 'es-ES',
                gender: 'female',
                provider: 'google',
            },
            {
                id: 'es-ES-Standard-B',
                name: 'Español (España) - Masculina',
                language: 'es-ES',
                gender: 'male',
                provider: 'google',
            },
            {
                id: 'es-MX-Standard-A',
                name: 'Español (México) - Femenina',
                language: 'es-MX',
                gender: 'female',
                provider: 'google',
            },
            {
                id: 'es-MX-Standard-B',
                name: 'Español (México) - Masculina',
                language: 'es-MX',
                gender: 'male',
                provider: 'google',
            },
            {
                id: 'es-US-Standard-A',
                name: 'Español (EE.UU.) - Femenina',
                language: 'es-US',
                gender: 'female',
                provider: 'google',
            },
            {
                id: 'es-US-Standard-B',
                name: 'Español (EE.UU.) - Masculina',
                language: 'es-US',
                gender: 'male',
                provider: 'google',
            },
        ];
    }

    async getAvailableVoices(): Promise<RemoteVoice[]> {
        // Si hay API key de Google Cloud, obtener voces reales
        if (process.env.GOOGLE_CLOUD_API_KEY) {
            try {
                return await this.fetchGoogleVoices();
            } catch (error) {
                console.error('Error al obtener voces de Google:', error);
            }
        }

        // Retornar voces por defecto
        return this.voices;
    }

    private async fetchGoogleVoices(): Promise<RemoteVoice[]> {
        // Implementación para obtener voces de Google Cloud TTS
        // Por ahora retornamos las voces por defecto
        return this.voices;
    }

    async generateSpeech(
        text: string,
        voiceId: string,
        provider: string = 'google',
        options: { speed?: number; volume?: number } = {}
    ): Promise<string> {
        // Verificar cache primero
        const cacheKey = this.getCacheKey(text, voiceId, options);
        const cachedFile = path.join(this.cacheDir, `${cacheKey}.mp3`);

        if (fs.existsSync(cachedFile)) {
            return `/cache/tts/${cacheKey}.mp3`;
        }

        let audioUrl: string;

        switch (provider) {
            case 'google':
                audioUrl = await this.generateGoogleTTS(text, voiceId, options);
                break;
            case 'elevenlabs':
                audioUrl = await this.generateElevenLabsTTS(text, voiceId, options);
                break;
            case 'azure':
                audioUrl = await this.generateAzureTTS(text, voiceId, options);
                break;
            default:
                // Usar API gratuita alternativa
                audioUrl = await this.generateFreeTTS(text, voiceId, options);
        }

        // Guardar en cache si es una URL local
        if (audioUrl.startsWith('/')) {
            // Ya está en el servidor
            return audioUrl;
        }

        // Descargar y guardar en cache
        try {
            const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(cachedFile, response.data);
            return `/cache/tts/${cacheKey}.mp3`;
        } catch (error) {
            console.error('Error al guardar en cache:', error);
            return audioUrl;
        }
    }

    private async generateGoogleTTS(
        text: string,
        voiceId: string,
        options: { speed?: number; volume?: number }
    ): Promise<string> {
        // Usar API gratuita de Google Translate TTS
        const language = voiceId.split('-')[0] + '-' + voiceId.split('-')[1];

        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${language}&client=tw-ob&q=${encodeURIComponent(text)}`;
        
        // Descargar y guardar
        const cacheKey = this.getCacheKey(text, voiceId, options);
        const cachedFile = path.join(this.cacheDir, `${cacheKey}.mp3`);

        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            fs.writeFileSync(cachedFile, response.data);
            return `/cache/tts/${cacheKey}.mp3`;
        } catch (error) {
            console.error('Error al generar Google TTS:', error);
            throw error;
        }
    }

    private async generateElevenLabsTTS(
        text: string,
        voiceId: string,
        options: { speed?: number; volume?: number }
    ): Promise<string> {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            throw new Error('ElevenLabs API key no configurada');
        }

        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    speed: options.speed || 1.0,
                },
            },
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer',
            }
        );

        const cacheKey = this.getCacheKey(text, voiceId, options);
        const cachedFile = path.join(this.cacheDir, `${cacheKey}.mp3`);
        fs.writeFileSync(cachedFile, response.data);
        return `/cache/tts/${cacheKey}.mp3`;
    }

    private async generateAzureTTS(
        _text: string,
        _voiceId: string,
        _options: { speed?: number; volume?: number }
    ): Promise<string> {
        const apiKey = process.env.AZURE_SPEECH_KEY;

        if (!apiKey) {
            throw new Error('Azure Speech API key no configurada');
        }

        // Implementación de Azure TTS
        // Por ahora lanzamos error
        throw new Error('Azure TTS no implementado aún');
    }

    private async generateFreeTTS(
        text: string,
        voiceId: string,
        options: { speed?: number; volume?: number }
    ): Promise<string> {
        // Usar Google Translate TTS como fallback gratuito
        return this.generateGoogleTTS(text, voiceId, options);
    }

    private getCacheKey(text: string, voiceId: string, options: { speed?: number; volume?: number }): string {
        const hash = crypto
            .createHash('md5')
            .update(`${text}-${voiceId}-${options.speed || 1.0}-${options.volume || 1.0}`)
            .digest('hex');
        return hash;
    }
}

