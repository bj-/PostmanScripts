"""Копирует скрипты фреймворка в скрипты уровня коллекции Postman (локальный YAML-формат).

    python tools/sync_collection.py <путь к папке коллекции>
    python tools/sync_collection.py ../Postman/postman/collections/BFF-Admin

Берёт "Before Responce (collection).js" и "After Responce (collection).js" рядом с папкой tools
и записывает их в <коллекция>/.resources/definition.yaml (scripts: http:beforeRequest / http:afterResponse).
Остальные поля definition.yaml сохраняются. Нужен PyYAML (pip install pyyaml).
"""
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = {
    "http:beforeRequest": "Before Responce (collection).js",
    "http:afterResponse": "After Responce (collection).js",
}


class Block(str):
    pass


def _block(dumper, data):
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")


yaml.add_representer(Block, _block)


def read_js(name):
    with open(os.path.join(ROOT, name), encoding="utf-8-sig") as fh:
        text = fh.read()
    # блочный скаляр YAML не допускает табуляций и пробелов в конце строк
    lines = [line.replace("\t", "    ").rstrip() for line in text.splitlines()]
    return Block("\n".join(lines).strip("\n"))


def main(collection_dir):
    path = os.path.join(collection_dir, ".resources", "definition.yaml")
    with open(path, encoding="utf-8") as fh:
        doc = yaml.safe_load(fh) or {}
    scripts = [s for s in doc.get("scripts", []) if s.get("type") not in SOURCES]
    for script_type, name in SOURCES.items():
        scripts.append({"type": script_type, "code": read_js(name), "language": "text/javascript"})
    doc["scripts"] = scripts
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        yaml.dump(doc, fh, sort_keys=False, allow_unicode=True, width=4096, default_flow_style=False)
    print("updated", path)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
