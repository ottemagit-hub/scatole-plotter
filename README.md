# Scatole in cartone – file di taglio FEFCO per plotter

Web app statica (nessuna dipendenza, nessuna build obbligatoria): apri `index.html` oppure il file singolo `dist/scatole-plotter.html` nel browser.

## Modelli FEFCO disponibili
- **Serie 02 (americane e astucci):** `0200` (aperta), `0201` (standard), `0202` (parzialmente sovrapposta), `0203` (FOL sovrapposta), `0204` (tutte le alette al centro), `0211` (astuccio chiusura a incastro sopra/sotto), `0215` (astuccio coperchio a incastro + fondo a coda di rondine 1-2-3).
- **Serie 03 / 05:** `0330` (fondo + coperchio separato), `0501` (manicotto / fascia scorrevole).
- **Serie 04 (fustellate e vassoi):** `0401` (cartella a croce per oggetti piatti), `0422` (vassoio con coperchio incernierato), `0427` (scatola a libro / e-commerce automontante senza colla), `0458` (vassoio aperto con linguette).
- **Serie 07:** `0711` (scatola a fondo automatico crash-lock).
- **Serie 09 (interni):** `0901` (falda separatrice piana), `0933` (divisori ad alveare incrociati $N \times M$ celle).

## Funzioni principali
- Inserisci larghezza, altezza, profondità (interne o esterne) e spessore del cartone (1–10 mm o valore libero).
- Esporta **PDF** vettoriale in scala 1:1 (rosso = taglio, blu continuo = cordonatura) e **DXF** con layer separati (`TAGLIO` / `CORDONATURA`).
- Compensazione automatica dello spessore del cartone sulle cordonature (inclusa doppia parete per `0427` e doppia piega per `0401`).
- Salvataggio scatole in memoria locale + esporta/importa archivio JSON.

## File unico
`dist/scatole-plotter.html` è l'app in un solo file (generato con `python3 build.py`): scaricalo e aprilo con doppio clic nel browser.
