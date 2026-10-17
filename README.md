# lavagnetta

Schemi di basket da disegnare, rivedere e provare, anche dal telefono. È nata per una squadra del settore giovanile: l'allenatore disegna gli schemi, i ragazzi li aprono con una password e li guardano muoversi, difesa compresa.

## Cosa fa

- **Lavagna 2D vista dall'alto**, con i segni classici: taglio, palleggio a zig-zag, blocco con la barra, passaggio tratteggiato, tiro.
- **Vista 3D** a richiesta, con quattro inquadrature e rotazione libera.
- **Difesa che si muove da sola**: a uomo, zona 2-3 o zona 3-2. L'allenatore corregge a mano solo i difensori che vuole.
- **Letture**: una fase può avere più seguiti a seconda di cosa fa la difesa (passa sopra, passa sotto, cambia, o un movimento disegnato). Chi guarda sceglie la lettura e vede la variante.
- **Metà campo, rimessa da fondo e rimessa laterale.**
- **Chi sei?** Ogni ragazzo sceglie il suo numero: il suo percorso resta evidenziato, gli altri diventano grigi.
- **Mettiti alla prova**: lo schema si ferma e chiede "dove vai?" o "a chi passi?". Si risponde toccando il campo; alle letture la difesa sceglie a caso.
- **Quintetto**: si assegnano i nomi della rosa ai numeri 1-5, e i nomi compaiono sotto le pedine.
- **Link condivisibile** per ogni schema, in sola lettura, senza password. L'allenatore può crearne uno nuovo e il vecchio smette di funzionare.

## Come si muove la difesa

La simulazione calcola 30 fotogrammi al secondo ed è deterministica: con gli stessi dati dà sempre lo stesso risultato, quindi si può andare avanti e indietro.

**A uomo.** Chi marca la palla sta a un metro dal palleggiatore, tra lui e il canestro. A un passaggio di distanza si sta sulla linea di passaggio, un passo verso il canestro; sul post si anticipa di tre quarti. Sul lato debole ci si stacca nel triangolo palla-uomo-canestro, ma non oltre tre metri. Se il palleggiatore batte il suo difensore vicino al canestro, il compagno più vicino tra quelli lontani dalla palla va in aiuto.

**Sui blocchi.** Chi usa il blocco parte in tempo per arrivarci appena è piazzato. Il difensore che lo segue lo affronta come indicato nello schema o nella lettura:

- *passa sopra*: insegue tra bloccante e attaccante e perde un po' di velocità nel contatto; sul blocco sulla palla il difensore del bloccante esce a contenere e poi rientra;
- *passa sotto*: passa dal lato del canestro, mentre il difensore del bloccante fa un passo indietro per lasciarlo passare;
- *cambia*: i due difensori si scambiano l'uomo nel momento in cui l'attaccante supera il bloccante.

Nessun difensore attraversa un altro giocatore. Reagiscono con due decimi di secondo di ritardo, come in campo.

**A zona.** Per la 2-3 e la 3-2 ci sono posizioni di riferimento con la palla in punta, in ala, in angolo, in post alto e in post basso. Per gli altri punti si interpola. Il difensore più vicino esce sulla palla e gli altri si stringono un po' sugli attaccanti che entrano nella loro zona.

Sono le regole che si insegnano in palestra. Dove la difesa vera fa altro, l'allenatore la corregge a mano o crea una lettura.

## Usarla per la tua squadra

Serve un account GitHub e un account [Supabase](https://supabase.com), tutti e due gratuiti.

1. Fai un fork di questo repository.
2. Crea un progetto su Supabase. Apri **SQL Editor**, incolla il contenuto di [`supabase/schema.sql`](supabase/schema.sql) ed eseguilo.
3. Sempre nello SQL Editor, imposta nome e password della squadra:

   ```sql
   update team set
     name = 'Nome della squadra',
     view_hash = crypt('password dei giocatori', gen_salt('bf')),
     edit_hash = crypt('password degli allenatori', gen_salt('bf'));
   ```

   Più avanti le password si cambiano da **Impostazioni** nell'app.
4. In Supabase, da **Project Settings → API**, copia l'URL del progetto e la chiave *publishable* (o *anon*). Nel tuo fork, in **Settings → Secrets and variables → Actions → Variables**, crea `SUPABASE_URL` e `SUPABASE_KEY` con quei valori. La chiave è pubblica per costruzione: il database accetta solo le funzioni dello schema, che controllano la sessione.
5. In **Settings → Pages** scegli *GitHub Actions* come sorgente.
6. Fai un push su `main`. Dopo un paio di minuti il sito è su `https://<utente>.github.io/<repository>/`.

Il piano gratuito di Supabase mette in pausa i progetti fermi da una settimana. Il workflow `keepalive.yml` chiama il database ogni tre giorni per evitarlo.

### Dati dei giocatori

Per ogni giocatore si salvano nome, numero, ruolo e altezza, tutti facoltativi tranne il nome. Con dei minorenni basta il nome o un soprannome. Le tabelle non sono leggibili direttamente: ogni lettura passa da una funzione che controlla la sessione.

## Sviluppo

```sh
npm install
cp .env.example .env.local   # poi inserisci URL e chiave del tuo progetto
npm run dev
npm test
```

Il codice è in Svelte 5 e TypeScript, con Vite. Three.js serve solo alla vista 3D e si carica quando la si apre.

- `src/lib/sim.ts`: tempi dell'attacco, volo della palla, reazione della difesa.
- `src/lib/defense.ts`: le posizioni a uomo e a zona.
- `src/pages/Editor.svelte`: la lavagna dell'allenatore.
- `src/pages/Viewer.svelte`: riproduzione, letture e prova.
- `supabase/schema.sql`: tabelle e funzioni del database.

## Licenza

MIT
