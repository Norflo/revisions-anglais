# Révisions d'anglais

Appli Android de révision du vocabulaire anglais, rangée ici à part de Radar Alerte.

- **Installer** : [RevisionsAnglais.apk](https://github.com/Norflo/revisions-anglais/releases/download/anglais/RevisionsAnglais.apk)
- `site/` : la page (`index.html`, liste des mots dans `DATA`) et les sons (`audio/<mot>.mp3`).
  L'appli va chercher ces fichiers ici quand il y a Internet : un mot ajouté dans `site/`
  arrive dans l'appli sans réinstaller l'APK.
- **Nature des mots** : la traduction (2ᵉ colonne de `DATA`) commence par la nature du mot, une partie par
  sens, séparées par « ; » : `n. brouillon ; v. rédiger`. Étiquettes : `n.` nom, `v.` verbe, `adj.`, `adv.`,
  `prép.`, `conj.`, `interj.`, `expr.` (expression). L'appli les affiche en petites étiquettes de couleur.
  Dans « + Ajouter », l'appli cherche les natures du mot (dictionaryapi.dev) et traduit chacune à part
  (« to draft » → verbe, « the draft » → nom) : la proposition est à vérifier.
- `site/ajout.js` : onglet « + Ajouter » (seulement dans l'APK) : traduction en ligne (MyMemory),
  voix du téléphone en attendant Ava. Avec une clé GitHub collée une fois dans l'onglet (fine-grained
  token, dépôt revisions-anglais seulement, Contents : Read and write), chaque mot ajouté est écrit
  directement dans `DATA` de `site/index.html` : pas besoin de passer par Claude.
  Ce fichier n'est pas dans l'appli Claude : ne pas le supprimer en recopiant `index.html`.
- `tools/fill.py` : lancé par le workflow « Révisions d'anglais - sons » à chaque changement de
  `index.html` : ajoute aux nouveaux mots une phrase d'exemple (Tatoeba, avec traduction) et leur
  fréquence, puis `tools/make_audio.py` fabrique les sons Ava. Les valeurs existantes ne sont jamais
  modifiées : on peut corriger une phrase ou une fréquence à la main.
- `site/exemples.json` : une phrase d'exemple courante par mot (le mot entre crochets) + sa traduction,
  pour l'exercice « En contexte » (APK). Les phrases sont lues par la voix Ava (`audio/ex-<mot>.mp3`).
- `site/frequences.json` : fréquence d'usage de chaque mot en anglais (4 très courant, 3 courant,
  2 peu courant, 1 rare), affichée en badge dans l'APK. Mots seuls : Zipf de wordfreq (max des formes
  fléchies ; ≥4,5 → 4, ≥3,8 → 3, ≥3 → 2, sinon 1) ; expressions : estimation à la main.
- `site/audio/versions.json` : empreinte de chaque son, refaite par le workflow. L'appli l'ajoute à
  l'adresse du son : un son refait (phrase changée) remplace bien l'ancien sur le téléphone.
- `android/` : l'appli Android (WebView). Un changement dans `android/` refait l'APK
  (workflow « Révisions d'anglais - APK »). La page et les sons sont aussi copiés dans l'APK
  pour marcher hors connexion.
