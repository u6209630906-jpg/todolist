# Istruzioni per il repository

## Deploy: serve sempre una conferma esplicita

- Non eseguire **mai** un deploy senza aver prima chiesto conferma all'utente.
- Per "deploy" si intende qualunque azione che renda le modifiche visibili all'esterno: `git push`, pubblicazione su GitHub Pages o altro hosting, release/tag, upload di file, apertura di una PR verso il branch principale.
- Chiedere la conferma con lo strumento di domanda (`ask_user`), indicando cosa verrebbe pubblicato e su quale branch/hosting. Poi **fermarsi e attendere** la risposta.
- Se l'utente non risponde entro un tempo ragionevole, **non pubblicare nulla**: lasciare le modifiche solo in locale, riepilogare lo stato e chiudere l'attività come completata.
- Commit locali, modifiche ai file e test non sono deploy e possono essere eseguiti senza chiedere.
