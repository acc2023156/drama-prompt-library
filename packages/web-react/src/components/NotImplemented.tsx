import { Icon } from './Icon'

/** 功能占位页：P1-A 先把全部路由建好，各任务包实现时替换自己 feature 目录里的占位组件。 */
export function NotImplemented({ title, pkg }: { title: string; pkg: string }) {
  return (
    <section className="soon" data-placeholder={pkg}>
      <div className="big">
        <Icon name="info" />
      </div>
      <h1>{title}</h1>
      <p>React 版这个页面还没有实现（任务包 {pkg}）。</p>
    </section>
  )
}
