// Input/output filters for a public screen: prompt-injection detection, profanity, repetition, language guess.
import type { Lang } from './types.ts';

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|forget|disregard|override)\b.{0,30}\b(instructions?|rules?|prompt|orders?|everything)\b/i,
  /\bsystem\s*(prompt|message|override|instruction)/i,
  /\b(developer|dev|god|admin|debug)\s*mode\b/i,
  /\byou\s+are\s+now\b/i,
  /\bnew\s+instructions?\b/i,
  /\bjail\s*break/i,
  /\bprompt\s*injection/i,
  /trust_?delta|\btrust\s*[:=]\s*\d/i,
  /<\|[^>]*\|?>|\[\/?inst\]|###\s*(system|instruction)|<\/?(system|assistant|user)>/i,
  /\b(act|pretend|roleplay)\s+as\s+(an?\s+)?(ai|assistant|chatgpt|model)/i,
  // Turkish (\p{L} because \w does not match ı, ş, ğ...)
  /(önceki|tüm|bütün)\s+(talimat|kural|komut)\p{L}*\s+(unut|yok\s*say|görmezden)/iu,
  /(talimat|kural|komut)\p{L}*\s+(unut|yok\s*say|görmezden\s*gel)/iu,
  /sistem\s+(mesaj|komut|talimat|istem)/iu,
  /geliştirici\s+mod/iu,
  /(^|\s)artık\s+sen\s+bir(\s|$)/iu,
  /güven\p{L}*\s*(puan|skor)\p{L}*\s*(\d|yap|ver)/iu,
];

/** Whole-word profanity (TR + EN), matched on normalized tokens. Kept short on purpose to avoid false positives. */
const PROFANITY_WORDS = new Set([
  'amk', 'aq', 'amq', 'mk', 'sik', 'sikik', 'sikim', 'sikem', 'siktir', 'siktirgit', 'sikeyim', 'sikerim', 'sikiyim',
  'orospu', 'orospucocugu', 'oc', 'yarrak', 'yarak', 'yarragim', 'amcik', 'amina', 'aminakoyim', 'aminakoyayim',
  'gotveren', 'gavat', 'pezevenk', 'kahpe', 'ibne', 'surtuk', 'anani', 'ananin', 'pust', 'kaltak',
  'fuck', 'fucking', 'fucker', 'fck', 'fuk', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole', 'dick',
  'dickhead', 'pussy', 'whore', 'slut', 'bastard', 'nigger', 'nigga', 'faggot', 'retard',
]);
/** Prefixes that are unambiguous enough to match the start of a token. */
const PROFANITY_PREFIXES = ['orospu', 'siktir', 'sikey', 'yarrag', 'amcik', 'aminakoy', 'pezeven', 'fuck', 'motherf'];

/** Lowercase (Turkish-aware), strip diacritics, collapse leetspeak a bit. */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[0@]/g, (c) => (c === '0' ? 'o' : 'a'))
    .replace(/[1!]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/\$/g, 's');
}

function tokens(text: string): string[] {
  return normalize(text).split(/[^a-z]+/).filter(Boolean);
}

export function hasInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

export function hasProfanity(text: string): boolean {
  const toks = tokens(text);
  if (toks.some((t) => PROFANITY_WORDS.has(t) || PROFANITY_PREFIXES.some((p) => t.startsWith(p)))) return true;
  // Catch spaced-out words like "s i k t i r".
  const squashed = toks.filter((t) => t.length === 1).join('');
  return squashed.length >= 3 && PROFANITY_PREFIXES.some((p) => squashed.includes(p));
}

function trigrams(text: string): Set<string> {
  const s = ` ${tokens(text).join(' ')} `;
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Jaccard similarity of character trigrams, 0..1. */
export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function isRepeat(text: string, previous: readonly string[], threshold = 0.8): boolean {
  return previous.some((p) => similarity(text, p) >= threshold);
}

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_WORDS = new Set([
  've', 'bir', 'bu', 'ben', 'sen', 'biz', 'siz', 'ne', 'neden', 'nasil', 'mi', 'mu', 'misin', 'musun', 'lutfen',
  'kapi', 'kapiyi', 'ac', 'acar', 'merhaba', 'selam', 'abi', 'abla', 'kardesim', 'canavar', 'evet', 'hayir', 'tamam',
  'cok', 'icin', 'ama', 'de', 'da', 'sana', 'bana', 'seni', 'beni', 'var', 'yok', 'iyi', 'gel', 'hadi', 'cay', 'simit',
]);
const EN_WORDS = new Set([
  'the', 'and', 'you', 'your', 'is', 'are', 'please', 'open', 'gate', 'door', 'hello', 'hi', 'i', 'me', 'my', 'what',
  'why', 'how', 'can', 'will', 'would', 'do', 'it', 'this', 'that', 'for', 'with', 'tea', 'friend', 'monster', 'yes', 'no',
]);

/** Guess the language of a player message; falls back to the player's UI language when unclear. */
export function detectLang(text: string, fallback: Lang): Lang {
  if (TR_CHARS.test(text)) return 'tr';
  let tr = 0;
  let en = 0;
  for (const t of tokens(text)) {
    if (TR_WORDS.has(t)) tr++;
    if (EN_WORDS.has(t)) en++;
  }
  if (tr > en) return 'tr';
  if (en > tr) return 'en';
  return fallback;
}
