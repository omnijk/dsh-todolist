/**
 * dsh-todolist — Host half.
 *
 * Owns the durable todo state (a single JSON document inside the DSH profile)
 * and exposes it to the browser half through one exact same-origin route:
 *
 *   GET  /api/todolist.state        -> { version, workspaces }
 *   POST /api/todolist.state        -> { workspaceId, entry } => { version, workspaces }
 *
 * Only the owner Peer can reach a registered route (the desktop session), and
 * the GUI page talks to it with plain same-origin `fetch`, so no token has to
 * be threaded through the client half.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'

const ROUTE = '/api/todolist.state'
const DOCUMENT_VERSION = 1
const MAX_BODY_BYTES = 24 * 1024 * 1024
const MAX_ITEMS = 500
const MAX_DRAFT_CHARS = 20000
const MAX_FILES_PER_ITEM = 6
const MAX_IMAGE_CHARS = 3_600_000
const MAX_FILE_TEXT_CHARS = 200000

/**
 * Attachments live inline in the document: images as base64 (the prompt wire
 * format), text files as their decoded body. Both are re-validated here so a
 * hand-edited state file cannot push an unbounded payload into a prompt.
 */
function normalizeFiles(raw) {
  if (!Array.isArray(raw)) return []
  const files = []
  for (const file of raw.slice(0, MAX_FILES_PER_ITEM)) {
    if (file === null || typeof file !== 'object') continue
    const name = typeof file.name === 'string' && file.name.length > 0 ? file.name.slice(0, 160) : 'file'
    if (file.kind === 'image') {
      const data = typeof file.data === 'string' ? file.data : ''
      const mediaType = typeof file.mediaType === 'string' ? file.mediaType : ''
      if (data.length === 0 || data.length > MAX_IMAGE_CHARS) continue
      if (!mediaType.startsWith('image/')) continue
      files.push({
        id: typeof file.id === 'string' && file.id.length > 0 ? file.id : `f-${Math.random().toString(36).slice(2, 10)}`,
        kind: 'image',
        name,
        mediaType,
        data,
      })
      continue
    }
    const text = typeof file.text === 'string' ? file.text.slice(0, MAX_FILE_TEXT_CHARS) : ''
    if (text.length === 0) continue
    files.push({
      id: typeof file.id === 'string' && file.id.length > 0 ? file.id : `f-${Math.random().toString(36).slice(2, 10)}`,
      kind: 'text',
      name,
      text,
    })
  }
  return files
}

/**
 * Resolve the on-disk document path.
 *
 * The desktop app does not export DSH_PROFILE_DIR to plugin code, so the path
 * is derived from whatever the process does tell us: an explicit profile
 * directory, the working directory when it is a profile (desktop launches from
 * it), or the profile name carried in DSH_USER_AGENT_SUFFIX. Only when none of
 * those resolve does it fall back to the OS temp directory.
 */
function profileRoot() {
  const explicit = process.env.DSH_PROFILE_DIR
  if (typeof explicit === 'string' && explicit.length > 0) return explicit

  const cwd = process.cwd()
  if (basename(cwd) !== 'node_modules' && existsSync(join(cwd, 'cordis.yml'))) return cwd

  const suffix = process.env.DSH_USER_AGENT_SUFFIX ?? ''
  const named = /dsh-profile\/([^/\s]+)/.exec(suffix)?.[1] ?? process.env.DSH_PROFILE
  if (typeof named === 'string' && named.length > 0) {
    return join(homedir(), '.dsh', 'profiles', named)
  }
  return join(homedir(), '.dsh')
}

function statePath() {
  return join(profileRoot(), 'plugin-data', 'dsh-todolist', 'state.json')
}

/** Coerce arbitrary persisted/requested data into the stored document shape. */
function normalizeDocument(raw) {
  const workspaces = {}
  if (raw !== null && typeof raw === 'object' && raw.workspaces !== null && typeof raw.workspaces === 'object') {
    for (const [workspaceId, entry] of Object.entries(raw.workspaces)) {
      if (workspaceId.length === 0 || entry === null || typeof entry !== 'object') continue
      const items = Array.isArray(entry.items)
        ? entry.items
            .filter(item => item !== null && typeof item === 'object' && typeof item.text === 'string')
            .slice(0, MAX_ITEMS)
            .map(item => ({
              id: typeof item.id === 'string' && item.id.length > 0 ? item.id : `t-${Math.random().toString(36).slice(2, 10)}`,
              text: item.text,
              title: typeof item.title === 'string' ? item.title : '',
              status: item.status === 'done' ? 'done' : 'pending',
              createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
              doneAt: typeof item.doneAt === 'number' ? item.doneAt : undefined,
              files: normalizeFiles(item.files),
            }))
        : []
      workspaces[workspaceId] = {
        items,
        autoRun: entry.autoRun === true,
        mode: entry.mode === 'new' ? 'new' : 'same',
        sessionId: typeof entry.sessionId === 'string' && entry.sessionId.length > 0 ? entry.sessionId : null,
        draft: typeof entry.draft === 'string' ? entry.draft.slice(0, MAX_DRAFT_CHARS) : '',
      }
    }
  }
  return { version: DOCUMENT_VERSION, workspaces }
}

let writeChain = Promise.resolve()

async function readDocument() {
  try {
    const text = await readFile(statePath(), 'utf8')
    return normalizeDocument(JSON.parse(text))
  } catch {
    return { version: DOCUMENT_VERSION, workspaces: {} }
  }
}

/** Serialize and atomically replace the document (no torn writes). */
function writeDocument(document) {
  const next = writeChain.then(async () => {
    const target = statePath()
    await mkdir(dirname(target), { recursive: true })
    const staging = `${target}.${process.pid}.tmp`
    await writeFile(staging, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    await rename(staging, target)
    return document
  })
  writeChain = next.catch(() => undefined)
  return next
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function errorBody(code, message) {
  return { error: { code, message } }
}

/** Surface contract for the Host half. */
export const name = 'dsh-todolist'

export const inject = ['connection']

export function apply(ctx) {
  const connection = Reflect.get(ctx, 'connection')
  if (connection === undefined) return

  ctx.effect(
    () =>
      connection.fetch.register({
        path: ROUTE,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async request => {
          try {
            if (request.method === 'GET') {
              return json(await readDocument())
            }
            if (request.method !== 'POST') {
              return json(errorBody('method-not-allowed', 'only GET and POST are supported'), 405)
            }
            const declared = Number(request.headers.get('content-length') ?? '0')
            if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
              return json(errorBody('too-large', 'todo document exceeds the size limit'), 413)
            }
            const payload = await request.json()
            const workspaceId = payload !== null && typeof payload === 'object' ? payload.workspaceId : undefined
            if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
              return json(errorBody('invalid-request', 'workspaceId is required'), 400)
            }
            const current = await readDocument()
            const merged = normalizeDocument({
              workspaces: { ...current.workspaces, [workspaceId]: payload.entry },
            })
            return json(await writeDocument(merged))
          } catch (error) {
            return json(errorBody('internal', String((error && error.message) || error)), 500)
          }
        },
      }),
    'dsh-todolist: state route',
  )
}
