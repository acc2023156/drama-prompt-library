"""把《外部提示词汇总》单文件拆成模块目录。

用法：python packages/web/split.py <源文件.md> [输出目录，默认为仓库根目录]
拆分结果可用 packages/web/build.py 原样合并回单文件。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

CHAPTERS = {  # 章标题前缀 -> (章号, 默认目录)
    "一": ("1", "01-outline"),
    "二": ("2", "02-adaptation"),
    "三": ("3", "03-revision"),
    "四": ("4", "archive/04-storyboard"),
    "五": ("5", "archive/05-design"),
    "六": ("6", "06-video/reference"),
    "七": ("7", "07-compliance"),
}

# 按功能归组（覆盖默认目录）
GROUPS = {
    "03-revision/dialogue": "3.3 3.4 3.12 3.14 3.15 3.21 3.24 3.26",
    "03-revision/de-ai": "3.5 3.8 3.23",
    "03-revision/trim": "3.9 2.14",
    "03-revision/review": "3.6 3.7 3.13 3.16 3.17 3.22",
    "03-revision/shootability": "3.1 3.11 3.18 3.19 3.25",
    "03-revision/craft": "3.2 3.10 3.20 3.27",
    "06-video/core": "6.0",
    "06-video/styles": "6.5",
}
GROUP_OF = {i: d for d, ids in GROUPS.items() for i in ids.split()}

TAG_RE = re.compile(r"【(内部[^】]*|外部·[^】]*)】")
HEAD_RE = re.compile(r"^## (\d+\.\d+) (.*)$")
SECTION_RE = re.compile(r"^【([一二三四五六七])、([^】]+)】$")


def safe_name(s, limit=28):
    s = re.split(r"[（(【：:]", s)[0].strip()
    s = re.sub(r"\s*\+\s*", "+", s).replace("“", "").replace("”", "")
    s = re.sub(r'[\\/:*?"<>|\s]+', "-", s).strip("-")
    return s[:limit] or "untitled"


def yaml_val(v):
    if isinstance(v, list):
        return "[" + ", ".join(json.dumps(x, ensure_ascii=False) for x in v) + "]"
    return json.dumps(v, ensure_ascii=False)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT
    lines = src.read_text(encoding="utf-8").split("\n")

    # 标出代码块外的标题行
    in_code = False
    heads = []  # (行号, 级别, 文本)
    for i, ln in enumerate(lines):
        if ln.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if ln.startswith("# "):
            heads.append((i, 1, ln))
        elif ln.startswith("## "):
            heads.append((i, 2, ln))

    idx_usage = next(i for i, _, t in heads if t == "## 使用说明")
    idx_toc = next(i for i, _, t in heads if t == "## 目录")
    chap_heads = [(i, t) for i, lv, t in heads if lv == 1 and i > idx_toc]

    def chunk_start(i):
        """章标题前面的 '---' 和空行归到这一章。"""
        j = i
        while j > 0 and lines[j - 1] in ("", "---"):
            j -= 1
        return j

    meta = out / "_meta"
    write(out / "CHANGELOG.md", "\n".join(lines[:idx_usage]))
    write(meta / "usage.md", "\n".join(lines[idx_usage:idx_toc]))

    # 目录：记下每条的目录行（可能比标题多“实测”备注）和附录目录
    first_chap = chunk_start(chap_heads[0][0])
    toc_lines = lines[idx_toc:first_chap]
    toc_entry = {}
    appendix_toc = []
    in_appendix = False
    for ln in toc_lines:
        if ln == "附录":
            in_appendix = True
        if in_appendix:
            appendix_toc.append(ln)
            continue
        m = re.match(r"^- (\d+\.\d+) ", ln)
        if m:
            toc_entry[m.group(1)] = ln[m.end():]
    write(meta / "toc-appendix.md", "\n".join(appendix_toc))

    manifest = []
    used_paths = set()
    for ci, (ci_line, ctitle) in enumerate(chap_heads):
        c_start = chunk_start(ci_line)
        c_end = chunk_start(chap_heads[ci + 1][0]) if ci + 1 < len(chap_heads) else len(lines)
        key = ctitle[2]
        if ctitle.startswith("# 附录"):
            write(out / "sources.md", "\n".join(lines[c_start:c_end]))
            manifest.append({"kind": "appendix", "path": "sources.md"})
            continue
        cnum, cdir = CHAPTERS[key]
        entries = [(i, t) for i, lv, t in heads if lv == 2 and ci_line < i < c_end]
        intro_end = entries[0][0] if entries else c_end
        intro_path = f"_meta/chapters/{cnum}.md"
        write(out / intro_path, "\n".join(lines[c_start:intro_end]))
        manifest.append({"kind": "chapter", "path": intro_path, "title": ctitle[2:],
                         "toc_title": ctitle[2:]})

        for ei, (e_line, etitle) in enumerate(entries):
            e_end = entries[ei + 1][0] if ei + 1 < len(entries) else c_end
            body = lines[e_line:e_end]
            m = HEAD_RE.match(etitle)
            eid, rest = m.group(1), m.group(2)
            tag = TAG_RE.search(rest)
            title = rest[: tag.start()].strip() if tag else rest
            tail = rest[tag.end():] if tag else ""
            toc_line = toc_entry.get(eid, rest)
            fm = {
                "id": eid,
                "title": title,
                "chapter": ctitle[2:],
                "license": tag.group(1) if tag else "",
            }
            tool = re.search(r"（适用 ([^）]+)）", tail)
            if tool:
                fm["tool"] = tool.group(1)
            note = toc_line[len(rest):].strip() if toc_line.startswith(rest) else ""
            text = "\n".join(body)
            if note:
                fm["status"] = note.strip("（）")
            elif "已用于生产" in text:
                fm["status"] = "已用于生产"
            patches = re.findall(r"【([一二三四五六七])】", " ".join(re.findall(r"（补[^）]*）", rest)))
            if patches:
                fm["patches"] = patches

            d = GROUP_OF.get(eid) or ("06-video/patches" if patches else cdir)
            fname = f"{eid}-{safe_name(title)}.md"
            rel = f"{d}/{fname}"
            assert rel not in used_paths, rel
            used_paths.add(rel)

            if eid == "6.0":
                text = split_core(out / d, body)
                rel = f"{d}/6.0-说明.md"
            front = "---\n" + "".join(f"{k}: {yaml_val(v)}\n" for k, v in fm.items()) + "---\n"
            write(out / rel, front + text)
            item = {"kind": "entry", "path": rel, "id": eid}
            if toc_line != rest:
                item["toc"] = toc_line
            manifest.append(item)

    write(meta / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f"拆出 {sum(1 for x in manifest if x['kind'] == 'entry')} 条，写入 {out}")


def split_core(core_dir, body):
    """6.0：说明留在 6.0-说明.md，代码块按【一】…【七】拆开，风格单独放 styles/。"""
    s = body.index("```")
    e = len(body) - 1 - body[::-1].index("```")
    code = body[s + 1:e]
    parts, cur, name = [], [], "00-开头"
    for ln in code:
        m = SECTION_RE.match(ln)
        if m:
            parts.append((name, cur))
            n = "一二三四五六七".index(m.group(1)) + 1
            name, cur = f"{n:02d}-{m.group(2)}", []
        cur.append(ln)
    parts.append((name, cur))
    order = []
    for name, ls in parts:
        if name.startswith("03-"):
            # 段标题 + 空行留在 core，风格正文放 styles，换项目时只换风格文件
            head, style = ls[:2], ls[2:]
            write(core_dir.parent / "styles" / "末日废土写实.md", "\n".join(style))
            ls = head + ["{{STYLE}}"]
        write(core_dir / "parts" / f"{name}.md", "\n".join(ls))
        order.append(f"{name}.md")
    write(core_dir / "parts" / "order.json", json.dumps(order, ensure_ascii=False, indent=1))
    return "\n".join(body[: s + 1] + ["{{CORE_PROMPT}}"] + body[e:])


if __name__ == "__main__":
    main()
