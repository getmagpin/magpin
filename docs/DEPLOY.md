# Déployer Magpin — plan complet

Trois choses à mettre en ligne : **le site sur Cloudflare Pages (`magpin.pages.dev`)**, **le plugin sur Figma Community**, **l'extension sur le Chrome Web Store**. Le code va sur GitHub, et chaque envoi met le site à jour tout seul. Les étapes dépendent les unes des autres, donc l'ordre compte.

**Coût total : 5 $** (le compte Chrome Web Store, une seule fois). Tout le reste est gratuit, pour toujours.

## 0. À décider avant de commencer

| Quoi | Pourquoi | Choix |
| --- | --- | --- |
| Adresse du site | Le Chrome Web Store demande une URL de politique de confidentialité ; les liens de partage ont besoin d'une adresse absolue | **`https://magpin.pages.dev/`**, gratuite à vie (Cloudflare Pages ; nom libre au 10 novembre 2026). Si un jour il faut un vrai domaine, `getmagpin.com` serait le choix naturel (environ 12 $/an, sans hausse au renouvellement) |
| Identité | Un seul nom partout | Identifiant **`getmagpin`** (« get » parce que `magpin` est pris sur GitHub), nom affiché **Magpin** |
| Mail du projet | Compte Google exigé par le Chrome Web Store, contact support des deux stores, contact de `privacy.html` | **`getmagpin@gmail.com`** (créé), avec la validation en 2 étapes |
| Compte GitHub et nom du repo | Héberge le code ; GitHub Actions publie le site | Compte **`getmagpin`** (libre au 10 novembre 2026), repo public `magpin` → `github.com/getmagpin/magpin` |
| Noms publics dans les stores | Affichés sur les fiches | Chrome Web Store, nom d'éditeur : **Magpin**. Figma, profil Community : **Magpin**, pseudo `@getmagpin` (disponibilité visible seulement à la création) |
| Licence | Un repo public sans licence n'est pas réutilisable | MIT |
| Ce qui reste privé | Le brief, les maquettes et les essais n'ont pas à être publics | Ne pas publier `Magpin — Brief produit V1.md`, `Cards/`, `spikes/`, `.impeccable/`, `.claude/` (les ajouter au `.gitignore`) |
| Comptes | — | Cloudflare (gratuit), GitHub (gratuit), Figma (gratuit ; double authentification probablement demandée pour publier), Chrome Web Store (5 $ une fois) |

**Tests manuels à faire avant de publier** (le README les liste encore comme non vérifiés) :
- un board entier dans **FigJam**, de la copie à la création ;
- un board de **500 images** et un **ZIP de 500 images** dans le plugin ;
- **Windows** : Ctrl+V dans le plugin, et l'extension sur Chrome Windows.
- **Dans le vrai Figma** (codé d'après la documentation, pas encore vu en vrai) :
  - un board Savee : le domaine `*.savee-cdn.com` du manifest doit être accepté ;
  - les variables de couleur en mode « Update » sur une collection existante ;
  - une source dont le serveur d'images refuse le plugin : Magpin doit passer par Figma et afficher son avertissement.

## L'ordre

1. **Mail du projet**, puis **réserver `magpin.pages.dev`** : la page `privacy.html` doit être en ligne avant la soumission au Chrome Web Store, et le nom peut être pris par quelqu'un d'autre.
2. **GitHub** : le code, et la mise à jour automatique du site.
3. **Figma** : publier le plugin. Son ID, donc son URL Community, est connu dès la publication, avant la validation.
4. **Chrome Web Store** : mettre l'URL du plugin dans l'extension, puis envoyer l'extension. Son ID, donc son URL, est connu dès l'envoi du premier ZIP, avant la validation.
5. **Liens** : mettre les deux URLs dans le site, qui se redéploie tout seul.
6. **Attendre les deux validations**, puis annoncer.

---

## 1. Le site et le code

**1.1 Réserver `magpin.pages.dev` et mettre le site en ligne (Cloudflare, 10 min)**
- Créer un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com) avec le mail du projet.
- Aller dans **Workers & Pages → Create**, puis cliquer sur le lien **« Continue to Pages »** en bas (le nouvel écran « Create an app » crée un Worker sur `workers.dev`, pas un site `pages.dev`), puis **Upload assets** (« Direct Upload »).
- ✅ Fait le 11 novembre 2026 : le site est en ligne sur `https://magpin.pages.dev/` (Lighthouse 100 / 100 / 100 / 100 sur mobile et ordinateur).
  - Nom du projet : `magpin`. L'adresse affichée doit être `magpin.pages.dev` ; sinon, le nom est pris et Cloudflare propose une variante.
  - Envoyer le dossier `apps/site/dist`, construit pour cette adresse :

