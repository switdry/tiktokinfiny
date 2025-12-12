import { RemoteVoice, RemoteTTSResponse } from '../types';

// Para el navegador, usar window.location.origin o localhost
const getApiUrl = (): string => {
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }
    return process.env.API_URL || 'http://localhost:3000';
};

export class RemoteTTSService {
    private apiUrl: string;

    constructor(apiUrl?: string) {
        this.apiUrl = apiUrl || getApiUrl();
    }

    /**
     * Obtener voces remotas disponibles
     */
    async getRemoteVoices(): Promise<RemoteVoice[]> {
        try {
            const response = await fetch(`${this.apiUrl}/api/tts/voices`);
            if (!response.ok) {
                throw new Error('Error al obtener voces remotas');
            }
            const data = await response.json();
            return data.voices || [];
        } catch (error) {
            console.error('Error al obtener voces remotas:', error);
            return this.getDefaultVoices();
        }
    }

    /**
     * Generar audio usando TTS remoto
     */
    async generateSpeech(
        text: string,
        voice: RemoteVoice,
        options: {
            speed?: number;
            volume?: number;
        } = {}
    ): Promise<string> {
        try {
            const response = await fetch(`${this.apiUrl}/api/tts/speak`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    voiceId: voice.id,
                    provider: voice.provider,
                    speed: options.speed || 1.0,
                    volume: options.volume || 1.0,
                }),
            });

            if (!response.ok) {
                throw new Error('Error al generar audio');
            }

            const data: RemoteTTSResponse = await response.json();
            return data.audioUrl;
        } catch (error) {
            console.error('Error al generar speech remoto:', error);
            throw error;
        }
    }

    /**
     * Voces por defecto si el servidor no está disponible
     */
    private getDefaultVoices(): RemoteVoice[] {
        return [
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
        ];
    }
}

