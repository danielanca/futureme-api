import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const app = Fastify({ logger: true });
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
const statePath = path.join(dataDir, 'claude-files.json');
const sessionsPath = path.join(dataDir, 'sessions.json');
const chunkSize = 1_200;
const maxResultLength = 20_000;

type Chunk = { text: string; filename: string };
type IndexedFile = { hash: string; fileId: string; filename: string; chunks: Chunk[] };
type State = { files: IndexedFile[] };
type KnowledgeCategory = { keywords: string[]; paths: string[] };
type SessionRecord = { result: unknown; resultText: string; updatedAt: string };
type SessionsState = { sessions: Record<string, SessionRecord> };

async function loadState(): Promise<State> {
  try { return JSON.parse(await readFile(statePath, 'utf8')) as State; } catch { return { files: [] }; }
}
async function saveState(state: State) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}
async function loadSessions(): Promise<SessionsState> {
  try { return JSON.parse(await readFile(sessionsPath, 'utf8')) as SessionsState; } catch { return { sessions: {} }; }
}
async function saveSessions(state: SessionsState) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(sessionsPath, JSON.stringify(state, null, 2));
}
function resultToText(result: unknown): string {
  return typeof result === 'string' ? result.trim() : JSON.stringify(result, null, 2);
}
async function loadProcessedFiles(): Promise<IndexedFile[]> {
  const processedDir = path.resolve('knowledge/psychology/processed');
  try {
    const entries = await readdir(processedDir, { withFileTypes: true });
    const files: IndexedFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !['.txt', '.md', '.json', '.html', '.csv'].includes(path.extname(entry.name).toLowerCase())) continue;
      const buffer = await readFile(path.join(processedDir, entry.name));
      files.push({ hash: `processed:${entry.name}`, fileId: `processed:${entry.name}`, filename: `processed/${entry.name}`, chunks: makeChunks(buffer, entry.name) });
    }
    return files;
  } catch { return []; }
}
function requireAdmin(request: { headers: Record<string, unknown> }) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || request.headers['x-admin-key'] !== expected) {
    const error = new Error('Acces interzis.');
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
}
function makeChunks(buffer: Buffer, filename: string): Chunk[] {
  const textExtensions = ['.txt', '.md', '.json', '.html', '.csv'];
  if (!textExtensions.includes(path.extname(filename).toLowerCase())) return [];
  const text = buffer.toString('utf8').replace(/\s+/g, ' ').trim();
  const chunks: Chunk[] = [];
  for (let start = 0; start < text.length; start += chunkSize - 200) {
    chunks.push({ filename, text: text.slice(start, start + chunkSize) });
  }
  return chunks;
}
async function routedFiles(message: string, files: IndexedFile[]): Promise<IndexedFile[]> {
  try {
    const map = JSON.parse(await readFile(path.resolve('knowledge/psychology/metadata/knowledge-map.json'), 'utf8')) as { categories: KnowledgeCategory[] };
    const lowerMessage = message.toLowerCase();
    const categories = map.categories.filter((category) => category.keywords.some((keyword) => lowerMessage.includes(keyword.toLowerCase())));
    if (!categories.length) return files;
    const selected = files.filter((file) => categories.some((category) => category.paths.some((pattern) => file.filename.toLowerCase().includes(pattern.replaceAll('*', '').toLowerCase()))));
    return selected.length ? selected : files;
  } catch { return files; }
}
function relevantChunks(message: string, files: IndexedFile[]): Chunk[] {
  const terms = new Set(message.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2));
  return files.flatMap((file) => file.chunks.map((chunk) => ({ chunk, score: [...terms].reduce((score, term) => score + (chunk.text.toLowerCase().includes(term) ? 1 : 0), 0) })))
    .sort((a, b) => b.score - a.score).slice(0, 6).map(({ chunk }) => chunk);
}
function textFromResponse(response: Anthropic.Message): string {
  return response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map((block) => block.text).join('\n').trim();
}

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 20 } });
app.get('/health', async () => ({ status: 'ok', service: 'futureme-api', timestamp: new Date().toISOString() }));
app.get('/v1', async () => ({ service: 'FutureMe API', version: 'v1', status: 'ready' }));

