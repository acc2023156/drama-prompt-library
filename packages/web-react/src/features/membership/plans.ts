/** 会员方案（旧 viewMembership 里的 plans）。价格、积分都是展示文案，没有支付接口。 */
export interface Plan {
  name: string
  price: string
  old: string
  points: string
  rate: string
  note: string
  ribbon?: string
  /** 样式后缀：pro / max。 */
  cls?: 'pro' | 'max'
  benefits: string[]
}

export const PLANS: Plan[] = [
  { name: '基础会员', price: '113', old: '188', points: '725', rate: '换算 ¥1 = 19 积分', note: '首季 6.1 折 ¥113，下季续费 ¥188', benefits: ['Seedance 2.0 VIP', '标准生成通道', '生成作品去除品牌水印'] },
  { name: '标准会员', price: '341', old: '568', points: '2210', rate: '换算 ¥1 = 19 积分', note: '首季 6.1 折 ¥341，下季续费 ¥568', benefits: ['Seedance 2.0 VIP', '标准生成通道', '生成作品去除品牌水印'] },
  {
    name: '高级会员',
    price: '1227',
    old: '2798',
    points: '12320',
    rate: '换算 ¥1 = 30 积分',
    note: '首季 4.4 折 ¥1,227，下季续费 ¥2,798',
    ribbon: 'SD 系列 2.5 Flash ¥0.63/秒｜2.5 ¥0.43/秒',
    cls: 'pro',
    benefits: ['Seedance 2.0 VIP', '快速生成通道', '生成作品去除品牌水印'],
  },
  {
    name: '超级会员',
    price: '4999',
    old: '11699',
    points: '54600',
    rate: '换算 ¥1 = 33 积分',
    note: '首季 4.3 折 ¥4,999，下季续费 ¥11,699',
    ribbon: 'SD 系列 2.5 Flash ¥0.58/秒｜2.5 ¥0.24/秒',
    cls: 'max',
    benefits: ['Seedance 2.0 VIP', '快速生成通道', '生成作品去除品牌水印', 'API 服务购买'],
  },
]

/** 对比表的列：Free + 四档会员。 */
export const COMPARE_COLS = ['Free', ...PLANS.map((p) => p.name)]

/** 对比表分组与行 [标签, 五列取值]；取值 ✓ 的单元格带 yes 样式。 */
export const COMPARE_SECTIONS: { title: string; rows: [string, string[]][] }[] = [
  {
    title: '积分',
    rows: [
      ['平台免费积分', ['每日登录免费积分', '每日登录赠送积分', '每日登录赠送积分', '每日登录赠送积分', '每日登录赠送积分']],
      ['充值购买积分', ['✓', '✓', '✓', '✓', '✓']],
      ['订阅会员积分', ['-', '每月 725 积分', '每月 2210 积分', '每月 12320 积分', '每月 54600 积分']],
    ],
  },
  {
    title: '视频生成',
    rows: [
      ['Seedance 2.0 VIP 模型', ['-', '✓', '✓', '✓', '✓']],
      ['视频生成专享加速', ['-', '标准生成通道', '标准生成通道', '快速生成通道', '快速生成通道']],
      ['视频对口型', ['-', '✓', '✓', '✓', '✓']],
      ['视频高清', ['-', '✓', '✓', '✓', '✓']],
      ['视频补帧', ['-', '✓', '✓', '✓', '✓']],
    ],
  },
  { title: '图片生成', rows: [['智能超清', ['-', '4K', '4K', '4K / 8K', '4K / 8K']]] },
  {
    title: '全局能力',
    rows: [
      ['去除品牌水印', ['-', '✓', '✓', '✓', '✓']],
      ['生成加速', ['-', '✓', '✓', '✓', '✓']],
    ],
  },
]

/** 计费周期页签；默认选中带 hot 的“连续包季”。 */
export const BILLING_TABS: { label: string; hint?: string; hot?: boolean }[] = [
  { label: '连续包年', hint: '低至 ¥0.16/秒' },
  { label: '连续包月', hint: '4 折' },
  { label: '连续包季', hint: '限时 4.3 折', hot: true },
  { label: '单月购买' },
]
export const DEFAULT_BILLING_TAB = 2

export const BILLING_LINKS = ['企业采购', '购买积分', '积分详情']

/** 折算月价：每季价格 / 3 四舍五入（同旧页面）。 */
export const monthlyPrice = (price: string): number => Math.round(+price / 3)

/** 无限生成权益的 Seedream 5.0 Flash 天数：高级、超级会员 365 天，其余 180 天。 */
export const flashDays = (p: Plan): string => (p.cls ? '365' : '180')
