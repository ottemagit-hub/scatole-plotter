#!/usr/bin/env python3
"""Genera dist/scatole-plotter.html: l'app in un unico file, apribile con doppio clic."""
import os
os.makedirs('dist', exist_ok=True)
h = open('index.html', encoding='utf-8').read()
h = h.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + open('style.css', encoding='utf-8').read() + '\n</style>')
for f in ['geometry', 'export', 'app']:
    js = open(f'js/{f}.js', encoding='utf-8').read().replace('</script>', '<\\/script>')
    h = h.replace(f'<script src="js/{f}.js"></script>', '<script>\n' + js + '\n</script>')
open('dist/scatole-plotter.html', 'w', encoding='utf-8').write(h)
