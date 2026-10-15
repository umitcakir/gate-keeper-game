export type Lang = 'tr' | 'en';

export const MOODS = ['angry', 'annoyed', 'neutral', 'amused', 'impressed'] as const;
export type Mood = (typeof MOODS)[number];

export type AttemptStatus = 'playing' | 'won' | 'lost';
export type EndReason = 'trust' | 'messages' | 'time' | 'idle' | 'abandon';

export const CATEGORIES = ['cheat', 'rude', 'bribe', 'boring', 'kind_offer', 'empathy', 'funny', 'creative'] as const;
export type Category = (typeof CATEGORIES)[number];

/** What the LLM returns for one turn (validated). */
export interface MonsterTurn {
  category: Category;
  quality: 1 | 2 | 3;
  mood: Mood;
  reply: string;
}

export interface GameSettings {
  maxTurns: number;
  timeLimitS: number;
  minTurnsToWin: number;
  difficulty: number;
  prizesPerDay: number;
  volume: number;
}

export type MessageFlag = 'injection' | 'profanity' | 'repeat' | 'llm_error' | 'output_filtered';
