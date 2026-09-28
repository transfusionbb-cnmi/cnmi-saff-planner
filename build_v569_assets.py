#!/usr/bin/env python3
"""Rebuild the ordered v569 browser assets from asset-manifest-v569.json.

Keep source patches in their original order. Run after changing a source patch,
and increase the versioned bundle URL in index.html for subsequent releases.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / 'asset-manifest-v569.json').read_text())


def source(name):
    path = HERE / name
    if not path.is_file() or path.parent != HERE:
        raise ValueError(f'Missing or unsafe asset: {name}')
    return path.read_text(encoding='utf-8')


def build_js(names, filename):
    # Every post-app source is already an IIFE, so app globals remain visible.
    pieces = []
    for name in names:
        content = source(name)
        if '\x00' in content:
            raise ValueError(f'Invalid JavaScript source: {name}')
        beginning = re.sub(r'^\s*/\*.*?\*/', '', content, flags=re.S).lstrip()
        beginning = re.sub(r'^(?://[^\n]*\n\s*)+', '', beginning)
        if not re.match(r'^;?\s*\(\s*(?:function|\(\s*\)\s*=>|async\s+function)', beginning):
            raise ValueError(f'Bundle only self-contained patch IIFEs: {name}')
        # A failing patch must not stop the next patch. Classic script tags
        # continued after an uncaught exception, so preserve that behavior.
        pieces.append(
            f'\n/* Original source: {name} */\ntry {{\n{content}\n}} '
            f'catch (error) {{ console.error("[v569] {name}", error); }}\n;\n'
        )
    (HERE / filename).write_text(''.join(pieces), encoding='utf-8')


def build_css(names, filename):
    (HERE / filename).write_text(''.join(
        f'\n/* Original source: {name} */\n{source(name)}\n'
        for name in names
    ), encoding='utf-8')


build_css(manifest['css'], 'app-styles-v569.css')
build_js(manifest['preAppScripts'], 'app-bundle-v569-pre.js')
post = manifest['postAppScripts']
# Bound each parse/execute chunk and keep errors isolated to a small set of
# independent patch IIFEs. The app itself stays a separate classic script.
groups = []
for name in post:
    size = len(source(name).encode('utf-8'))
    if not groups or len(groups[-1]) >= 24 or sum(len(source(x).encode('utf-8')) for x in groups[-1]) + size > 510_000:
        groups.append([])
    groups[-1].append(name)
for index, names in enumerate(groups, 1):
    build_js(names, f'app-bundle-v569-{index:02}.js')
print(f'Generated 1 CSS + 1 pre-app + {len(groups)} post-app JavaScript bundles')
