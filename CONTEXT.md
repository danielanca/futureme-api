# FutureMe — Context pentru AI și dezvoltare

## Scopul proiectului

FutureMe este o aplicație de psihologie și orientare personală care ajută utilizatorii să își înțeleagă mai bine interesele, aptitudinile, stilul de gândire și posibilele direcții de viață. Tonul aplicației trebuie să fie cald, empatic și clar, fără diagnostice clinice și fără etichete definitive.

Aplicația este destinată inclusiv adolescenților. Răspunsurile AI trebuie să fie responsabile, non-clinice și potrivite vârstei. AI-ul nu trebuie să pretindă că înlocuiește un psiholog, un medic sau un serviciu de urgență.

## Rolul backendului

Backendul oferă un API pentru aplicația Flutter FutureMe. Cheia Anthropic rămâne exclusiv pe server. Documentele de referință sunt încărcate de administrator în Claude Files API; pentru documentele text, serverul construiește și un index local de fragmente pentru a selecta contextul relevant înaintea apelului Claude.

## Structură importantă

- `src/server.ts` — serverul Fastify și endpointurile API.
- `knowledge/psychology/` — documentele importante despre psihologie, orientare și metodologia FutureMe.
- `data/claude-files.json` — stare locală generată automat: fișierele Claude, hash-urile și fragmentele indexate. Nu se versionează.
- `.env` — secrete și configurări locale. Nu se versionază.
- `API.md` — instrucțiuni pentru pornire, chat și indexarea documentelor.

## Reguli pentru baza de cunoștințe

1. Documentele puse în `knowledge/psychology/` trebuie să fie surse aprobate de administrator.
2. Nu introducem date personale reale ale utilizatorilor în documentele de cunoștințe.
3. Preferăm `md`, `txt`, `json`, `html`; sunt acceptate și `pdf`, `docx`, `csv` când sunt text-searchable.
4. Pentru fiecare document este util să existe un titlu, o sursă, o dată și domeniul în care poate fi folosit.
5. După adăugarea sau modificarea documentelor, administratorul le încarcă prin endpointul `/admin/documents`.
6. Același fișier nu este indexat de două ori: backendul verifică hash-ul conținutului.

## Comportamentul AI

- Răspunde în limba română, dacă utilizatorul nu cere altceva.
- Folosește documentele indexate ca sursă principală.
- Dacă informația nu apare în documente, spune acest lucru și nu inventează.
- Explică pe înțelesul utilizatorului și evită limbajul excesiv de clinic.
- Folosește formulări de tipul „acesta poate fi un reper, nu o etichetă”.
- Pentru situații de criză, auto-vătămare sau risc imediat, recomandă contactarea serviciilor locale de urgență și a unui adult sau specialist de încredere.

## Modificări efectuate

### 2026-08-29

- A fost adăugat SDK-ul oficial `@anthropic-ai/sdk`.
- A fost adăugat `@fastify/multipart` pentru încărcarea mai multor documente.
- A fost implementat `POST /chat` cu Claude Messages API.
- Răspunsul chatului are forma `{ answer, sources }`.
- A fost implementat `POST /admin/documents` pentru upload și indexare.
- Indexarea este idempotentă pe baza hash-ului SHA-256 al fișierului.
- Documentele sunt încărcate o singură dată în Claude Files API și sunt căutate local în fragmente text relevante.
- A fost adăugat `knowledge/psychology/metadata/knowledge-map.json` și rutarea întrebărilor către categorii și documente relevante înaintea căutării fragmentelor.
- Au fost adăugate `.env.example` și `API.md`.
- A fost creat folderul `knowledge/psychology/` pentru materialele de psihologie.
- Au fost convertite toate cele 36 de PDF-uri din `knowledge/psychology/raw/` în Markdown și JSON în `knowledge/psychology/processed/`, fără OCR în primul lot.
- Au fost păstrate fișierele originale; OCR-ul rămâne un lot separat pentru PDF-urile scanate.

## Instrucțiuni pentru modificări viitoare

Orice schimbare importantă trebuie adăugată în secțiunea „Modificări efectuate”, cu data, fișierele afectate și motivul schimbării. Înainte de modificări, AI-ul trebuie să citească acest fișier și `API.md`.
