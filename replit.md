# TikFinity Clone - TikTok LIVE Tools

## Overview
A TikTok LIVE streaming tools application that provides:
- Sound alerts for gifts and events
- Text-to-Speech (TTS) for reading comments
- Interactive overlays for streams
- Goal tracking for followers/gifts
- Chatbot functionality
- Song request integration

## Project Architecture
- **Backend**: Node.js/Express server (TypeScript)
- **Frontend**: Static HTML/CSS/JS served from `/public` and compiled TypeScript from `/dist`
- **Port**: 5000

## Directory Structure
```
├── public/          # Static frontend files
│   ├── index.html   # Main HTML page
│   └── styles.css   # Styles
├── src/             # TypeScript source files
│   ├── server.ts    # Express backend server
│   ├── app.ts       # Frontend application logic
│   ├── services/    # TTS services
│   └── types/       # TypeScript type definitions
├── dist/            # Compiled JavaScript output
```

## Running the Application
```bash
npm run dev    # Development with hot reload
npm run build  # Build TypeScript
npm start      # Production build and run
```

## Key Features
- Connects to TikTok LIVE streams to monitor comments
- Reads comments aloud using browser TTS or remote TTS services
- Server-Sent Events for real-time comment updates
- Multiple user monitoring support

## Recent Changes
- 2024-12-12: Initial Replit setup
  - Changed server port from 3000 to 5000
  - Updated frontend script to use ES modules from /dist/app.js
