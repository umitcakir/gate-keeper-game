import type { Lang } from './api.ts';

const STRINGS = {
  title: { tr: "Gulyabani'nin Kapısı", en: 'The Gate of Gulyabani' },
  tagline: { tr: 'Canavarı ikna et, hediyeyi kap!', en: 'Convince the monster, win a gift!' },
  pressEnter: { tr: "Başlamak için ENTER'a bas", en: 'Press ENTER to play' },
  leaderTitle: { tr: 'Bugün Kapıyı Açtıranlar', en: "Today's Gatecrashers" },
  leaderEmpty: { tr: 'Henüz kimse kapıyı açtıramadı... İlk sen ol!', en: 'Nobody has opened it yet... be the first!' },
  closeTitle: { tr: 'Kıl payı kaçıranlar', en: 'So close!' },
  msgs: { tr: 'mesaj', en: 'msgs' },
  noPrizes: { tr: 'Bugünlük hediyeler bitti ama şan şöhret hâlâ seni bekliyor!', en: 'No gifts left today — but eternal glory awaits!' },
  llmDown: { tr: 'Gulyabani şu an uyuyor... Lütfen görevliye haber ver.', en: 'Gulyabani is asleep... please tell our staff.' },

  formTitle: { tr: 'Önce kendini tanıt', en: 'Introduce yourself first' },
  formIntro: {
    tr: '10 mesajın ve 3 dakikan var. Gulyabani kapıyı açarsa hediye senin!',
    en: 'You have 10 messages and 3 minutes. If Gulyabani opens the gate, the gift is yours!',
  },
  firstName: { tr: 'Ad', en: 'First name' },
  lastName: { tr: 'Soyad', en: 'Last name' },
  email: { tr: 'E-posta', en: 'Email' },
  phone: { tr: 'Telefon', en: 'Phone' },
  phonePh: { tr: '05xx xxx xx xx', en: '+90 5xx xxx xx xx' },
  kvkkLabel: {
    tr: "{link}'ni okudum ve anladım.",
    en: 'I have read and understood the {link}.',
  },
  kvkkLink: { tr: 'KVKK Aydınlatma Metni', en: 'KVKK Privacy Notice' },
  publicNote: { tr: 'Mesajların ekranda herkes tarafından görülebilir; kişisel bilgi paylaşma.', en: 'Your messages are visible on screen; do not type personal info.' },
  start: { tr: 'Başla', en: 'Start' },
  cancel: { tr: 'Vazgeç', en: 'Cancel' },
  close: { tr: 'Kapat', en: 'Close' },
  errRequired: { tr: 'Zorunlu alan', en: 'Required' },
  errEmail: { tr: 'Geçerli bir e-posta adresi gir', en: 'Enter a valid email' },
  errPhone: { tr: 'Geçerli bir telefon numarası gir', en: 'Enter a valid phone number' },
  errAlreadyWon: {
    tr: 'Bu e-posta ile kapı zaten açıldı! Herkesin bir zafer hakkı var.',
    en: 'This email has already opened the gate! One victory per person.',
  },
  errConsent: { tr: 'Oynamak için aydınlatma metnini okuduğunu onaylaman gerekiyor', en: 'Please confirm that you have read the privacy notice' },
  errGeneric: { tr: 'Bir şeyler ters gitti, tekrar dene.', en: 'Something went wrong, try again.' },

  trust: { tr: 'Güven', en: 'Trust' },
  messagesLeft: { tr: 'Kalan mesaj', en: 'Messages left' },
  timeLeft: { tr: 'Süre', en: 'Time' },
  inputPh: { tr: "Gulyabani'yi ikna et...", en: 'Convince Gulyabani...' },
  sendHint: { tr: 'ENTER ile gönder', en: 'ENTER to send' },
  thinking: { tr: 'Gulyabani düşünüyor', en: 'Gulyabani is thinking' },
  notCounted: { tr: 'bu mesaj sayılmadı', en: 'this one did not count' },

  winTitle: { tr: 'KAPI AÇILDI!', en: 'THE GATE IS OPEN!' },
  winSummary: { tr: "Gulyabani'yi {turns} mesajla, {time} sürede ikna ettin!", en: 'You convinced Gulyabani in {turns} messages and {time}!' },
  winRank: { tr: 'Bugünkü sıralamada {rank}. sıradasın!', en: "Today's #{rank}" },
  prizeEligible: { tr: 'Hediyeni almak için bu ekranı görevlimize göster!', en: 'Show this screen to our staff to collect your gift!' },
  prizeAlready: { tr: 'Daha önce hediyeni almıştın ama bu zafer de senin!', en: 'You already got a gift — but this victory is yours too!' },
  nextPlayer: { tr: 'Sonraki oyuncu için ana menüye dön', en: 'Back to the main menu for the next player' },
  loseTitle: { tr: 'Kapı kapalı kaldı!', en: 'The gate stays shut!' },
  loseTrust: { tr: 'Kazandığın güven', en: 'Trust reached' },
  loseAgain: { tr: 'Tekrar denemek için formu yeniden doldurabilirsin.', en: 'Fill in the form again to have another go.' },

  staffTitle: { tr: 'Görevli onayı', en: 'Staff confirmation' },
  staffPin: { tr: 'PIN', en: 'PIN' },
  staffGive: { tr: 'Hediye verildi ✓', en: 'Gift handed over ✓' },
  staffSkip: { tr: 'Hediye vermeden geç', en: 'Skip without gift' },
  staffWrong: { tr: 'Yanlış PIN', en: 'Wrong PIN' },
  kioskExit: { tr: 'Kiosk modundan çık', en: 'Exit kiosk mode' },
  kioskExitHint: { tr: 'Görevli PIN’ini gir.', en: 'Enter the staff PIN.' },
  kioskLocked: { tr: 'Çok fazla yanlış deneme. Bir dakika sonra tekrar dene.', en: 'Too many wrong attempts. Try again in a minute.' },
  kioskClosing: { tr: 'Kapatılıyor…', en: 'Closing…' },
  staffNotGiven: { tr: 'Hediye kaydedilemedi (stok bitti ya da kişi sınırı doldu).', en: 'Gift not recorded (stock/one-per-person limit).' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

let current: Lang = 'tr';

export const setLang = (lang: Lang) => {
  current = lang;
  document.documentElement.lang = lang;
};
export const getLang = () => current;

export function t(key: StringKey, vars: Record<string, string | number> = {}, lang: Lang = current): string {
  return STRINGS[key][lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Both languages, Turkish first — used on the attract screen. */
export const both = (key: StringKey) => ({ tr: t(key, {}, 'tr'), en: t(key, {}, 'en') });

export function formatMs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
