// ─── A.R.D.O — Articulation warm-up content ───────────────────────────────────
// Before drilling a text into memory, an actor warms up the speech apparatus.
// Tongue twisters are LANGUAGE-SPECIFIC (Russian скороговорки ≠ English ones),
// so we keep separate pools and suggest by the text's language.

import type { Language } from './types'

export interface Twister {
  id:    string
  lang:  'RU' | 'EN'
  text:  string
  focus: string     // the sounds it drills
  level: 1 | 2 | 3  // 1 easy → 3 brutal
}

export interface Exercise {
  name:          string
  nameRu:        string
  instruction:   string
  instructionRu: string
  seconds:       number
}

// ─── Tongue twisters ──────────────────────────────────────────────────────────
const RU_TWISTERS: Twister[] = [
  { id: 'ru-karl',   lang: 'RU', text: 'Карл у Клары украл кораллы, а Клара у Карла украла кларнет.', focus: 'к · л · р', level: 2 },
  { id: 'ru-sasha',  lang: 'RU', text: 'Шла Саша по шоссе и сосала сушку.', focus: 'с · ш', level: 1 },
  { id: 'ru-trava',  lang: 'RU', text: 'На дворе трава, на траве дрова.', focus: 'тр · др · в', level: 1 },
  { id: 'ru-greka',  lang: 'RU', text: 'Ехал Грека через реку, видит Грека — в реке рак.', focus: 'г · р · к', level: 2 },
  { id: 'ru-korabli',lang: 'RU', text: 'Корабли лавировали, лавировали, да не вылавировали.', focus: 'л · р · в', level: 3 },
  { id: 'ru-topot',  lang: 'RU', text: 'От топота копыт пыль по полю летит.', focus: 'п · т', level: 2 },
  { id: 'ru-chert',  lang: 'RU', text: 'Четыре чёрненьких чумазеньких чертёнка чертили чёрными чернилами чертёж.', focus: 'ч · чёрн', level: 3 },
  { id: 'ru-byk',    lang: 'RU', text: 'Бык тупогуб, тупогубенький бычок.', focus: 'б · г · п', level: 2 },
  { id: 'ru-kupi',   lang: 'RU', text: 'Купи кипу пик.', focus: 'к · п', level: 1 },
  { id: 'ru-drob',   lang: 'RU', text: 'Дробью по перепелам да по тетеревам.', focus: 'др · п · т', level: 2 },
]

const EN_TWISTERS: Twister[] = [
  { id: 'en-shells', lang: 'EN', text: 'She sells seashells by the seashore.', focus: 's · sh', level: 1 },
  { id: 'en-peter',  lang: 'EN', text: 'Peter Piper picked a peck of pickled peppers.', focus: 'p', level: 2 },
  { id: 'en-lorry',  lang: 'EN', text: 'Red lorry, yellow lorry. Red lorry, yellow lorry.', focus: 'r · l', level: 3 },
  { id: 'en-wood',   lang: 'EN', text: 'How much wood would a woodchuck chuck if a woodchuck could chuck wood?', focus: 'w · ch', level: 2 },
  { id: 'en-betty',  lang: 'EN', text: "Betty Botter bought some butter, but she said the butter's bitter.", focus: 'b · t', level: 2 },
  { id: 'en-copper', lang: 'EN', text: 'A proper copper coffee pot.', focus: 'p · k', level: 1 },
  { id: 'en-throws', lang: 'EN', text: 'Three free throws. Three free throws.', focus: 'th · r', level: 2 },
  { id: 'en-fish',   lang: 'EN', text: 'Fresh fried fish, fish fresh fried.', focus: 'f · sh', level: 2 },
  { id: 'en-york',   lang: 'EN', text: 'Unique New York, unique New York.', focus: 'n · y · k', level: 3 },
  { id: 'en-sheikh', lang: 'EN', text: "The sixth sick sheikh's sixth sheep's sick.", focus: 's · th (brutal)', level: 3 },
]

/** Tongue twisters for a language. Russian texts get скороговорки; everything
 *  else falls back to the English pool (which is also a solid general warm-up). */
export function suggestTwisters(lang: Language, n = 6): Twister[] {
  const pool = lang === 'RU' ? RU_TWISTERS : EN_TWISTERS
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, shuffled.length))
}

/** Which warm-up language we actually drill for a text's language. */
export function warmupLang(lang: Language): 'RU' | 'EN' {
  return lang === 'RU' ? 'RU' : 'EN'
}

// ─── Articulation exercises (language-neutral, do them first) ──────────────────
// The Russian is written the way a speech coach would say it, not word-for-word:
// the vowel siren drills the Russian vowel row А–Э–И–О–У rather than a
// transliterated A–E–I–O–U, because those are the shapes a Russian mouth makes.
export const EXERCISES: Exercise[] = [
  { name: 'Lip trills',      nameRu: 'Вибрация губ',
    instruction:   'Blow air through loosely closed lips — a steady “brrrr”. Relaxes the lips and breath.',
    instructionRu: 'Продувайте воздух через расслабленно сомкнутые губы — ровное «бррр». Снимает зажим с губ и дыхания.',
    seconds: 15 },
  { name: 'Tongue reaches',  nameRu: 'Растяжка языка',
    instruction:   'Tongue out — reach for your nose, then your chin, then each corner. Slow and full.',
    instructionRu: 'Высуньте язык — тянитесь к носу, потом к подбородку, потом в каждый уголок рта. Медленно и до предела.',
    seconds: 20 },
  { name: 'Jaw circles',     nameRu: 'Круги челюстью',
    instruction:   'Drop the jaw open and circle it slowly — five one way, five the other. Unclench.',
    instructionRu: 'Опустите челюсть и медленно вращайте — пять кругов в одну сторону, пять в другую. Разожмите зажим.',
    seconds: 20 },
  { name: 'Cheek puffs',     nameRu: 'Надувание щёк',
    instruction:   'Puff both cheeks full, hold, then roll the air left ↔ right. Wakes the face.',
    instructionRu: 'Надуйте обе щёки, задержите, затем перекатывайте воздух слева ↔ направо. Будит лицо.',
    seconds: 15 },
  { name: 'Vowel sirens',    nameRu: 'Сирена на гласных',
    instruction:   'One breath, glide A–E–I–O–U, exaggerating each mouth shape to the max.',
    instructionRu: 'На одном выдохе тяните А–Э–И–О–У, доводя каждую артикуляцию до предела.',
    seconds: 20 },
  { name: 'Pa-ta-ka ladder', nameRu: 'Лесенка «па-та-ка»',
    instruction:   'Crisp and even: “pa-ta-ka, pa-ta-ka” — a little faster each round without slurring.',
    instructionRu: 'Чётко и ровно: «па-та-ка, па-та-ка» — с каждым кругом чуть быстрее, не смазывая.',
    seconds: 20 },
]

// ─── The wine-cork drill ──────────────────────────────────────────────────────
export const CORK_DRILL =
  'Place a wine cork (or a clean pen cap) between your front teeth and read the line aloud, ' +
  'over-articulating every sound. Then take it out and say the same line — your speech will ' +
  'feel instantly clearer and more precise.'

export const CORK_DRILL_RU =
  'Зажмите винную пробку (или чистый колпачок ручки) между передними зубами и прочитайте строку вслух, ' +
  'утрируя каждый звук. Потом выньте её и произнесите ту же строку — речь сразу станет чище и точнее.'
