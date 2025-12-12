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
            { id: 'Brian', name: 'Brian (Inglés)', language: 'en-GB', gender: 'male', provider: 'streamelements' },
            { id: 'Amy', name: 'Amy (Inglés)', language: 'en-GB', gender: 'female', provider: 'streamelements' },
            { id: 'Emma', name: 'Emma (Inglés)', language: 'en-GB', gender: 'female', provider: 'streamelements' },
            { id: 'Joanna', name: 'Joanna (Inglés US)', language: 'en-US', gender: 'female', provider: 'streamelements' },
            { id: 'Joey', name: 'Joey (Inglés US)', language: 'en-US', gender: 'male', provider: 'streamelements' },
            { id: 'Matthew', name: 'Matthew (Inglés US)', language: 'en-US', gender: 'male', provider: 'streamelements' },
            { id: 'Conchita', name: 'Conchita (Español España)', language: 'es-ES', gender: 'female', provider: 'streamelements' },
            { id: 'Enrique', name: 'Enrique (Español España)', language: 'es-ES', gender: 'male', provider: 'streamelements' },
            { id: 'Lucia', name: 'Lucia (Español España)', language: 'es-ES', gender: 'female', provider: 'streamelements' },
            { id: 'Mia', name: 'Mia (Español México)', language: 'es-MX', gender: 'female', provider: 'streamelements' },
            { id: 'Miguel', name: 'Miguel (Español US)', language: 'es-US', gender: 'male', provider: 'streamelements' },
            { id: 'Penelope', name: 'Penelope (Español US)', language: 'es-US', gender: 'female', provider: 'streamelements' },
            { id: 'Lupe', name: 'Lupe (Español US)', language: 'es-US', gender: 'female', provider: 'streamelements' },
            { id: 'Camila', name: 'Camila (Portugués Brasil)', language: 'pt-BR', gender: 'female', provider: 'streamelements' },
            { id: 'Vitoria', name: 'Vitoria (Portugués Brasil)', language: 'pt-BR', gender: 'female', provider: 'streamelements' },
            { id: 'Ricardo', name: 'Ricardo (Portugués Brasil)', language: 'pt-BR', gender: 'male', provider: 'streamelements' },
            { id: 'Celine', name: 'Celine (Francés)', language: 'fr-FR', gender: 'female', provider: 'streamelements' },
            { id: 'Mathieu', name: 'Mathieu (Francés)', language: 'fr-FR', gender: 'male', provider: 'streamelements' },
            { id: 'Hans', name: 'Hans (Alemán)', language: 'de-DE', gender: 'male', provider: 'streamelements' },
            { id: 'Marlene', name: 'Marlene (Alemán)', language: 'de-DE', gender: 'female', provider: 'streamelements' },
            { id: 'Vicki', name: 'Vicki (Alemán)', language: 'de-DE', gender: 'female', provider: 'streamelements' },
            { id: 'Giorgio', name: 'Giorgio (Italiano)', language: 'it-IT', gender: 'male', provider: 'streamelements' },
            { id: 'Carla', name: 'Carla (Italiano)', language: 'it-IT', gender: 'female', provider: 'streamelements' },
            { id: 'Bianca', name: 'Bianca (Italiano)', language: 'it-IT', gender: 'female', provider: 'streamelements' },
            { id: 'Takumi', name: 'Takumi (Japonés)', language: 'ja-JP', gender: 'male', provider: 'streamelements' },
            { id: 'Mizuki', name: 'Mizuki (Japonés)', language: 'ja-JP', gender: 'female', provider: 'streamelements' },
            { id: 'Seoyeon', name: 'Seoyeon (Coreano)', language: 'ko-KR', gender: 'female', provider: 'streamelements' },
            { id: 'Zhiyu', name: 'Zhiyu (Chino)', language: 'zh-CN', gender: 'female', provider: 'streamelements' },
            { id: 'Filiz', name: 'Filiz (Turco)', language: 'tr-TR', gender: 'female', provider: 'streamelements' },
            { id: 'Astrid', name: 'Astrid (Sueco)', language: 'sv-SE', gender: 'female', provider: 'streamelements' },
            { id: 'Tatyana', name: 'Tatyana (Ruso)', language: 'ru-RU', gender: 'female', provider: 'streamelements' },
            { id: 'Maxim', name: 'Maxim (Ruso)', language: 'ru-RU', gender: 'male', provider: 'streamelements' },
            { id: 'Ewa', name: 'Ewa (Polaco)', language: 'pl-PL', gender: 'female', provider: 'streamelements' },
            { id: 'Maja', name: 'Maja (Polaco)', language: 'pl-PL', gender: 'female', provider: 'streamelements' },
            { id: 'Jan', name: 'Jan (Polaco)', language: 'pl-PL', gender: 'male', provider: 'streamelements' },
            { id: 'Liv', name: 'Liv (Noruego)', language: 'nb-NO', gender: 'female', provider: 'streamelements' },
            { id: 'Lotte', name: 'Lotte (Holandés)', language: 'nl-NL', gender: 'female', provider: 'streamelements' },
            { id: 'Ruben', name: 'Ruben (Holandés)', language: 'nl-NL', gender: 'male', provider: 'streamelements' },
        ];
    }

    async getAvailableVoices(): Promise<RemoteVoice[]> {
        return this.voices;
    }

    async generateSpeech(
        text: string,
        voiceId: string,
        _provider: string = 'streamelements',
        options: { speed?: number; volume?: number } = {}
    ): Promise<string> {
        const cacheKey = this.getCacheKey(text, voiceId, options);
        const cachedFile = path.join(this.cacheDir, `${cacheKey}.mp3`);

        if (fs.existsSync(cachedFile)) {
            return `/cache/tts/${cacheKey}.mp3`;
        }

        try {
            const audioUrl = await this.generateStreamElementsTTS(text, voiceId);
            return audioUrl;
        } catch (error) {
            console.error('Error generating TTS:', error);
            throw error;
        }
    }

    private async generateStreamElementsTTS(text: string, voiceId: string): Promise<string> {
        const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voiceId}&text=${encodeURIComponent(text)}`;
        
        const cacheKey = this.getCacheKey(text, voiceId, {});
        const cachedFile = path.join(this.cacheDir, `${cacheKey}.mp3`);

        try {
            const response = await axios.get(url, { 
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            fs.writeFileSync(cachedFile, response.data);
            return `/cache/tts/${cacheKey}.mp3`;
        } catch (error) {
            console.error('Error with StreamElements TTS:', error);
            throw error;
        }
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