```bash
SITE_URL=https://magpin.pages.dev/ pnpm build:site
```

- Vérifier :
  - `https://magpin.pages.dev/` ;
  - `https://magpin.pages.dev/privacy` (Cloudflare redirige `privacy.html` vers cette adresse).

**1.2 Mettre le code sur GitHub**
- ✅ Fait le 11 novembre 2026 : `https://github.com/getmagpin/magpin`, public, licence MIT reconnue.
- Le `.gitignore` exclut ce qui reste privé (brief, `Cards/`, `spikes/`, réglages locaux) et le fichier `LICENSE` (MIT) existe.
- Les commits sont signés « Magpin » avec l'adresse anonyme de GitHub (`355110437+getmagpin@users.noreply.github.com`), pas avec un mail perso. C'est un réglage local à ce repo.
- Connecter l'outil GitHub au compte `getmagpin`, avec `gh auth login`.
- Premier commit, puis création du repo et envoi :

```bash
gh repo create magpin --public --source . --remote origin --push
```

**1.3 Mise à jour automatique du site à chaque envoi**
- ✅ Fait le 11 novembre 2026 : les deux secrets existent et le workflow publie le site en production.
- Chez Cloudflare, créer un jeton :
  - aller dans **My Profile → API Tokens → Create Token → Custom token** ;
  - donner la permission **Account → Cloudflare Pages → Edit**.
- Noter aussi l'**Account ID**, affiché dans **Workers & Pages**, à droite.
- Dans le repo GitHub, aller dans **Settings → Secrets and variables → Actions → Secrets** et créer :
  - `CLOUDFLARE_API_TOKEN` ;
  - `CLOUDFLARE_ACCOUNT_ID`.
