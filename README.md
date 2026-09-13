# Tactics Lab

Web app React + TypeScript per comporre, salvare ed esportare immagini tattiche di calcio viste dall’alto. Il campo e i 19 giocatori forniti sono inclusi nel repository e pronti all’uso.

## Funzioni principali

- editor su canvas Konva con trascinamento, ridimensionamento proporzionale e rotazione;
- inserimento multiplo, selezione singola o multipla, duplicazione, blocco e livelli;
- nome/numero facoltativi, posizione dell’etichetta e colori personalizzabili;
- annulla/ripristina, snap magnetico, zoom e recupero dell’ultima versione salvata;
- importazione reale di ZIP, PNG, WebP e JPG con deduplicazione e limiti di sicurezza;
- più progetti con titolo, anteprima e salvataggio locale tramite IndexedDB;
- esportazione PNG/JPG in formato originale, Full HD o personalizzato, fino a 4×;
- esportazione e importazione del progetto in JSON, inclusi gli asset personalizzati usati;
- layout responsive ottimizzato per computer e tablet.

## Avvio locale

Requisiti: Node.js 22.13 o successivo e pnpm.

```bash
pnpm install
pnpm dev
```

Apri `http://localhost:3000` nel browser.

## Verifica

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

I progetti e gli asset importati rimangono nel browser dell’utente. L’elaborazione avviene interamente sul dispositivo e non richiede database o servizi esterni.
