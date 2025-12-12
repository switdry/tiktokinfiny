import { AppState, Comment } from './types';
import { RemoteTTSService } from './services/remoteTTS';

// Estado de la aplicación
const state: AppState = {
    users: [],
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
        filterMentions: true,
    },
    commentCount: 0,
    intervals: [],
    lastCommentTimestamp: {},
};

const remoteTTS = new RemoteTTSService();
const API_URL = window.location.origin;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando aplicación TikTok Comments Reader...');
    try {
        initializeTTS();
        setupEventListeners();
        loadVoices();
        loadRemoteVoices();
        console.log('✅ Aplicación inicializada correctamente');
    } catch (error) {
        console.error('❌ Error al inicializar aplicación:', error);
        updateStatus('Error al inicializar la aplicación', 'error');
    }
});

// Configurar TTS
function initializeTTS(): void {
    if ('speechSynthesis' in window) {
        state.tts = window.speechSynthesis;
        console.log('✅ TTS inicializado correctamente');
    } else {
        const errorMsg = 'Tu navegador no soporta Text-to-Speech. Por favor, usa Chrome, Edge o Safari.';
        alert(errorMsg);
        console.error('❌', errorMsg);
    }
}

// Cargar voces locales disponibles
function loadVoices(): void {
    const loadVoicesList = (): void => {
        if (!state.tts) return;
        
        state.voices = state.tts.getVoices();
        const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;
        if (!voiceSelect) return;
        
        voiceSelect.innerHTML = '';

        // Filtrar voces en español
        const spanishVoices = state.voices.filter(
            (voice) => voice.lang.includes('es') || voice.lang.includes('ES')
        );

        const voicesToShow = spanishVoices.length > 0 ? spanishVoices : state.voices;

        voicesToShow.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        if (voicesToShow.length > 0) {
            state.settings.voice = voicesToShow[0];
            console.log(`✅ ${voicesToShow.length} voces locales cargadas`);
        }
    };

    loadVoicesList();
    if (state.tts && state.tts.onvoiceschanged !== undefined) {
        state.tts.onvoiceschanged = loadVoicesList;
    }
}

// Cargar voces remotas
async function loadRemoteVoices(): Promise<void> {
    try {
        state.remoteVoices = await remoteTTS.getRemoteVoices();
        const remoteVoiceSelect = document.getElementById('remoteVoiceSelect') as HTMLSelectElement;
        if (!remoteVoiceSelect) return;

        remoteVoiceSelect.innerHTML = '<option value="">Seleccionar voz remota...</option>';

        state.remoteVoices.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = `${voice.name} (${voice.provider})`;
            remoteVoiceSelect.appendChild(option);
        });

        if (state.remoteVoices.length > 0) {
            state.settings.remoteVoice = state.remoteVoices[0];
            console.log(`✅ ${state.remoteVoices.length} voces remotas cargadas`);
        }
    } catch (error) {
        console.warn('⚠️ Error al cargar voces remotas (usando voces por defecto):', error);
    }
}

// Configurar event listeners
function setupEventListeners(): void {
    console.log('🔧 Configurando event listeners...');
    
    // Botón agregar usuario
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addUser();
        });
        console.log('✅ Event listener agregado a addUserBtn');
    } else {
        console.error('❌ addUserBtn no encontrado');
    }
    
    // Input de username
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addUser();
            }
        });
        console.log('✅ Event listener agregado a usernameInput');
    } else {
        console.error('❌ usernameInput no encontrado');
    }
    
    // Otros botones
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    startBtn?.addEventListener('click', startReading);
    stopBtn?.addEventListener('click', stopReading);
    clearBtn?.addEventListener('click', clearUsers);

    // Configuración
    const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;
    const remoteVoiceSelect = document.getElementById('remoteVoiceSelect') as HTMLSelectElement;
    const speedRange = document.getElementById('speedRange') as HTMLInputElement;
    const volumeRange = document.getElementById('volumeRange') as HTMLInputElement;
    const filterMentions = document.getElementById('filterMentions') as HTMLInputElement;
    const useRemoteTTS = document.getElementById('useRemoteTTS') as HTMLInputElement;

    voiceSelect?.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        const index = parseInt(target.value);
        if (!isNaN(index) && state.voices[index]) {
            state.settings.voice = state.voices[index];
        }
    });

    remoteVoiceSelect?.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        const voice = state.remoteVoices.find((v) => v.id === target.value);
        if (voice) {
            state.settings.remoteVoice = voice;
        }
    });

    speedRange?.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        state.settings.speed = parseFloat(target.value);
        const speedValue = document.getElementById('speedValue');
        if (speedValue) {
            speedValue.textContent = target.value;
        }
    });

    volumeRange?.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        state.settings.volume = parseInt(target.value) / 100;
        const volumeValue = document.getElementById('volumeValue');
        if (volumeValue) {
            volumeValue.textContent = target.value;
        }
    });

    filterMentions?.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;
        state.settings.filterMentions = target.checked;
    });

    useRemoteTTS?.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;
        state.settings.useRemote = target.checked;
        updateVoiceSelectsVisibility();
    });
    
    console.log('✅ Todos los event listeners configurados');
}

