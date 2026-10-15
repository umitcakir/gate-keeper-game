// Thin typed client for the game API.
export type Lang = 'tr' | 'en';
export type Mood = 'angry' | 'annoyed' | 'neutral' | 'amused' | 'impressed';
export type Status = 'playing' | 'won' | 'lost';

export interface Limits { maxTurns: number; timeLimitMs: number; maxChars: number }
export interface RegisterResult { attemptId: string; greeting: string; limits: Limits }
export interface AttemptResult {
  turns: number;
  activeMs: number;
  trust: number;
  rank: number | null;
  prize: 'eligible' | 'out_of_stock' | 'already_claimed' | 'none';
}
export interface MessageResult {
  reply: string;
  mood: Mood;
  trust: number;
  delta: number;
  turn: number;
  messagesLeft: number;
  timeLeftMs: number;
  status: Status;
  finale?: string;
  notCounted?: boolean;
  result?: AttemptResult;
}
export interface LeaderEntry { id: string; name: string; turns: number; activeMs: number; trust: number }
export interface Leaderboard { winners: LeaderEntry[]; closest: LeaderEntry[] }
export interface Status_ { llmOk: boolean; prizesRemaining: number; volume: number }

export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error ?? `HTTP ${status}`));
    this.status = status;
    this.body = body;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, typeof data === 'object' ? data : { error: data });
  return data as T;
}

export const api = {
  status: () => call<Status_>('GET', '/api/status'),
  leaderboard: () => call<Leaderboard>('GET', '/api/leaderboard'),
  kvkk: (lang: Lang) => call<string>('GET', `/api/kvkk/${lang}`),
  register: (body: {
    firstName: string; lastName: string; email: string; phone: string; lang: Lang; kvkkConsent: boolean;
  }) => call<RegisterResult>('POST', '/api/register', body),
  message: (id: string, text: string) => call<MessageResult>('POST', `/api/attempt/${id}/message`, { text }),
  end: (id: string, reason: 'time' | 'idle' | 'abandon') =>
    call<{ status: 'lost'; finale?: string; result: AttemptResult }>('POST', `/api/attempt/${id}/end`, { reason }),
  claim: (id: string, pin: string, give: boolean) =>
    call<{ claimed: boolean; prizesRemaining: number }>('POST', `/api/attempt/${id}/claim`, { pin, give }),
};
