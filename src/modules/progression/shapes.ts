import { t } from '../../i18n'
import type { Dream } from '../log/types'
import type { RawRead } from './spine'

// ─── The shapes a dream can have ──────────────────────────────────────────────
// Topical templates never end. There is always a dream with no template, and
// the day a person's dream falls outside the library is the day the app looks
// stupid. So the library is STRUCTURAL: a handful of shapes, and every goal is
// one of them.
//
// A shape carries the act structure, where the pressure sits, and what KIND of
// proof ends each act. It knows nothing about acting or Spanish. The model
// supplies the subject; the shape supplies the skeleton — a far smaller and
// more reliable ask than inventing both.
//
// Two jobs, one definition:
//   • WITH a key — the shape goes into the prompt as the starting point, so the
//     model adapts a skeleton instead of drawing one from nothing.
//   • WITHOUT one — the shape IS the read. You get real acts with real proofs
//     and an empty shelf, which is the honest half: the structure of a goal is
//     general, the routines that serve it are not.

export type Pressure = 'critical' | 'high' | 'medium'

interface Bilingual { en: string; ru: string }

export interface ShapeAct {
  key:      string
  title:    Bilingual
  pressure: Pressure
  /** One line: what finishing this act buys you. */
  intent:   Bilingual
  /** The KIND of datable proof that ends it. Null when an act has no boss. */
  proof:    Bilingual | null
}

export interface DreamShape {
  id:    string
  name:  Bilingual
  /** What kind of goal this is, in one line. Shown when picking, sent when asking. */
  tell:  Bilingual
  /**
   * Words that DECIDE the shape whatever the subject is. "Exam" settles the
   * structure of a goal about a language, a licence or a thesis alike, because
   * the fixed date is what everything else has to bend around.
   */
  decides: string[]
  /** Words that merely suggest it. A subject, not a structure. */
  suggests: string[]
  acts:  ShapeAct[]
  /** What the shelf for this shape should mostly be made of, for the prompt. */
  shelf: string
}