// Actualizar visibilidad de selects de voz
function updateVoiceSelectsVisibility(): void {
    const voiceSelectContainer = document.getElementById('localVoiceContainer');
    const remoteVoiceSelectContainer = document.getElementById('remoteVoiceContainer');
    
    if (state.settings.useRemote) {
        voiceSelectContainer?.classList.add('hidden');
        remoteVoiceSelectContainer?.classList.remove('hidden');
    } else {
        voiceSelectContainer?.classList.remove('hidden');
        remoteVoiceSelectContainer?.classList.add('hidden');
    }
}

// Agregar usuario
function addUser(): void {
    const input = document.getElementById('username') as HTMLInputElement;
    if (!input) {
        console.error('❌ Input de username no encontrado');
        return;
    }

    let username = input.value.trim();
    
    // Remover @ si está presente
    if (username.startsWith('@')) {
        username = username.substring(1);
    }
    
    // Validar
    if (!username || username.length === 0) {
        alert('⚠️ Por favor, ingresa un nombre de usuario');
        input.focus();
        return;
    }
    
    // Validar formato básico (solo letras, números, guiones y guiones bajos)
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        alert('⚠️ El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos');
        input.focus();
        return;
    }

    // Verificar si ya existe
    if (state.users.includes(username)) {
        alert(`⚠️ El usuario @${username} ya está en la lista`);
        input.focus();
        return;
    }

    // Agregar usuario
    state.users.push(username);
    console.log(`✅ Usuario agregado: @${username} (Total: ${state.users.length})`);
    
    input.value = '';
    updateUsersDisplay();
    updateStartButton();
    updateStatus(`Usuario @${username} agregado`, 'active');
    
    // Mensaje temporal
    setTimeout(() => {
        if (state.isReading) {
            updateStatus('Monitoreando comentarios...', 'active');
        } else {
            updateStatus('Listo', '');
        }
    }, 2000);
}

// Remover usuario
function removeUser(username: string): void {
    if (!username) return;
    
    const index = state.users.indexOf(username);
    if (index > -1) {
        state.users.splice(index, 1);
        console.log(`✅ Usuario removido: @${username} (Total: ${state.users.length})`);
        updateUsersDisplay();
        updateStartButton();
        updateStatus(`Usuario @${username} removido`, '');
        
        // Si estaba leyendo, detener monitoreo de ese usuario
        if (state.isReading) {
            stopMonitoringOnServer(username);
        }
    }
}

// Actualizar display de usuarios
function updateUsersDisplay(): void {
    const container = document.getElementById('usersContainer');
    if (!container) {
        console.error('❌ usersContainer no encontrado');
        return;
    }

    container.innerHTML = '';

    if (state.users.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No hay usuarios agregados</p>';
        return;
    }

    state.users.forEach((username) => {
        const tag = document.createElement('div');
        tag.className = 'user-tag';
        
        const span = document.createElement('span');
        span.textContent = `@${username}`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', `Remover ${username}`);
        removeBtn.addEventListener('click', () => {
            removeUser(username);
        });
        
        tag.appendChild(span);
        tag.appendChild(removeBtn);
        container.appendChild(tag);
    });
    
    console.log(`✅ Display actualizado: ${state.users.length} usuario(s) mostrado(s)`);
}

// Actualizar botón de inicio
function updateStartButton(): void {
    const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    if (startBtn) {
        startBtn.disabled = state.users.length === 0 || state.isReading;
    }
}

// Limpiar usuarios
function clearUsers(): void {
    if (state.users.length === 0) {
        alert('ℹ️ No hay usuarios para limpiar');
        return;
    }
    
    if (confirm(`¿Estás seguro de que quieres eliminar todos los usuarios (${state.users.length})?`)) {
        const count = state.users.length;
        state.users = [];
        updateUsersDisplay();
        updateStartButton();
        updateStatus('Lista de usuarios limpiada', '');
        console.log(`✅ ${count} usuario(s) eliminado(s)`);
    }
}

