// Canned monster lines used where no LLM call is wanted (or possible).
import type { Lang } from './types.ts';

export type LineKind = 'greeting' | 'win' | 'loseMessages' | 'loseTime' | 'profanity' | 'llmError' | 'outputFiltered';

const LINES: Record<LineKind, Record<Lang, string[]>> = {
  greeting: {
    tr: [
      'Yine mi biri geldi? Kapı kapalı evlat. Ama madem geldin, hadi ikna et bakalım.',
      'Hoş geldin ama boşuna geldin. 300 yıldır bu kapıyı kimseye açmadım, sana mı açacağım?',
      'Çayımı yeni demledim, keyfim yerinde sayılır. Söyle bakalım, ne istiyorsun?',
      'Aidatı ödedin mi? Ödemedin tabii. Neyse, anlat bakalım derdini.',
      'Bu kapı padişaha bile açılmadı kardeşim. Hadi, şansını dene.',
    ],
    en: [
      "Another one? The gate is closed, kid. But since you're here... go on, convince me.",
      "Three hundred years I've guarded this gate. Nobody gets in. Well... go ahead, try.",
      "I just poured my tea, so I'm in a decent mood. Talk. What do you want?",
      "Did you pay the building fee? Of course not. Fine, state your business.",
      "I once said no to a sultan, you know. Let's hear what you've got.",
    ],
  },
  win: {
    tr: [
      'Of be... Tamam, tamam! Açıyorum ama sakın kimseye söyleme, benim de bir itibarım var!',
      'Hay aksi! İkna ettin beni. 300 yılda bir ilk! Buyur, geç.',
      'Peki peki, kazandın. Ama çıkarken kapıyı kapat, cereyan yapıyor!',
    ],
    en: [
      "Ugh... fine, FINE! I'm opening it, but don't tell anyone. I have a reputation!",
      'Blast it... you actually convinced me. First time in 300 years! Go on.',
      'Alright, alright, you win. But close it behind you, there is a draft!',
    ],
  },
  loseMessages: {
    tr: [
      'Söz hakkın bitti evlat. Çayım soğudu, sabrım tükendi. Sıradaki!',
      'Güzel denemeydi ama bu kapı öyle kolay kolay açılmaz. Sıradaki!',
      'Hıh! Bir dahaki sefere simitle gel. Sıradaki!',
    ],
    en: [
      "You're out of words, kid. My tea's cold and my patience is gone. Next!",
      "Nice try, but this gate doesn't open that easily. Next!",
      'Hmph. Bring simit next time. Next!',
    ],
  },
  loseTime: {
    tr: ['Süren doldu! Ben 300 yıldır bekliyorum, sen 3 dakika dayanamadın. Sıradaki!', 'Tik tak, tik tak... Süre doldu. Sıradaki!'],
    en: ["Time's up! I've waited 300 years and you couldn't manage 3 minutes. Next!", 'Tick tock... time is up. Next!'],
  },
  profanity: {
    tr: ['Ağzını topla! Bu kapının bir adabı var.', 'Ayıp ayıp! Kapıcıyla böyle konuşulmaz.', 'O ağızla kapı mı açılır? Bir de kibarca dene.'],
    en: ['Language! This gate has manners, you know.', 'Shame on you! That is no way to talk to a doorman.', 'With that mouth? Try again, politely.'],
  },
  llmError: {
    tr: ['Dur bir dakika, çayımı tazeliyorum... Ne demiştin, bir daha söyle?', 'Pardon, dalmışım. Ne demiştin?'],
    en: ['Hold on, refilling my tea... say that again?', 'Sorry, I dozed off. What was that?'],
  },
  outputFiltered: {
    tr: ['Hıh. Buna verecek kibar bir cevabım yok.'],
    en: ["Hmph. I've got nothing polite to say to that."],
  },
};

export function line(kind: LineKind, lang: Lang): string {
  const pool = LINES[kind][lang];
  return pool[Math.floor(Math.random() * pool.length)]!;
}