export const SHAPES: DreamShape[] = [
  {
    id: 'practise',
    name: { en: 'A skill you practise', ru: 'Навык, который вы практикуете' },
    tell: { en: 'Reps against a standard, until the standard moves.',
            ru: 'Повторения против планки, пока планка не сдвинется.' },
    decides: ['practice', 'практик'],
    suggests: ['act', 'acting', 'sing', 'guitar', 'piano', 'draw', 'language', 'speak', 'spanish',
               'english', 'chess', 'code', 'write', 'играть', 'петь', 'язык', 'рисовать', 'актёр', 'актер'],
    shelf: 'mostly ROUTINES — daily contact with the craft; one TASK to arrange the room or the standard.',
    acts: [
      { key: 'contact', pressure: 'high',
        title:  { en: 'Daily contact',                ru: 'Ежедневный контакт' },
        intent: { en: 'The skill stops being something you visit.',
                  ru: 'Навык перестаёт быть тем, что вы навещаете.' },
        proof: null },
      { key: 'standard', pressure: 'critical',
        title:  { en: 'A standard to measure against', ru: 'Планка, по которой мерить' },
        intent: { en: 'You find out where you actually are, not where you feel you are.',
                  ru: 'Вы узнаёте, где вы на самом деле, а не где вам кажется.' },
        proof:  { en: 'A recorded attempt, kept and dated',
                  ru: 'Записанная попытка, сохранённая и датированная' } },
      { key: 'weakness', pressure: 'high',
        title:  { en: 'The part you avoid',            ru: 'То, чего вы избегаете' },
        intent: { en: 'The thing you skip becomes the thing you drill.',
                  ru: 'То, что вы пропускаете, становится тем, что вы отрабатываете.' },
        proof: null },
      { key: 'room', pressure: 'high',
        title:  { en: 'In front of someone',           ru: 'Перед кем-то' },
        intent: { en: 'Practice meets a room, which is the only place it counts.',
                  ru: 'Практика встречает зал — единственное место, где она считается.' },
        proof:  { en: 'One performance, class or audition, done and dated',
                  ru: 'Одно выступление, занятие или проба — сделано и датировано' } },
    ],
  },

  {
    id: 'body',
    name: { en: 'A body you build', ru: 'Тело, которое вы строите' },
    tell: { en: 'Load that increases, and the recovery that lets it.',
            ru: 'Нагрузка, которая растёт, и восстановление, которое это позволяет.' },
    decides: [],
    suggests: ['gym', 'lift', 'run', 'marathon', 'strength', 'weight', 'muscle', 'fit', 'swim', 'climb',
               'зал', 'бег', 'сила', 'вес', 'мышц', 'марафон', 'плава', 'подтяг'],
    shelf: 'ROUTINES for the sessions, BASICS for sleep and food — this shape fails on recovery more often than on effort.',
    acts: [
      { key: 'showup', pressure: 'high',
        title:  { en: 'Show up on a schedule',        ru: 'Приходить по расписанию' },
        intent: { en: 'The session stops being a decision you make each time.',
                  ru: 'Тренировка перестаёт быть решением, которое принимают заново.' },
        proof: null },
      { key: 'load', pressure: 'critical',
        title:  { en: 'Load that goes up',            ru: 'Нагрузка, которая растёт' },
        intent: { en: 'Progression rather than repetition — the same session forever builds nothing.',
                  ru: 'Прогрессия, а не повторение: одна и та же тренировка вечно не строит ничего.' },
        proof:  { en: 'A logged lift, time or distance you could not do at the start',
                  ru: 'Записанный вес, время или дистанция, недоступные в начале' } },
      { key: 'recovery', pressure: 'high',
        title:  { en: 'Recovery that holds it up',    ru: 'Восстановление, которое держит' },
        intent: { en: 'Sleep and food stop being the thing that breaks the run.',
                  ru: 'Сон и еда перестают быть тем, что срывает заход.' },
        proof: null },
      { key: 'test', pressure: 'medium',
        title:  { en: 'A measured test',              ru: 'Измеряемая проверка' },
        intent: { en: 'The number comes from outside you, not from a feeling.',
                  ru: 'Число приходит извне, а не из ощущения.' },
        proof:  { en: 'A dated measurement, or an event entered',
                  ru: 'Датированный замер или заявка на событие' } },
    ],
  },

  {
    id: 'ship',
    name: { en: 'A thing you ship', ru: 'Вещь, которую вы выпускаете' },
    tell: { en: 'One artefact, finished and released.',
            ru: 'Один артефакт, законченный и выпущенный.' },
    decides: ['launch', 'publish', 'release', 'ship it', 'выпуст', 'издать'],
    suggests: ['book', 'album', 'film', 'app', 'game', 'portfolio', 'short', 'video', 'build',
               'record', 'книг', 'альбом', 'фильм', 'приложен', 'игру', 'сайт', 'снять'],
    shelf: 'ROUTINES for the making cadence; TASKS for the one-off decisions — scope, cover, submission.',
    acts: [
      { key: 'scope', pressure: 'critical',
        title:  { en: 'Cut it to something finishable', ru: 'Сузить до того, что можно закончить' },
        intent: { en: 'The version that can actually be finished, not the one you would like to have made.',
                  ru: 'Версия, которую реально закончить, а не та, которую хотелось бы сделать.' },
        proof: null },
      { key: 'cadence', pressure: 'high',
        title:  { en: 'A making cadence',              ru: 'Ритм работы' },
        intent: { en: 'It advances on the days you do not feel like it.',
                  ru: 'Оно движется в дни, когда не хочется.' },
        proof: null },
      { key: 'whole', pressure: 'high',
        title:  { en: 'A rough whole',                 ru: 'Черновое целое' },
        intent: { en: 'End to end and ugly beats half of it and polished.',
                  ru: 'Целиком и криво лучше, чем половина и вылизано.' },
        proof:  { en: 'A complete draft, start to finish, dated',
                  ru: 'Полный черновик от начала до конца, с датой' } },
      { key: 'out', pressure: 'high',
        title:  { en: 'Out of your hands',             ru: 'Из ваших рук' },
        intent: { en: 'Released, not almost.',          ru: 'Выпущено, а не почти.' },
        proof:  { en: 'Published, submitted or handed over, with a date',
                  ru: 'Опубликовано, отправлено или передано, с датой' } },
    ],
  },

  {
    id: 'date',
    name: { en: 'A date you sit', ru: 'Дата, которую вы сдаёте' },
    tell: { en: 'A fixed external deadline, worked backwards from.',
            ru: 'Жёсткий внешний срок, от которого считают назад.' },
    decides: ['exam', 'ielts', 'toefl', 'audition', 'certification', 'licence', 'license',
              'defence', 'defense', 'экзамен', 'зачёт', 'зачет', 'собеседован', 'проба', 'защит', 'сертифик'],
    suggests: ['test', 'sat', 'interview'],
    shelf: 'a TASK to register first, then ROUTINES for coverage. Nothing here works without the date.',
    acts: [
      { key: 'booked', pressure: 'critical',
        title:  { en: 'The date, entered',            ru: 'Дата, назначена' },
        intent: { en: 'Everything else counts backwards from it. Without it there is no plan, only intent.',
                  ru: 'Всё остальное считается назад от неё. Без даты нет плана — только намерение.' },
        proof:  { en: 'Registered, booked or entered, with the date',
                  ru: 'Записан, забронирован или заявлен, с датой' } },
      { key: 'surface', pressure: 'high',
        title:  { en: 'The whole surface, mapped',    ru: 'Вся поверхность, размечена' },
        intent: { en: 'You know the parts you dislike, not just the parts you revise.',
                  ru: 'Вы знаете и те части, которые не любите, а не только те, что повторяете.' },
        proof: null },
      { key: 'coverage', pressure: 'high',
        title:  { en: 'Daily contact with the material', ru: 'Ежедневный контакт с материалом' },
        intent: { en: 'Coverage becomes a habit rather than a fortnight of panic.',
                  ru: 'Охват становится привычкой, а не двумя неделями паники.' },
        proof: null },
      { key: 'mock', pressure: 'high',
        title:  { en: 'Under real conditions',        ru: 'В реальных условиях' },
        intent: { en: 'Rehearsed at the real length and the real pressure, before it counts.',
                  ru: 'Прогнано на реальной длине и под реальным давлением, до того как это зачтётся.' },
        proof:  { en: 'One full mock, timed and dated',
                  ru: 'Один полный пробный прогон, по времени и с датой' } },
    ],
  },

  {
    id: 'audience',
    name: { en: 'An audience you grow', ru: 'Аудитория, которую вы растите' },
    tell: { en: 'Output on a cadence, and a loop that tells you what landed.',
            ru: 'Выпуск по ритму и петля, которая говорит, что зашло.' },
    decides: ['audience', 'followers', 'subscribers', 'newsletter', 'аудитор', 'подписчик', 'рассылк'],
    suggests: ['channel', 'blog', 'youtube', 'podcast', 'clients', 'customers', 'канал', 'блог', 'клиент'],
    shelf: 'ROUTINES for making and publishing; one TASK for the place people can stay.',
    acts: [
      { key: 'format', pressure: 'critical',
        title:  { en: 'One format, repeated',         ru: 'Один формат, повторяемый' },
        intent: { en: 'Recognisable enough to come back to. Variety early is how nobody remembers you.',
                  ru: 'Узнаваемо настолько, чтобы вернуться. Разнообразие в начале — способ быть незапомненным.' },
        proof: null },
      { key: 'cadence', pressure: 'high',
        title:  { en: 'A publishing cadence',         ru: 'Ритм публикаций' },
        intent: { en: 'It goes out whether or not it is your best.',
                  ru: 'Оно выходит независимо от того, лучшее это или нет.' },
        proof: null },
      { key: 'loop', pressure: 'high',
        title:  { en: 'Read what landed',             ru: 'Читать, что зашло' },
        intent: { en: 'The loop closes and you stop guessing what works.',
                  ru: 'Петля замыкается, и вы перестаёте гадать, что работает.' },
        proof: null },
      { key: 'home', pressure: 'medium',
        title:  { en: 'Somewhere they can stay',      ru: 'Место, где они могут остаться' },
        intent: { en: 'Attention that does not evaporate when the feed moves on.',
                  ru: 'Внимание, которое не испаряется, когда лента идёт дальше.' },
        proof:  { en: 'A list, channel or feed with real people on it',
                  ru: 'Список, канал или лента с живыми людьми' } },
    ],
  },

  {
    id: 'quit',
    name: { en: 'A habit you end', ru: 'Привычка, от которой вы уходите' },
    tell: { en: 'Subtraction, which behaves nothing like the other five.',
            ru: 'Вычитание, которое ведёт себя иначе, чем остальные пять.' },
    decides: ['quit', 'give up', 'stop ', 'бросить', 'перестать', 'отказаться от'],
    suggests: ['smoking', 'drinking', 'sugar', 'doomscroll', 'porn', 'gambling',
               'курен', 'алкогол', 'сахар', 'залипа'],
    shelf: 'BASICS carry this one — the floor is what holds a subtraction. ROUTINES only for the substitute.',
    acts: [
      { key: 'trigger', pressure: 'critical',
        title:  { en: 'Name the trigger',             ru: 'Назвать триггер' },
        intent: { en: 'You stop fighting the act and start seeing the cue in front of it.',
                  ru: 'Вы перестаёте бороться с действием и начинаете видеть сигнал перед ним.' },
        proof: null },
      { key: 'substitute', pressure: 'high',
        title:  { en: 'A substitute, ready',          ru: 'Замена, наготове' },
        intent: { en: 'The gap gets filled deliberately, or it fills itself.',
                  ru: 'Пустота заполняется намеренно — или заполнится сама.' },
        proof: null },
      { key: 'environment', pressure: 'high',
        title:  { en: 'Change the room, not the will', ru: 'Менять комнату, а не волю' },
        intent: { en: 'Willpower stops being the plan, because it is not one.',
                  ru: 'Сила воли перестаёт быть планом, потому что она им не является.' },
        proof: null },
      { key: 'stretch', pressure: 'medium',
        title:  { en: 'A stretch, counted',           ru: 'Отрезок, посчитанный' },
        intent: { en: 'The number is the evidence, and it is the only one that argues back.',
                  ru: 'Число — это доказательство, и единственное, что спорит в ответ.' },
        proof:  { en: 'A dated stretch you can point at',
                  ru: 'Датированный отрезок, на который можно показать' } },
    ],
  },
]