// Iniciar lectura
function startReading(): void {
    if (state.users.length === 0) {
        alert('⚠️ Por favor, agrega al menos un usuario antes de iniciar');
        return;
    }

    state.isReading = true;
    state.commentCount = 0;
    state.lastCommentTimestamp = {};
    updateUI();
    updateStatus('Conectando...', 'active');
    console.log(`🚀 Iniciando monitoreo de ${state.users.length} usuario(s)...`);

    // Iniciar monitoreo para cada usuario
    state.users.forEach((username) => {
        startMonitoringUser(username);
    });
}

// Detener lectura
async function stopReading(): Promise<void> {
    console.log('🛑 Deteniendo monitoreo...');
    state.isReading = false;
    
    if (state.tts) {
        state.tts.cancel();
    }
    
    state.intervals.forEach((interval) => clearInterval(interval));
    state.intervals = [];
    state.commentQueue = [];
    state.currentReading = null;

    // Detener monitoreo en el servidor para cada usuario
    for (const username of state.users) {
        await stopMonitoringOnServer(username);
    }

    updateUI();
    updateStatus('Detenido', '');
    console.log('✅ Monitoreo detenido');
}

// Monitorear usuario
async function startMonitoringUser(username: string): Promise<void> {
    console.log(`📡 Iniciando monitoreo de @${username}...`);
    
    // Iniciar monitoreo en el servidor
    await startMonitoringOnServer(username);

    // Polling para obtener comentarios cada 2 segundos
    const interval = setInterval(() => {
        if (!state.isReading) {
            clearInterval(interval);
            return;
        }
        fetchCommentsFromTikTok(username);
    }, 2000);

    state.intervals.push(interval);
}

// Obtener comentarios de TikTok
async function fetchCommentsFromTikTok(username: string): Promise<void> {
    try {
        const response = await fetch(`${API_URL}/api/tiktok/comments/${username}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.comments && Array.isArray(data.comments)) {
                const lastTimestamp = state.lastCommentTimestamp[username] || 0;
                let newComments = 0;

                data.comments.forEach((comment: Comment) => {
                    if (comment.timestamp > lastTimestamp) {
                        processComment(comment);
                        newComments++;
                        state.lastCommentTimestamp[username] = Math.max(
                            state.lastCommentTimestamp[username] || 0,
                            comment.timestamp
                        );
                    }
                });
                
                if (newComments > 0) {
                    console.log(`📨 ${newComments} nuevo(s) comentario(s) de @${username}`);
                }
            }
        } else if (response.status === 404) {
            // Usuario no está siendo monitoreado, intentar iniciar
            await startMonitoringOnServer(username);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error al obtener comentarios de @${username}:`, errorMessage);
        
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
            updateStatus('⚠️ Error de conexión con el servidor', 'error');
        }
    }
}

// Iniciar monitoreo en el servidor
async function startMonitoringOnServer(username: string): Promise<void> {
    try {
        const response = await fetch(`${API_URL}/api/tiktok/start/${username}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Monitoreo iniciado para @${username}:`, data.message || 'Conectado');
            updateStatus(`Conectado a @${username}`, 'active');
        } else {
            const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
            console.error(`❌ Error al iniciar monitoreo para @${username}:`, error);
            updateStatus(`⚠️ Error: ${error.error || 'No se pudo conectar'}`, 'error');
        }
    } catch (error) {
        console.error(`❌ Error al iniciar monitoreo en servidor para @${username}:`, error);
        updateStatus('⚠️ Error de conexión', 'error');
    }
}