- Le workflow : `.github/workflows/site.yml`. Il appelle Wrangler avec `npx` (l'action `wrangler-action` échoue dans un workspace pnpm). Il construit le site pour `https://magpin.pages.dev/` et le publie à chaque envoi sur `main` qui touche le site. Tant que les deux secrets n'existent pas, il construit le site sans le publier.
- `.github/workflows/checks.yml` lance typecheck, tests et builds sur chaque envoi et chaque pull request.
- Avec `SITE_URL`, le build rend l'image de partage absolue et ajoute la balise `canonical` et `og:url`.

**1.4 Plus tard : un vrai domaine**
- Dans le projet Cloudflare Pages : **Custom domains → Set up a domain**.
- Mettre à jour `SITE_URL` dans le workflow.
- L'adresse `magpin.pages.dev` continue de marcher.

---

## 2. Figma Community : le plugin

**2.1 Tester la version finale**
- Lancer `pnpm build:plugin`.
- Dans Figma desktop : **Plugins → Development → Import plugin from manifest…**, puis choisir `apps/figma-plugin/manifest.json`.
- Faire les tests manuels du point 0.

**2.2 Obtenir l'ID**
- ✅ Fait le 11 novembre 2026 : ID `1702182298012784493` (bouton **Generate ID…** de la dernière étape de publication), dans le manifest et dans `FIGMA_PLUGIN_URL` de l'extension.
- Figma attribue un vrai ID au plugin (à la publication, ou via **Plugins → Development → New plugin…**). Le mettre dans `apps/figma-plugin/manifest.json`, relancer `pnpm build:plugin`, réimporter le manifest, puis publier.
- L'URL publique sera `https://www.figma.com/community/plugin/<ID>/magpin`.

**2.3 Publier**
- Prérequis : l'app Figma desktop, un compte Figma (`getmagpin@gmail.com`) avec la **validation en 2 étapes** activée (obligatoire pour publier).
- Dans Figma desktop : logo Figma en haut à gauche → **Plugins → Manage plugins**, puis **Publish** à côté de Magpin.
- Informations demandées :
  - **Nom** : Magpin
  - **Tagline** : Your next moodboard is one paste away.
  - **Description** : voir le texte prêt plus bas.
  - **Icône** : `assets/logo/head-sticker-128.png` (un plugin en développement ne peut pas avoir d'icône : Figma ne la prend que dans ce formulaire).
  - **Miniature (thumbnail)** : `assets/store/figma/cover.png` (1920 × 1080, la taille que Figma recommande).
  - **Carrousel** (jusqu'à 9) : `assets/store/figma/carousel-1-collect.png` à `carousel-5-free.png`, dans l'ordre.
  - **Catégorie** : Design tools ou Inspiration.
  - **Contact support** : `getmagpin@gmail.com`.
  - **Éditeurs** : Figma et FigJam (déjà dans le manifest).
  - **Prix** : gratuit.
- Les domaines réseau sont déjà déclarés dans le manifest, avec leur justification.

**2.4 Validation**
- ✅ Envoyé le 11 novembre 2026, publié « By getmagpin », en attente de validation. Réponses données au formulaire « Data security » : pas de backend ; requêtes réseau = images seulement ; pas d'authentification ; stockage local (réglages dans `figma.clientStorage`, ID du pin d'origine via `setPluginData`) ; développeur seul.
- Figma relit les plugins avant de les rendre publics. Compter quelques jours ouvrés, parfois plus.

Texte de description Figma (anglais, prêt à coller) :

> Magpin turns a board from Pinterest, Are.na, Cosmos or Savee into a Figma moodboard, sorted by color, with its palette.
>
> 1. In Chrome, open a board and click Magpin, then Collect this board (needs the free Magpin Chrome extension: https://magpin.pages.dev).
> 2. Copy for Figma.
> 3. Run Magpin here and press ⌘V (Ctrl+V), then Create moodboard.
>
> Grid, Mosaic or Colors layouts. Columns and spacing. A palette of 3 to 8 colors, saved as color variables if you like. Several boards at once, duplicates left out. Works in FigJam too.
>
> Free, unlimited. No account, no tracking, no Magpin server: images come straight from their source.

---

## 3. Chrome Web Store : l'extension

**3.1 Avant d'envoyer**
- ✅ `FIGMA_PLUGIN_URL` dans `apps/extension/src/config.ts` pointe vers la page du plugin (point 2.2).
- Vérifier la version dans `apps/extension/package.json` (1.0.0).
- Créer le ZIP à envoyer :

```bash
pnpm --filter @magpin/extension zip
```

- Le fichier sort dans `apps/extension/.output/`.

**3.2 Compte**
- Créer le compte sur [la console développeur du Chrome Web Store](https://chrome.google.com/webstore/devconsole) : 5 $ une seule fois, puis vérification de l'e-mail.

**3.3 Nouvel élément**
- Envoyer le ZIP. L'ID de l'extension apparaît tout de suite.
- L'URL publique sera `https://chromewebstore.google.com/detail/<ID>`.

**3.4 Fiche du store**
- **Langue** : anglais.
- **Catégorie** : Lifestyle → **Art & Design**.
- **Description** : voir le texte prêt plus bas.
- **Icône** : `apps/extension/public/icon/128.png` (128 × 128, aussi dans le ZIP).
- **Captures** : `assets/store/chrome/screenshot-1-collect.png` à `screenshot-5-free.png` (1280 × 800, PNG 24 bits).
- **Petite vignette promotionnelle** : `assets/store/chrome/promo-small-440x280.png`.
- **Grande bannière** (facultative) : `assets/store/chrome/promo-marquee-1400x560.png`.
- **Site web** : `https://magpin.pages.dev`.
- **Support** : `getmagpin@gmail.com`.

**3.5 Onglet « Pratiques de confidentialité » (textes prêts, en anglais)**

- **Objectif unique** :

  > Magpin collects the images of the Pinterest, Are.na, Cosmos or Savee board open in the current tab, when the user asks, so they can paste them into Figma as a moodboard (with the Magpin Figma plugin) or download them as a ZIP.

- **Justification de chaque permission** :

  | Permission | Justification |
  | --- | --- |
  | `sidePanel` | Magpin's whole interface lives in Chrome's side panel, next to the board. |
  | `scripting` | When the user clicks "Collect this board", Magpin runs its reader on that board page to list its images. Nothing runs on a page until the user asks. |
  | `storage` | Keeps the boards the user adds to their moodboard, locally on their computer, until they remove them. |
  | `clipboardWrite` | "Copy for Figma" puts the board on the clipboard, to paste into the Magpin Figma plugin. |
  | `downloads` | "Download ZIP" saves the board's images as a ZIP file. |
  | Hôtes (pinterest.com, are.na, cosmos.so, savee.com) | To read a board page of these sites when the user asks. |
  | Hôte i.pinimg.com | Pinterest's image server doesn't allow cross-origin downloads; this permission lets Magpin download the images for the ZIP. |

- **Code distant** : No, je n'utilise pas de code distant.
- **Données** :
  - Cocher « Website content » : l'extension lit les adresses des images et le titre du board sur la page.
  - Certifier les trois engagements : pas de vente, pas d'usage sans rapport avec la fonction, pas d'usage pour le crédit.
  - Rien n'est envoyé au développeur.
- **URL de la politique de confidentialité** : `https://magpin.pages.dev/privacy`.

**3.6 Distribution**
- ✅ Envoyé pour examen le 11 novembre 2026 (éditeur « Magpin », non-trader, catégorie Art & Design, seul « Website content » déclaré, instructions de test fournies). Il a fallu une adresse de contact vérifiée dans **Settings** avant de pouvoir envoyer. Le compte Google `getmagpin` a la validation en 2 étapes (exigée pour envoyer un ZIP).
- Public, tous les pays, gratuit.
- Envoyer pour examen.
- **Validation** : souvent quelques jours. Elle peut être plus longue, car l'extension demande l'accès à des sites entiers (pinterest.com…).

Description Chrome Web Store (anglais, prête à coller) :

> Your next moodboard is one paste away.
>
> Magpin collects every image of a board from Pinterest, Are.na, Cosmos or Savee, at full size, and sends it to Figma as a moodboard sorted by color, with its palette.
>
> • Open a board, click Magpin, then Collect this board.
> • Uncheck what you don't want, then Copy for Figma.
> • In Figma, run the free Magpin plugin and paste: Grid, Mosaic or Colors layouts, palette of 3 to 8 colors, color variables.
>
> Add several boards to one moodboard (duplicates left out), or download them as a ZIP.
>
> Free and unlimited. No account, no tracking, no Magpin server.

---

## 4. Une fois les URLs connues, puis après validation

1. **`apps/site/src/links.ts`** : mettre `CHROME_STORE_URL` et `FIGMA_PLUGIN_URL`, puis pousser. Le site se redéploie tout seul.
2. **`apps/extension/src/config.ts`** : si l'URL du plugin n'y était pas au moment de l'envoi, publier la version 1.0.1 avec la bonne URL.
3. **Git** :

```bash
git tag v1.0.0 && git push --tags
```

   Puis créer une Release GitHub et y joindre le ZIP de l'extension.
4. **Vérifier en vrai**, depuis le site : installer l'extension, collecter un board, coller dans Figma.

---

## 5. Visuels à produire

| Pour | Format | Contenu suggéré |
| --- | --- | --- |
| Chrome Web Store, captures (1 à 5) | 1280 × 800 | Le panneau sur un board, le panneau prêt avec Copy for Figma, le moodboard dans Figma, la vue Colors avec palette |
| Chrome Web Store, petite vignette | 440 × 280 | Logo (tête) et « Magpin » |
| Figma, couverture | 1920 × 960 | Le moodboard trié et sa palette, avec le titre |
| Figma, icône | 128 × 128 | Déjà prête : `assets/logo/head-sticker-128.png` |
| Partage du site | 1200 × 630 | Fait : `apps/site/public/og-image.png` |