/**
 * Which shape a dream is. Longest hint wins, so "language exam" reads as a date
 * rather than as a skill.
 *
 * Null is a legitimate answer: a dream that matches nothing gets the model's
 * full attention rather than being forced into the nearest skeleton.
 */
export function matchShape(dream: Pick<Dream, 'title' | 'description'>): DreamShape | null {
  const text = `${dream.title} ${dream.description ?? ''}`.toLowerCase()

  const hit = (words: string[]): string | null => {
    let longest: string | null = null
    for (const w of words) {
      if (!text.includes(w)) continue
      if (!longest || w.length > longest.length) longest = w
    }
    return longest
  }

  // A deciding word beats any number of suggesting ones. "Language exam" is a
  // date, not a skill: the subject is the language, but the SHAPE is the
  // deadline, and it is the shape this library is for.
  let best: { shape: DreamShape; word: string } | null = null
  for (const shape of SHAPES) {
    const w = hit(shape.decides)
    if (w && (!best || w.length > best.word.length)) best = { shape, word: w }
  }
  if (best) return best.shape

  for (const shape of SHAPES) {
    const w = hit(shape.suggests)
    if (w && (!best || w.length > best.word.length)) best = { shape, word: w }
  }
  return best?.shape ?? null
}

export const shapeById = (id: string): DreamShape | null =>
  SHAPES.find(s => s.id === id) ?? null