// Detener monitoreo en el servidor
async function stopMonitoringOnServer(username: string): Promise<void> {
    try {
        const response = await fetch(`${API_URL}/api/tiktok/stop/${username}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            console.log(`✅ Monitoreo detenido para @${username}`);
        }
    } catch (error) {
        console.error(`❌ Error al detener monitoreo para @${username}:`, error);
    }
}

// Procesar comentario
function processComment(comment: Comment): void {
    // Filtrar si está activado
    if (state.settings.filterMentions && !comment.text.includes('@')) {
        return;
    }

    // Agregar a la cola
    state.commentQueue.push(comment);
    state.commentCount++;

    // Mostrar en UI
    displayComment(comment);

    // Leer si no hay nada leyendo
    if (!state.currentReading && state.isReading) {
        readNextComment();
    }

    const commentCountEl = document.getElementById('commentCount');
    if (commentCountEl) {
        commentCountEl.textContent = `${state.commentCount} comentario(s)`;
    }
}

// Mostrar comentario en UI
function displayComment(comment: Comment): void {
    const container = document.getElementById('commentsContainer');
    if (!container) return;

    // Remover mensaje vacío si existe
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment-item';
    commentDiv.id = `comment-${comment.timestamp}`;

    const time = new Date(comment.timestamp).toLocaleTimeString('es-ES');

    commentDiv.innerHTML = `
        <div class="comment-header">
            <span class="comment-user">@${escapeHtml(comment.user)}</span>
            <span class="comment-time">${time}</span>
        </div>
        <div class="comment-text">${escapeHtml(comment.text)}</div>
    `;

    container.insertBefore(commentDiv, container.firstChild);

    // Limitar a 50 comentarios
    const comments = container.querySelectorAll('.comment-item');
    if (comments.length > 50) {
        comments[comments.length - 1].remove();
    }
}

// Leer siguiente comentario
async function readNextComment(): Promise<void> {
    if (state.commentQueue.length === 0 || !state.isReading) {
        state.currentReading = null;
        return;
    }

    const comment = state.commentQueue.shift();
    if (!comment) return;

    state.currentReading = comment;

    // Marcar como leyendo
    const commentElement = document.getElementById(`comment-${comment.timestamp}`);
    if (commentElement) {
        commentElement.classList.add('reading');
    }

    try {
        if (state.settings.useRemote && state.settings.remoteVoice) {
            // Usar TTS remoto
            await readWithRemoteTTS(comment, commentElement);
        } else {
            // Usar TTS local
            readWithLocalTTS(comment, commentElement);
        }
    } catch (error) {
        console.error('❌ Error al leer comentario:', error);
        if (commentElement) {
            commentElement.classList.remove('reading');
        }
        state.currentReading = null;
        readNextComment();
    }
}

// Leer con TTS local
function readWithLocalTTS(comment: Comment, commentElement: HTMLElement | null): void {
    if (!state.tts) return;

    const utterance = new SpeechSynthesisUtterance(comment.text);

    if (state.settings.voice) {
        utterance.voice = state.settings.voice;
    }

    utterance.rate = state.settings.speed;
    utterance.volume = state.settings.volume;
    utterance.lang = 'es-ES';

    utterance.onend = () => {
        if (commentElement) {
            commentElement.classList.remove('reading');
        }
        state.currentReading = null;

        // Leer siguiente si hay más
        if (state.commentQueue.length > 0 && state.isReading) {
            setTimeout(() => readNextComment(), 500);
        }
    };

    utterance.onerror = (error) => {
        console.error('❌ Error en TTS:', error);
        if (commentElement) {
            commentElement.classList.remove('reading');
        }
        state.currentReading = null;
        readNextComment();
    };

    state.tts.speak(utterance);
}

// Leer con TTS remoto
async function readWithRemoteTTS(
    comment: Comment,
    commentElement: HTMLElement | null
): Promise<void> {
    if (!state.settings.remoteVoice) return;

    try {
        const audioUrl = await remoteTTS.generateSpeech(comment.text, state.settings.remoteVoice, {
            speed: state.settings.speed,
            volume: state.settings.volume,
        });

        const audio = new Audio(audioUrl);
        audio.volume = state.settings.volume;

        audio.onended = () => {
            if (commentElement) {
                commentElement.classList.remove('reading');
            }
            state.currentReading = null;

            // Leer siguiente si hay más
            if (state.commentQueue.length > 0 && state.isReading) {
                setTimeout(() => readNextComment(), 500);
            }
        };

        audio.onerror = (error) => {
            console.error('❌ Error al reproducir audio remoto:', error);
            if (commentElement) {
                commentElement.classList.remove('reading');
            }
            state.currentReading = null;
            readNextComment();
        };

        await audio.play();
    } catch (error) {
        console.error('❌ Error al generar TTS remoto:', error);
        // Fallback a TTS local
        readWithLocalTTS(comment, commentElement);
    }
}

// Actualizar UI
function updateUI(): void {
    const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    const addUserBtn = document.getElementById('addUserBtn') as HTMLButtonElement;

    if (startBtn) startBtn.disabled = state.isReading || state.users.length === 0;
    if (stopBtn) stopBtn.disabled = !state.isReading;
    if (usernameInput) usernameInput.disabled = state.isReading;
    if (addUserBtn) addUserBtn.disabled = state.isReading;
}

// Actualizar estado
function updateStatus(text: string, className: string = ''): void {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = text;
        statusText.className = `status-text ${className}`;
    }
}

// Escapar HTML
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Exportar funciones globales necesarias
(window as any).removeUser = removeUser;

console.log('📦 Módulo app.ts cargado');
