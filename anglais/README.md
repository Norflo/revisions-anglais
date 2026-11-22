# Révisions d'anglais

Appli Android de révision du vocabulaire anglais, rangée ici à part de Radar Alerte.

- **Installer** : [RevisionsAnglais.apk](https://github.com/Norflo/revisions-anglais/releases/download/anglais/RevisionsAnglais.apk)
- `site/` : la page (`index.html`, liste des mots dans `DATA`) et les sons (`audio/<mot>.mp3`).
  L'appli va chercher ces fichiers ici quand il y a Internet : un mot ajouté dans `site/`
  arrive dans l'appli sans réinstaller l'APK.
- `site/ajout.js` : onglet « + Ajouter » (seulement dans l'APK) : traduction en ligne (MyMemory),
  voix du téléphone pour les nouveaux mots, mots gardés sur le téléphone, liste à envoyer à Claude.
  Ce fichier n'est pas dans l'appli Claude : ne pas le supprimer en recopiant `index.html`.
- `site/exemples.json` : une phrase d'exemple courante par mot (le mot entre crochets) + sa traduction,
  pour l'exercice « En contexte » (APK). Les phrases sont lues par la voix Ava (`audio/ex-<mot>.mp3`).
- `site/frequences.json` : fréquence d'usage de chaque mot en anglais (4 très courant, 3 courant,
  2 peu courant, 1 rare), affichée en badge dans l'APK. Mots seuls : Zipf de wordfreq (max des formes
  fléchies ; ≥4,5 → 4, ≥3,8 → 3, ≥3 → 2, sinon 1) ; expressions : estimation à la main.
- `android/` : l'appli Android (WebView). Un changement dans `android/` refait l'APK
  (workflow « Révisions d'anglais - APK »). La page et les sons sont aussi copiés dans l'APK
  pour marcher hors connexion.
