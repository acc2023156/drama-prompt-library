/* 热点与热词：GitHub Actions（hot-sync.yml）定时推上来，网页读取最新一批。
   推送数据来自外部服务，字段缺失或类型不对时给默认值，不整批拒收 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { type AppEnv, type Deps, JSON_TYPE, jobSecretGuard, json, originGuard } from '../lib/http.js';
import { getSnapshot, putSnapshot } from '../lib/store.js';
import { looseObject, readJson } from '../lib/validate.js';

const text = z.string().catch('');
const num = z.coerce.number().catch(0);
const list = z.array(z.unknown()).catch([]);
const clean = (s: string) => s.replace(/^【[^】]*】/, '').trim();

const Topic = looseObject({
  title: text,
  status: z.unknown().optional(),
  redline: z.unknown().optional(),
  cat: text,
  trend: text,
  ai: looseObject({ score: num, stars: num, ideas: list }),
});
const Work = looseObject({ title: text, genre: text, ideas: list });
const HotPush = looseObject({
  generatedAt: text,
  topics: list.transform((xs) => xs.map((x) => Topic.parse(x))),
  daily: looseObject({ works: list.transform((xs) => xs.map((x) => Work.parse(x))) }),
});

const Word = looseObject({
  word: z.unknown().optional().transform((v) => String(v || '').replace(/^#/, '').trim()),
  cat: text,
  heat: num,
  clueCount: num,
  trend: text,
  updatedAt: text,
});
const WordsPush = looseObject({ generatedAt: text, words: list.transform((xs) => xs.map((x) => Word.parse(x))) });

// 一级红线词：命中的热词直接丢弃
const RED = /乱伦|母子|父女|兄妹|姐弟|叔嫂|小姨子|干娘|继母|岳母|萝莉|正太|未成年|学生|校园|高中|初中|迷奸|强奸|偷拍|下药|师生|老师|女学生/;

export function feedRoutes({ cfg, prisma }: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const pushGuard = jobSecretGuard(cfg), readGuard = originGuard(cfg);

  // 热点：只给标题、创作灵感、排名，不带来源与平台
  app.post('/hot/push', pushGuard, async (c) => {
    const d = await readJson(c, HotPush);
    const topics = d.topics
      .filter((t) => t.status === '可改编' && !t.redline)
      .map((t) => ({ t: clean(t.title), cat: t.cat, score: t.ai.score, stars: t.ai.stars, trend: t.trend, ideas: t.ai.ideas.slice(0, 3) }))
      .sort((a, b) => b.score - a.score);
    const works = d.daily.works.map((w) => ({ t: clean(w.title).replace(/\s*第.季$/, ''), genre: w.genre, ideas: w.ideas.slice(0, 3) }));
    await putSnapshot(prisma, 'hot', { at: d.generatedAt, topics, works });
    return json(c, { ok: true, topics: topics.length, works: works.length });
  });

  // 热词：只留词根、分类、热度、走势、更新时间
  app.post('/words/push', pushGuard, async (c) => {
    const d = await readJson(c, WordsPush);
    const words = d.words
      .map((w) => ({ word: w.word, cat: w.cat, heat: w.heat || w.clueCount, trend: w.trend, updatedAt: w.updatedAt || d.generatedAt }))
      .filter((w) => w.word && !RED.test(w.word))
      .sort((a, b) => b.heat - a.heat);
    await putSnapshot(prisma, 'words', { at: d.generatedAt, words });
    return json(c, { ok: true, words: words.length });
  });

  // 存的就是 JSON 文本，原样返回；可缓存 5 分钟
  const latest = (key: 'hot' | 'words') => async (c: Context<AppEnv>) => {
    const v = await getSnapshot(prisma, key);
    if (!v) return json(c, { error: `${key} unavailable` }, 503);
    return c.body(v, 200, { 'Content-Type': JSON_TYPE, 'Cache-Control': 'max-age=300' });
  };
  app.get('/hot', readGuard, latest('hot'));
  app.get('/words', readGuard, latest('words'));

  return app;
}
