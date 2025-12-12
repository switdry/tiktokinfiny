# TikFinity Clone - TikTok LIVE Tools

## Overview
A complete TikTok LIVE streaming tools application that provides real-time interaction with TikTok streams including:
- Real-time comment monitoring and display
- Text-to-Speech (TTS) with 35+ remote voices (StreamElements API)
- Sound alerts for gifts, follows, and events
- Interactive overlays for OBS/streaming software
- Goal tracking for followers/gifts/diamonds
- Chatbot functionality
- Song request integration

## Project Architecture
- **Backend**: Node.js/Express server (TypeScript)
- **Frontend**: Static HTML/CSS/JS with compiled TypeScript
- **TTS**: StreamElements free API with caching
- **Real-time**: Server-Sent Events (SSE) for live updates
- **Port**: 5000

## Directory Structure
```
├── public/              # Static frontend files
│   ├── index.html       # Main HTML page
│   ├── styles.css       # Styles
│   ├── favicon.svg      # App icon
│   └── widgets/         # Embeddable widgets for OBS
│       ├── chat.html    # Chat overlay widget
│       ├── alerts.html  # Alerts widget
│       └── goals.html   # Goals progress widget
├── src/                 # TypeScript source files
│   ├── server.ts        # Express backend server
│   ├── app.ts           # Frontend application logic
│   ├── services/        # TTS and other services
│   │   ├── ttsService.ts    # Server-side TTS with StreamElements
│   │   └── remoteTTS.ts     # Client-side TTS service
│   └── types/           # TypeScript type definitions
├── dist/                # Compiled JavaScript output
├── cache/               # TTS audio cache
│   └── tts/             # Cached TTS audio files
```

## Running the Application
```bash
npm run dev    # Development with hot reload
npm run build  # Build TypeScript
npm start      # Production build and run
```

## API Endpoints
- `POST /api/tiktok/start/:username` - Connect to TikTok live stream
- `POST /api/tiktok/stop/:username` - Disconnect from stream
- `GET /api/tiktok/events/:username` - SSE stream for real-time events
- `GET /api/tiktok/comments/:username` - Get recent comments
- `GET /api/tiktok/gifts/:username` - Get recent gifts
- `GET /api/tiktok/stats/:username` - Get room stats
- `GET /api/tts/voices` - Get available TTS voices
- `POST /api/tts/speak` - Generate TTS audio

## Widget URLs (for OBS)
- `/widget/chat/:username` - Chat overlay
- `/widget/alerts/:username` - Alert notifications
- `/widget/goals/:username?type=diamonds&target=1000` - Goal progress bar

## Key Features
- Connects to TikTok LIVE streams using tiktok-live-connector
- 35+ TTS voices via StreamElements API (free, no API key needed)
- Audio caching for improved performance
- Real-time SSE for instant updates
- Multiple widget types for OBS integration
- Gift tracking with diamond counts
- Follower and like tracking

## Recent Changes
- 2024-12-12: Complete system overhaul
  - Added StreamElements TTS with 35+ voices
  - Created embeddable widgets for OBS (chat, alerts, goals)
  - Improved real-time event streaming with SSE
  - Added gift and follow tracking
  - Enhanced UI with better status indicators
  - Added audio caching for TTS
