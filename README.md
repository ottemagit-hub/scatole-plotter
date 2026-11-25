# Scatole in cartone – file di taglio per plotter

Web app statica (nessuna dipendenza, nessuna build): apri `index.html` nel browser.

- Inserisci larghezza, altezza, profondità e spessore del cartone (1–10 mm o valore libero).
- Tipi: americana FEFCO 0201 e fondo + coperchio separato.
- Esporta **PDF** vettoriale in scala 1:1 (rosso = taglio, blu tratteggiato = cordonatura) e **DXF** con layer `TAGLIO` / `CORDONATURA`.
- Lo spessore compensa le cordonature (0201: pannello = misura interna + t; vassoio: base = interna + 2t).
- Le scatole si possono salvare in una lista (localStorage).

Importa il file nel software del plotter Elitron e associa il colore/layer rosso al taglio e il blu alla cordonatura.
