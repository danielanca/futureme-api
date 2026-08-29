# FutureMe API — AI chat

## Configurare

```bash
cp .env.example .env
# completează OPENAI_API_KEY și ADMIN_API_KEY în .env
npm install
npm run dev
```

Cheia Anthropic rămâne doar pe server. Fișierele sunt încărcate o singură dată în Claude Files API, iar fragmentele text sunt păstrate local în `data/claude-files.json` pentru căutare relevantă.

## Chat

```bash
curl -X POST http://127.0.0.1:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Care este informația relevantă pentru mine?"}'
```

Răspunsul conține `answer` și sursele găsite, când OpenAI returnează citări.

## Upload și indexare documente

Documentele sunt încărcate o singură dată pe baza hash-ului conținutului. Sunt suportate formatele acceptate de Claude Files API; pentru căutare locală completă, preferă txt, md, json, html și csv. PDF/docx sunt păstrate în Claude Files API, dar necesită un extractor local dacă vrem să le căutăm fragment cu fragment.

Documentele proiectului se păstrează în `knowledge/psychology/`. Pentru reguli și contextul produsului, consultă `CONTEXT.md`.

```bash
curl -X POST http://127.0.0.1:3000/admin/documents \
  -H 'x-admin-key: change-this-admin-key' \
  -F 'files=@./documents/ghid.md' \
  -F 'files=@./knowledge/psychology/faq.pdf'
```

Endpointul admin este protejat cu `x-admin-key`; în producție folosește HTTPS și autentificare administrativă mai robustă.
