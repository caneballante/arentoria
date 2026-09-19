"""Create a searchable Markdown mirror of the immutable Arentoria build prompt."""

from __future__ import annotations

import hashlib
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = PROJECT_ROOT / "Arentoria DM City Database App — Codex Build Prompt.docx"
OUTPUT_PATH = PROJECT_ROOT / "docs" / "build-prompt-reference.md"
WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NAMESPACE}


def element_text(element: ElementTree.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        local_name = node.tag.rsplit("}", 1)[-1]
        if local_name == "t":
            parts.append(node.text or "")
        elif local_name == "tab":
            parts.append("\t")
        elif local_name in {"br", "cr"}:
            parts.append("\n")
    return "".join(parts).strip()


def document_lines(source_path: Path) -> list[str]:
    with ZipFile(source_path) as archive:
        root = ElementTree.fromstring(archive.read("word/document.xml"))

    body = root.find("w:body", NS)
    if body is None:
        raise RuntimeError("The DOCX is missing word/document.xml body content.")

    lines: list[str] = []
    for block in body:
        local_name = block.tag.rsplit("}", 1)[-1]
        if local_name == "p":
            text = element_text(block)
            if text:
                lines.append(text)
        elif local_name == "tbl":
            for row in block.findall("w:tr", NS):
                cells = [element_text(cell) for cell in row.findall("w:tc", NS)]
                if any(cells):
                    lines.append(" | ".join(cells))
    return lines


def markdown_body(lines: list[str]) -> str:
    rendered: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        is_rule = len(line) >= 20 and set(line) == {"="}
        if is_rule and index + 2 < len(lines) and len(lines[index + 2]) >= 20 and set(lines[index + 2]) == {"="}:
            rendered.extend([f"## {lines[index + 1]}", ""])
            index += 3
            continue
        if index == 0:
            rendered.extend([f"# {line}", ""])
        else:
            rendered.extend([line, ""])
        index += 1
    return "\n".join(rendered).rstrip() + "\n"


def main() -> None:
    source_bytes = SOURCE_PATH.read_bytes()
    digest = hashlib.sha256(source_bytes).hexdigest()
    header = (
        "<!-- GENERATED FILE: do not edit by hand. -->\n"
        f"<!-- Source: {SOURCE_PATH.name} -->\n"
        f"<!-- Source SHA-256: {digest} -->\n\n"
        "> Searchable text mirror of the immutable build prompt. "
        "When source packaging differs from this prompt, `docs/source-audit.md` is authoritative.\n\n"
    )
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(header + markdown_body(document_lines(SOURCE_PATH)), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)} from SHA-256 {digest}")


if __name__ == "__main__":
    main()
