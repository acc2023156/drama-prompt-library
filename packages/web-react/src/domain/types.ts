/** 领域层共享类型。领域函数都是纯函数：不碰 DOM、localStorage、全局变量。 */

export type WzMode = 'auto' | 'paste' | 'novel'

export interface DupHit {
  title: string
  pitch?: string
  sim: number
  same: boolean
}

export interface DupResult {
  n: number
  hits: DupHit[]
}

/** 作品设定（旧页面 WZ_DEF 的形状）及作品卡 / 表单追加的可选字段。 */
export interface WzSettings {
  mode: WzMode
  doc: string
  novel: string
  title: string
  aud: string
  pair: string
  genre: string
  pitch: string
  hooks: string[]
  lang: string
  glyph: string
  eps: number | '自定义'
  epsCustom: string
  mins: number | '自定义'
  minsCustom: string
  wpm: number
  sequel: boolean
  ai: string
  core: string
  diff: string
  hero: string
  rival: string
  world: string
  adult: boolean
  dup: DupResult | null
  id?: string
  guessed?: unknown
  style?: string
  ratio?: string
  depth?: string
  heat?: string
  qxRole?: string
  qxMode?: string
}

export interface Entry {
  id: string
  title: string
  license: string
  status?: string
  folder: string
  body: string
  [k: string]: unknown
}

/** 提示词库取值：按条目编号取代码块正文（旧页面里是读全局 byId 的 lib()）。 */
export type Lib = (id: string) => string

export interface SxTemplate {
  type: string
  surface: string
  hidden: string
  gold: string
  hook: string
  rel: string
  genres: string
  note: string
}

export type Gender = 'male' | 'female'

export interface SxState {
  id: string
  g: Gender
  role: SxTemplate
  name: string
  title: string
  idea: string
  outline: [string, string][]
  seed?: number
  [k: string]: unknown
}

export interface CastMember {
  name: string
  role: string
  bio?: string
  look?: string
  [k: string]: unknown
}

export interface OutlineItem {
  title: string
  event?: string
  hook?: string
  body?: string
}

export interface CardCast {
  name: string
  role: string
  age?: number | string
  look?: string
  want?: string
  flaw?: string
  voice?: string
}

export interface Card {
  mystery?: string
  rules?: { power?: string; stakes?: string; spaces?: string; evidence?: string; limit?: string; address?: string }
  cast?: CardCast[]
  title?: string
  logline?: string
}

export interface ScenePlanItem {
  time: string
  place: string
  io: string
  people?: string[]
  card?: string
  beat: string
}

export interface GenData {
  title: string
  logline: string
  outline: OutlineItem[]
  eps: (string | null | undefined)[]
  card?: Card | null
  fixed?: number[]
  cast: CastMember[]
  part?: Record<number, { plan?: ScenePlanItem[]; parts?: string[]; fixed?: number }>
}

export interface Gen {
  engine?: string
  status?: string
  at?: number
  req?: unknown
  data?: GenData | null
  err?: string | null
  note?: string | null
  card?: Card | null
  [k: string]: unknown
}

export interface ListingData {
  titles: { t: string; kw?: string }[]
  oneLine: string
  intro: string
  tags: { evergreen: string[]; timely: string[] }
  keywords: { short: string[]; long: string[] }
}

export interface Listing {
  at?: number
  wordsAt?: string
  data: ListingData
}

export interface Work {
  id: string
  title: string
  kind?: 'simple' | 'vibe'
  W: Partial<WzSettings>
  time?: number
  trashed?: number
  sx?: SxState
  vname?: string
  vname2?: string
  seed?: number
  gen?: Gen | null
  listing?: Listing
  [k: string]: unknown
}

/** 随机数源，取值 [0, 1)；默认 Math.random，测试里换成固定序列。 */
export type Rng = () => number
