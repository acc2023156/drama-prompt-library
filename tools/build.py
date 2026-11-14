"""从模块目录组装提示词。

  python tools/build.py all [-o 输出.md]
      合并回《外部提示词汇总》单文件（与拆分前逐字一致，可直接发给团队）。

  python tools/build.py video [--style 末日废土写实] [--option 成人内容] [-o 输出.txt]
      组装 6.0 视频专用提示词正文（只含代码框里那段，可直接复制给 AI）。
      换项目时在 06-video/styles/ 新建一个风格文件，用 --style 指定。
      可选条款放在 06-video/core/options/，默认关闭，用 --option 逐个打开。

  python tools/build.py patches
      列出能补进 6.0 各部分的条目。
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / "06-video" / "core"
STYLES = ROOT / "06-video" / "styles"


def read(p):
    return Path(p).read_text(encoding="utf-8")


def split_front(text):
    if text.startswith("---\n"):
        end = text.index("\n---\n", 4)
        fm = {}
        for ln in text[4:end].split("\n"):
            k, v = ln.split(": ", 1)
            fm[k] = json.loads(v)
        return fm, text[end + 5:]
    return {}, text


OPTIONS = CORE / "options"
OPT_RE = re.compile(r"^\{\{OPT:([^}]+)\}\}\n?", re.M)


def all_options():
    return sorted(p.stem for p in OPTIONS.glob("*.md"))


def core_prompt(style, options=()):
    """options：要打开的可选条款（06-video/core/options/ 下的文件名）。没打开的整行去掉。"""
    style_path = STYLES / f"{style}.md"
    if not style_path.exists():
        names = ", ".join(p.stem for p in STYLES.glob("*.md") if not re.match(r"\d", p.stem))
        sys.exit(f"找不到风格文件 {style_path.name}，可选：{names}")
    unknown = set(options) - set(all_options())
    if unknown:
        sys.exit(f"找不到可选条款 {'、'.join(unknown)}，可选：{'、'.join(all_options())}")
    order = json.loads(read(CORE / "parts" / "order.json"))
    text = "\n".join(read(CORE / "parts" / n) for n in order)

    def sub(m):
        name = m.group(1)
        if name in options:
            return read(OPTIONS / f"{name}.md") + ("\n" if m.group(0).endswith("\n") else "")
        return ""

    return OPT_RE.sub(sub, text).replace("{{STYLE}}", read(style_path))


def build_all(style):
    manifest = json.loads(read(ROOT / "_meta" / "manifest.json"))
    out = [read(ROOT / "CHANGELOG.md"), read(ROOT / "_meta" / "usage.md")]

    toc = ["## 目录", ""]
    for item in manifest:
        if item["kind"] == "chapter":
            if len(toc) > 2:
                toc.append("")
            toc.append(item["toc_title"])
        elif item["kind"] == "entry":
            if "toc" in item:
                line = item["toc"]
            else:
                _, body = split_front(read(ROOT / item["path"]))
                line = body.split("\n", 1)[0][3:].split(" ", 1)[1]
            toc.append(f"- {item['id']} {line}")
    toc += [""] + read(ROOT / "_meta" / "toc-appendix.md").split("\n")
    out.append("\n".join(toc))

    for item in manifest:
        if item["kind"] == "chapter" or item["kind"] == "appendix":
            out.append(read(ROOT / item["path"]))
        else:
            _, body = split_front(read(ROOT / item["path"]))
            if item["id"] == "6.0":
                # 汇总文档保留全部条款，与原文一致
                body = body.replace("{{CORE_PROMPT}}", core_prompt(style, all_options()))
            out.append(body)
    return "\n".join(out)


def list_patches():
    rows = {}
    for p in sorted(ROOT.glob("**/*.md")):
        fm, _ = split_front(read(p))
        for sec in fm.get("patches", []):
            rows.setdefault(sec, []).append(f"{fm['id']} {fm['title']}  ({p.relative_to(ROOT).as_posix()})")
    for sec in "一二三四五六七":
        if sec in rows:
            print(f"【{sec}】")
            for r in sorted(rows[sec], key=lambda s: [int(x) for x in s.split()[0].split(".")]):
                print("  " + r)


FOLDERS = [
    ("01-outline", "一、立项与大纲"),
    ("02-adaptation", "二、小说转剧本"),
    ("03-revision/dialogue", "三、精修 · 对白与台词"),
    ("03-revision/de-ai", "三、精修 · 去 AI 味 / 反套路"),
    ("03-revision/trim", "三、精修 · 删减"),
    ("03-revision/review", "三、精修 · 审核与检查"),
    ("03-revision/shootability", "三、精修 · 可拍性 / OS·VO"),
    ("03-revision/craft", "三、精修 · 其他手法"),
    ("06-video/core", "六、视频 · 6.0 主模板（生产在用）"),
    ("06-video/patches", "六、视频 · 6.0 补丁（标明补哪一部分）"),
    ("06-video/styles", "六、视频 · 画风块"),
    ("06-video/reference", "六、视频 · 参考与示例"),
    ("07-compliance", "七、合规"),
    ("archive/04-storyboard", "归档 · 四、分镜（10/30 实测后基本不用）"),
    ("archive/05-design", "归档 · 五、角色与场景设定（已由画布素材替代）"),
]


def build_index():
    usage = read(ROOT / "_meta" / "usage.md")
    out = [
        "# 提示词库（模块版）",
        "",
        "由《外部提示词汇总》拆分而来，一条提示词一个文件，文件开头的元数据写明编号、来源许可、实测状态、适用工具、补 6.0 哪一部分。",
        "",
        "## 常用命令",
        "",
        "```bash",
        "python tools/build.py video --style 末日废土写实 -o 视频提示词.txt   # 组装 6.0 视频专用提示词",
        "python tools/build.py video --option 成人内容 -o 视频提示词.txt     # 成人线项目：打开 6.0【一】第 7 条",
        "python tools/build.py patches                                    # 查看能补进 6.0 各部分的条目",
        "python tools/build.py all -o 外部提示词汇总.md                       # 合并回单文件发给团队",
        "python tools/build.py index                                        # 增删条目后重新生成本目录",
        "python tools/build.py site                                         # 生成网页版 site/index.html（双击打开）",
        "```",
        "",
        "- 新增一条：在对应目录新建 `编号-名称.md`（照抄任一文件的元数据格式），在 `_meta/manifest.json` 里按位置加一行，再在 `CHANGELOG.md` 记一笔。",
        "- 换项目画风：在 `06-video/styles/` 新建风格文件，组装时用 `--style` 指定，不用改 6.0 原文。",
        "- 改 6.0 主模板：直接改 `06-video/core/parts/` 里对应那一部分。",
        "- 可选条款：`06-video/core/options/` 里每个文件是一条按项目开关的条款，在 parts 里用 `{{OPT:名称}}` 占位。组装视频提示词时默认关闭，用 `--option 名称` 打开；合并回汇总文档时全部保留。目前有：成人内容（6.0【一】第 7 条，全年龄线项目不要打开）。",
        "- 其他资料：更新记录见 [CHANGELOG.md](CHANGELOG.md)，来源与许可见 [sources.md](sources.md)。",
        "",
        usage.replace("## 使用说明", "## 使用说明（原文）").rstrip(),
        "",
        "## 目录",
    ]
    for folder, label in FOLDERS:
        files = sorted((ROOT / folder).glob("*.md"),
                       key=lambda p: [int(x) for x in p.name.split("-")[0].split(".") if x.isdigit()])
        if not files:
            continue
        out += ["", f"### {label}", "", "| 编号 | 名称 | 来源 | 状态 |", "|---|---|---|---|"]
        for p in files:
            fm, _ = split_front(read(p))
            if not fm:
                continue
            extra = [fm.get("status", "")]
            if fm.get("patches"):
                extra.append("补 6.0【" + "】【".join(fm["patches"]) + "】")
            if fm.get("tool"):
                extra.append("适用 " + fm["tool"])
            link = p.relative_to(ROOT).as_posix()
            status = "；".join(x for x in extra if x)
            out.append(f"| {fm['id']} | [{fm['title']}](<{link}>) | {fm['license']} | {status} |")
        if folder == "06-video/core":
            out.append("| | [6.0 各部分 parts/](<06-video/core/parts>) | | 【一】…【七】分文件，【三】风格取自 styles/ |")
    return "\n".join(out) + "\n"


def build_site():
    """把全部模块打包进 site/index.html（单文件，双击即可打开）。"""
    entries = []
    for folder, label in FOLDERS:
        for p in (ROOT / folder).glob("*.md"):
            fm, body = split_front(read(p))
            if not fm:
                continue
            if fm["id"] == "6.0":
                body = body.replace("{{CORE_PROMPT}}", core_prompt("末日废土写实", all_options()))
            entries.append({**fm, "folder": folder, "path": p.relative_to(ROOT).as_posix(),
                            "body": body.split("\n", 1)[1] if body.startswith("## ") else body})
    order = json.loads(read(CORE / "parts" / "order.json"))
    data = {
        "groups": [{"key": f, "label": l} for f, l in FOLDERS],
        "entries": entries,
        "core": {
            "parts": [read(CORE / "parts" / n) for n in order],
            "styles": {p.stem: read(p) for p in STYLES.glob("*.md") if not re.match(r"\d", p.stem)},
            "options": {n: read(OPTIONS / f"{n}.md") for n in all_options()},
        },
        "roles": json.loads(read(ROOT / "data" / "roles.json")),
        "changelog": read(ROOT / "CHANGELOG.md"),
        "sources": read(ROOT / "sources.md"),
    }
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = read(ROOT / "tools" / "site-template.html").replace("/*__DATA__*/null", blob)
    out = ROOT / "site" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8", newline="\n")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["all", "video", "patches", "index", "site"])
    ap.add_argument("--style", default="末日废土写实")
    ap.add_argument("--option", action="append", default=[],
                    help="打开 6.0 的可选条款，可多次使用，如 --option 成人内容（默认全部关闭）")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()
    if a.mode == "patches":
        return list_patches()
    if a.mode == "index":
        (ROOT / "README.md").write_text(build_index(), encoding="utf-8", newline="\n")
        return print("已生成 README.md")
    if a.mode == "site":
        return print(f"已生成 {build_site()}")
    text = build_all(a.style) if a.mode == "all" else core_prompt(a.style, a.option)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8", newline="\n")
        print(f"已写入 {a.out}")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