/**
 * The shape as prompt text — the skeleton the model adapts instead of drawing
 * one from nothing. Smaller ask, smaller answer, and far more reliable.
 */
export function shapeBrief(shape: DreamShape): string {
  const acts = shape.acts.map((a, i) =>
    `  ${i + 1}. ${a.title.en} [${a.pressure}] — ${a.intent.en}`
    + (a.proof ? `\n     proof: ${a.proof.en}` : '\n     proof: none'),
  ).join('\n')
  return [
    `SHAPE OF THIS DREAM: ${shape.name.en.toUpperCase()} — ${shape.tell.en}`,
    'Use these acts as the skeleton. Keep their order, their pressure and the KIND of proof;',
    'rewrite every title and intent so they are about THIS dream specifically, never generic.',
    acts,
    `Shelf: ${shape.shelf}`,
  ].join('\n')
}

/**
 * The shape AS a read, for when there is no key to call anything with.
 *
 * The acts are real and so are the proofs — that structure is general, which is
 * the whole reason shapes work. The shelf is empty on purpose: the routines
 * that serve a goal are specific to it, and inventing generic ones would be
 * filling the screen rather than helping.
 */
export function shapeToRead(shape: DreamShape, dream: Pick<Dream, 'title'>): RawRead {
  return {
    title:    dream.title.slice(0, 24).toUpperCase(),
    category: shape.id,
    verdict:  t(
      `This reads as ${shape.name.en.toLowerCase()}. ${shape.tell.en} The acts below are the shape of that; the routines under them are yours to write, or the guide's when it has a key.`,
      `Это похоже на «${shape.name.ru.toLowerCase()}». ${shape.tell.ru} Акты ниже — форма этого; рутины под ними пишете вы, или гид, когда у него будет ключ.`,
    ),
    acts: shape.acts.map(a => ({
      key:      a.key,
      title:    t(a.title.en, a.title.ru),
      pressure: a.pressure,
      intent:   t(a.intent.en, a.intent.ru),
      boss:     a.proof ? t(a.proof.en, a.proof.ru) : null,
    })),
    shelf: [],
  }
}