app.post<{ Body: { sessionId?: string; message?: string; result?: unknown } }>('/chat', async (request, reply) => {
  const sessionId = typeof request.body?.sessionId === 'string' ? request.body.sessionId.trim() : '';
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  if (!sessionId) return reply.code(400).send({ error: 'Câmpul "sessionId" este obligatoriu.' });
  if (sessionId.length > 200) return reply.code(400).send({ error: 'sessionId este prea lung.' });
  if (!message) return reply.code(400).send({ error: 'Câmpul "message" este obligatoriu.' });
  if (message.length > 10_000) return reply.code(400).send({ error: 'Mesajul este prea lung.' });
  if (!anthropic) return reply.code(503).send({ error: 'Serviciul Claude nu este configurat.' });

  const hasResult = Object.prototype.hasOwnProperty.call(request.body ?? {}, 'result') && request.body.result !== undefined && request.body.result !== null;
  let resultText = '';
  if (hasResult) {
    resultText = resultToText(request.body.result);
    if (resultText.length > maxResultLength) return reply.code(400).send({ error: 'Rezultatul sesiunii este prea lung.' });
  }

  try {
    const sessions = await loadSessions();
    if (hasResult) {
      sessions.sessions[sessionId] = { result: request.body.result, resultText, updatedAt: new Date().toISOString() };
      await saveSessions(sessions);
    } else {
      resultText = sessions.sessions[sessionId]?.resultText ?? '';
    }

    const state = await loadState();
    const processedFiles = await loadProcessedFiles();
    const allFiles = [...processedFiles, ...state.files];
    const routingQuery = resultText ? `${resultText}\n${message}` : message;
    const routed = await routedFiles(routingQuery, allFiles);
    const chunks = relevantChunks(routingQuery, routed);
    const context = chunks.length ? chunks.map((chunk, index) => `[Sursa ${index + 1}: ${chunk.filename}]\n${chunk.text}`).join('\n\n') : '(Nu au fost găsite fragmente relevante în baza de cunoștințe.)';
    const resultSection = resultText ? resultText : '(Niciun rezultat de sesiune nu a fost furnizat încă.)';
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: Number(process.env.CLAUDE_MAX_TOKENS ?? 1_200),
      system: 'Ești asistentul AI al aplicației FutureMe, o aplicație de psihologie și orientare personală. Răspunde întotdeauna în aceeași limbă în care utilizatorul a scris mesajul (de exemplu, dacă întrebarea este în engleză, răspunde în engleză); dacă limba mesajului nu este clară, răspunde în română. Fii cald, empatic și clar, în maximum 3-5 propoziții. La începutul conversației, utilizatorul primește rezultatul unei sesiuni de întrebări psihologice (de exemplu tip MBTI, stil decizional sau cod Holland); acest rezultat este furnizat mai jos la secțiunea „Rezultatul sesiunii utilizatorului” și trebuie folosit ca reper principal pentru a personaliza și contextualiza răspunsul pe tot parcursul conversației, chiar dacă nu mai este retransmis la fiecare mesaj. Corelează rezultatul sesiunii cu fragmentele din knowledge base-ul local, în special fișierele din knowledge/psychology/processed, și folosește-le ca sursă principală. Bazează răspunsul mai întâi pe rezultatul sesiunii și pe aceste documente, iar numai dacă informația nu apare acolo poți folosi cunoștințe generale; în acest caz precizează că răspunsul este general și nu provine din documentele FutureMe. Nu inventa și nu prezenta presupunerile ca fapte. Nu pune diagnostice și nu folosi etichete definitive; explică faptul că informațiile sunt orientative și nu înlocuiesc un psiholog sau medic. Pentru situații de criză, auto-vătămare sau pericol imediat, recomandă contactarea serviciilor locale de urgență și a unui adult sau specialist de încredere.',
      messages: [{ role: 'user', content: `Rezultatul sesiunii utilizatorului:\n${resultSection}\n\nÎntrebarea utilizatorului:\n${message}\n\nContext din baza de cunoștințe:\n${context}` }],
    });
    return { answer: textFromResponse(response), sources: [...new Set(chunks.map((chunk) => chunk.filename))] };
  } catch (error) {
    request.log.error(error, 'Claude chat request failed');
    return reply.code(502).send({ error: 'Nu am putut genera răspunsul AI.' });
  }
});

app.post('/admin/documents', async (request, reply) => {
  try {
    requireAdmin(request);
    if (!anthropic) return reply.code(503).send({ error: 'Serviciul Claude nu este configurat.' });
    const state = await loadState();
    const indexed: Array<{ filename: string; fileId: string; status: string }> = [];
    for await (const part of request.parts()) {
      if (part.type !== 'file') continue;
      const buffer = await part.toBuffer();
      const hash = createHash('sha256').update(buffer).digest('hex');
      const existing = state.files.find((file) => file.hash === hash);
      if (existing) { indexed.push({ filename: part.filename, fileId: existing.fileId, status: 'already_indexed' }); continue; }
      const uploaded = await anthropic.beta.files.upload({ file: await toFile(buffer, part.filename) });
      state.files.push({ hash, fileId: uploaded.id, filename: part.filename, chunks: makeChunks(buffer, part.filename) });
      indexed.push({ filename: part.filename, fileId: uploaded.id, status: 'uploaded' });
    }
    await saveState(state);
    return { files: indexed };
  } catch (error) {
    request.log.error(error, 'Document upload failed');
    const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 502;
    return reply.code(statusCode).send({ error: statusCode === 401 ? 'Acces interzis.' : 'Încărcarea documentelor a eșuat.' });
  }
});

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
try { await app.listen({ host, port }); } catch (error) { app.log.error(error); process.exit(1); }
