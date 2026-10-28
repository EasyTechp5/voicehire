# VoiceHire — AI voice interview platform

Spoken, rubric-scored job interviews. Admins add a job description and approve an AI-drafted rubric;
candidates upload a résumé and hold a voice-to-voice interview; admins review the recording, transcript
and an evidence-backed score. Candidates never see the score (unless practice mode is on).

## Stack
Next.js (App Router) · Tailwind · Anthropic API (Haiku-class talks, Opus-class judges) ·
browser Web Speech API for speech-to-text / text-to-speech · MediaRecorder for audio.

## Run
```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev
```

## v1 limits (see PRD)
- Storage is browser-local (localStorage + IndexedDB): admin and candidate must share a browser. Next step: Supabase (Postgres, auth, RLS, storage).
- Voice uses the browser's built-in speech (Chrome/Edge/Safari). Next step: LiveKit/Pipecat with Deepgram + ElevenLabs/Cartesia for lower latency and real barge-in.
- No auth/roles, scheduling or email yet.
