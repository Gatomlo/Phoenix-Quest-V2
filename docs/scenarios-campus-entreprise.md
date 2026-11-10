# Déclinaisons « campus » et « entreprise » du scénario Hamlet

Deux scénarios dérivés de `game/scenarios/hamlet/` : `campus` (université, ton léger et humoristique, public étudiant) et `entreprise` (Phoenix Tech, ton plus thriller sans être glauque, public salariés).

**Mécanique strictement identique à Hamlet** : mêmes 80 étapes (32 lieux, 25 objets, 23 personnes), mêmes identifiants, mêmes QR codes (`code`), mêmes cadenas et codes, mêmes `toAdd` / `toRemove` / `needBefore` / `toAssociate` / `replaceBy`, même minuteur (2 h), mêmes règles et indices. Seuls les textes (`name`, `description`, `hint`), le titre et l'introduction ont changé. Les noms de fichiers d'images sont conservés.

## Transposition

| Hamlet (ferme) | Campus | Entreprise |
|---|---|---|
| Ranch du Phoenix | Campus du Phoenix | Phoenix Tech |
| Hamlet, le cheval disparu | **Pégase**, mascotte (costume de cheval ailé blanc) | **Hamlet**, disque sécurisé avec les données des nouveaux projets, produits et prototypes |
| Box d'Hamlet | Loge de Pégase | Salle sécurisée |
| Carte de voeux | Trombinoscope | Organigramme |
| Enclos des animaux | Atelier technique | Local technique |
| Yourte | Bureau de la direction | Bureau de la direction |
| Plaine de jeux | Foyer étudiant | Espace détente |
| Forêt-jardin | La bibliothèque | Les archives |
| Serre | Bureau d'Aude | Bureau d'Aude |
| Solarium | Hall central | Hall central |
| Zone pique-nique | La cafétéria | La cafétéria |
| Canopée | Le coin tranquille | Le coin tranquille |
| Labyrinthe de maïs | Dédale de couloirs | Dédale de couloirs |
| Vestiaire et casiers | Vestiaire et casiers | Vestiaire et casiers |
| Cuisine et réserve | Cuisine de la cafétéria et réserve | Cuisine du personnel et réserve |
| Ruf, le chien de Mika | Ruf, le chien de Mika | Ruf, le chien de Mika |
| Jack Lay, concierge, ex-jockey (1978) | Concierge, ex-champion de pétanque inter-universités (1978) | Concierge, ex-pilote de rallye (1978) |
| Mika Nard, soigneur | Responsable de la maintenance | Responsable de la maintenance et de l'informatique |
| Julian Immator, animation | Responsable de la vie étudiante | Responsable des ressources humaines |
| Josette Fruisec, directrice (coupable) | Directrice du campus | Directrice générale |
| Gérard Manswaf, barman (pièce de théâtre) | Barman (comédie musicale refusée par le théâtre) | Barista (start-up refusée par l'incubateur) |
| Aude Hergine, maraîchère | Bibliothécaire | Responsable des archives et de la documentation |

Les six noms de personnages sont conservés dans les deux versions (faciles à renommer dans le JSON si besoin).

Mobile des aveux de Josette : campus = « un cheval blanc pour enlever l'amour de ma vie » (Pégase est un cheval ailé blanc) ; entreprise = Mika annonce son départ chez un concurrent, Josette veut faire échouer la présentation aux investisseurs pour le retenir.

## Principe : déployable partout

Les lieux et métiers sont volontairement génériques pour qu'on puisse jouer sur n'importe quel campus ou dans n'importe quelle entreprise : accueil, hall central, bureau de la direction, cafétéria et cuisine, local technique, bibliothèque ou archives, vestiaire et casiers, parking, coin tranquille. Pas de jardin, de serre, d'animalerie, de salle serveurs ni de toit-terrasse. Chaque lieu du scénario correspond à un endroit réel du site, avec un QR code collé dessus ; le choix des endroits est libre tant que l'enchaînement reste le même.

## Solutions des cadenas (identiques dans les deux versions)

| Étape | Type | Solution |
|---|---|---|
| 8 | date (mm/jj/aaaa) | `04/04/2019` |
| 54 | couleurs | `F06292, F06292, 0c9411, 0c9411, 0c9411, fafa1e, ff8d0d, 0b30d9, 0b30d9, 7B1FA2` (rose ×2, vert ×3, jaune, orange, bleu ×2, violet) |
| 41 | directionnel | `n, e, o, e, n, o, o` |
| 76 | chiffres | `1978` |
| 82 | schéma | `14789623` |
| 94 | fusibles (4×4, ligne par ligne) | `ON ON OFF OFF / OFF ON ON ON / ON ON OFF OFF / OFF ON OFF OFF` |
| 43, 149 | sélecteurs | positions des casiers (31, 38, 39, 45) et des 6 portraits (150 à 155), inchangées |
| 42, 52, 71, 92 | avec objet | trousseau de clés (12) ou clé du van (90) |

## Visuels à refaire

Les dossiers `campus/img` et `entreprise/img` contiennent pour l'instant **les images de Hamlet** (ferme), pour que les scénarios se lancent. Chaque fichier doit être remplacé par un visuel du nouvel univers, **sous le même nom**. Le tableau en fin de document liste tous les fichiers avec leur étape.

### Visuels qui portent une énigme (contraintes à respecter)

- ** (journal / cahier d'Aude) et  (calendrier)** : le journal montre lisibles le jour « 04 » et l'année « 2019 », le mois étant effacé par des taches ; le calendrier donne le mois.
  - *Campus* : journal de la bibliothécaire : « premier événement : la Semaine de la science » ; calendrier des événements du campus, avec la Semaine de la science en **avril** (un événement par mois, février à juillet).
  - *Entreprise* : cahier de notes : « premier prototype présenté au salon Innov'Expo » ; calendrier des salons professionnels, avec Innov'Expo en **avril** (un salon par mois, février à juillet).
- **`img13.png` (affiche) et `img205.png` (post-it)** : six pastilles de couleur avec un ratio chacune, plus l'ordre de la tournée avec les quantités. Les valeurs doivent rester celles d'Hamlet pour donner la séquence de couleurs :
  - rose : 2 rations pour 3 unités ; vert : 1 ration pour 5 ; jaune : 1 ration pour 2 ; orange : 1/2 ration par unité ; bleu : 1 ration par unité ; violet : 1 ration pour 3.
  - post-it, dans l'ordre : 3 rose, 15 vert, 2 jaune, 2 orange, 2 bleu, 3 violet.
  - *Campus* : équipements du campus : amphithéâtres (rose), ordinateurs (vert), imprimantes (jaune), bornes wifi (orange), vidéoprojecteurs (bleu), salles de TP (violet). Les « rations » deviennent des « lots de matériel de rechange ».
  - *Entreprise* : équipements : salles de réunion (rose), téléphones (vert), imprimantes (jaune), bornes wifi (orange), serveurs ou écrans (bleu), postes de travail (violet).
- **`img35.png` (journal / cahier d'Aude) et `img27.png` (calendrier)** : le journal montre lisibles le jour « 04 » et l'année « 2019 », le mois étant effacé par des taches ; le calendrier donne le mois.
  - *Campus* : journal de la bibliothécaire : « premier événement : la Semaine de la science » ; calendrier des événements du campus, avec la Semaine de la science en **avril** (un événement par mois, février à juillet).
  - *Entreprise* : cahier de notes : « premier prototype présenté au salon Innov'Expo » ; calendrier des salons professionnels, avec Innov'Expo en **avril** (un salon par mois, février à juillet).
- **`img18.png` (polaroïd de Jack)** : l'année **1978** doit être lisible. Campus : victoire à un tournoi de pétanque inter-universités. Entreprise : victoire à un rallye automobile.
- **`img81.png` (plan)** : 9 lieux emblématiques disposés en grille 3×3, reliés par le même réseau de chemins que le plan d'Hamlet : c'est ce tracé qui donne la figure `1-4-7-8-9-6-2-3` du smartphone (étape 82). Les points sont numérotés de 1 (haut gauche) à 9 (bas droite).
- **`img98.png` (mode d'emploi du van)** : grilles 4×4 identiques à Hamlet pour Manuel, Ouvert et Passerelle arrière (renommable « Hayon arrière »). Manuel + Ouvert + arrière donnent le code des fusibles.
- **`img28.png` (labyrinthe, étapes 28, 34, 40, 41)** : vue d'un couloir avec embranchements. Le trajet est nord, est, ouest, est, nord, ouest, ouest.
- **`img43.png` (vestiaire) et `img149.png` (policier)** : les zones cliquables sont à des positions fixes en pixels (4 casiers à gauche et à droite du vestiaire ; 6 portraits en 2 rangées de 3 pour le policier). Garder la même composition. Les six portraits sont ceux des suspects : Aude, Josette, Julian, Gérard, Jack, Mika.

### Personnages et lieux

Les images de personnages (`img4`, `img6`, `img6B`, `img9`, `img9bis`, `img16`, `img58`, `img23`, `img23B`, `img74`, `img80`, `img150` à `img155`) restent des portraits des mêmes six personnages, en tenue du nouveau métier. Les lieux (`img0`, `img1`, `img3`, `img5`, `img7`, `img11`, `img20`, `img25`, `img26`, `img42`, `img52`, `img53`, `img55`, `img71`, `img73`, `img79`, `img83`, `img92`, `img93`, `img99`) sont à redessiner selon le tableau de transposition. `map.png` (carte) et `rules.png` (règles) sont à refaire aussi.

### Tous les fichiers

| Fichier | Étape | Type | Hamlet | Campus | Entreprise |
|---|---|---|---|---|---|
| `img0.png` | 0 | location | Accueil | Accueil | Accueil |
| `img1.png` | 1 | location | Box d'Hamlet | Loge de Pégase | Salle sécurisée |
| `img2.png` | 2 | object | Carte de voeux | Trombinoscope | Organigramme |
| `img3.png` | 3 | location | Enclos des animaux | Atelier technique | Local technique |
| `img4.png` | 4 | person | Jack Lay | Jack Lay | Jack Lay |
| `img5.png` | 5 | location | Yourte | Bureau de la direction | Bureau de la direction |
| `img6.png` | 6 | person | Mika Nard | Mika Nard | Mika Nard |
| `img7.png` | 7 | location | Plaine de jeux | Le foyer étudiant | Espace détente |
| `img9.png` | 9 | person | Julian Immator | Julian Immator | Julian Immator |
| `img10.png` | 10 | object | Un livre | Un livre | Un livre |
| `img11.png` | 11 | location | Solarium | Hall central | Hall central |
| `img12.png` | 12 | object | Trousseau de clés | Trousseau de clés | Trousseau de clés |
| `img13.png` | 13 | object | Affiche | Affiche | Affiche |
| `img14.png` | 14 | object | Affiche du spectacle | Affiche du spectacle | Affiche de la soirée pitch |
| `img15.png` | 15 | object | Ruf le chien | Ruf le chien | Ruf le chien |
| `img16.png` | 16 | person | Josette Fruisec | Josette Fruisec | Josette Fruisec |
| `img17.png` | 17 | object | Une caisse de chips | Une caisse de chips | Une caisse de chips |
| `img18.png` | 18 | object | Polaroïd de Jack | Polaroïd de Jack | Polaroïd de Jack |
| `img19.png` | 19 | object | Une collection de livres | Une collection de livres | Une collection de livres |
| `img20.png` | 20 | location | Zone Pique-Nique | La cafétéria | La cafétéria |
| `img23B.png` | 21 | person | Gérard Manswaf | Gérard Manswaf | Gérard Manswaf |
| `img23.png` | 23 | person | Gérard Manswaf | Gérard Manswaf | Gérard Manswaf |
| `img23B.png` | 24 | person | Gérard Manswaf | Gérard Manswaf | Gérard Manswaf |
| `img25.png` | 25 | location | Zone de rassemblement | Point de rassemblement | Point de rassemblement |
| `img26.png` | 26 | location | Chemin vers le vestiaire | Chemin vers le vestiaire | Chemin vers le vestiaire |
| `img27.png` | 27 | object | Un calendrier de plantations | Un calendrier des événements | Un calendrier des salons |
| `img28.png` | 28 | location | Labyrinthe-1 | Labyrinthe-1 | Labyrinthe-1 |
| `img31.png` | 31 | location | Casier de Gérard | Casier de Gérard | Casier de Gérard |
| `img34.png` | 34 | location | Labyrinthe-2 | Labyrinthe-2 | Labyrinthe-2 |
| `img35.png` | 35 | object | Le journal d'Aude | Le journal d'Aude | Le cahier d'Aude |
| `img38.png` | 38 | location | Casier de Jack | Casier de Jack | Casier de Jack |
| `img39.png` | 39 | location | Casier de Mika | Casier de Mika | Casier de Mika |
| `img28.png` | 40 | location | Labyrinthe-3 | Labyrinthe-3 | Labyrinthe-3 |
| `img28.png` | 41 | location | Chemin vers Le vestiaire | Chemin vers Le vestiaire | Chemin vers Le vestiaire |
| `img42.png` | 42 | location | Le vestiaire | Le vestiaire | Le vestiaire |
| `img43.png` | 43 | location | Le vestiaire | Le vestiaire | Le vestiaire |
| `img44.png` | 44 | object | Nourriture pour animaux | Caisse de matériel | Caisse de matériel |
| `img45.png` | 45 | location | Casier de Josette | Casier de Josette | Casier de Josette |
| `img6B.png` | 47 | person | Mika Nard | Mika Nard | Mika Nard |
| `img48.png` | 48 | object | Un badge | Un badge | Un badge |
| `img52.png` | 52 | location | Cuisine | Cuisine | Cuisine |
| `img53.png` | 53 | location | Dans la cuisine | Dans la cuisine | Dans la cuisine |
| `img43.png` | 54 | location | Réserve | Réserve | Réserve |
| `img55.png` | 55 | location | Réserve | Réserve | Réserve |
| `img9bis.png` | 56 | person | Julian Immator | Julian Immator | Julian Immator |
| `img16.png` | 57 | person | Josette Fruisec | Josette Fruisec | Josette Fruisec |
| `img58.png` | 58 | person | Josette Fruisec | Josette Fruisec | Josette Fruisec |
| `img16.png` | 59 | person | Josette Fruisec | Josette Fruisec | Josette Fruisec |
| `img205.png` | 205 | object | Un post-it | Un post-it | Un post-it |
| `img71.png` | 71 | location | Serre | Bureau d'Aude | Bureau d'Aude |
| `img72.png` | 72 | object | Facture de location | Facture de location | Facture de location |
| `img73.png` | 73 | location | Canopée | Le coin tranquille | Le coin tranquille |
| `img74.png` | 74 | person | Jack Lay | Jack Lay | Jack Lay |
| `img74.png` | 75 | person | Jack Lay | Jack Lay | Jack Lay |
| `img76.png` | 76 | object | Le journal de Jack | Le journal de Jack | Le carnet de Jack |
| `img77.png` | 77 | object | L'agenda de Josette | L'agenda de Josette | L'agenda de Josette |
| `img79.png` | 79 | location | La forêt-jardin | La bibliothèque | Les archives |
| `img80.png` | 80 | person | Aude Hergine | Aude Hergine | Aude Hergine |
| `img81.png` | 81 | object | Plan de la propriété | Plan du campus | Plan des locaux |
| `img83.png` | 83 | location | La serre | Le bureau d'Aude | Le bureau d'Aude |
| `img84.png` | 84 | object | Un smartphone | Un smartphone | Un smartphone |
| `img90.png` | 90 | object | Une clé | Une clé | Une clé |
| `img91.png` | 91 | object | Une photo de Mika | Une photo de Mika | Une photo de Mika |
| `img92.png` | 92 | location | Parking | Parking | Parking |
| `img93.png` | 93 | location | Parking | Parking | Parking |
| `img97.png` | 97 | object | Des empreintes | Des empreintes | Des empreintes |
| `img98.png` | 98 | object | Mode d'emploi du van | Mode d'emploi du van | Mode d'emploi du van |
| `img99.png` | 99 | location | Parking | Parking | Parking |
| `img6B.png` | 144 | person | Mika Nard | Mika Nard | Mika Nard |
| `img149.png` | 149 | person | Le policier | Le policier | Le policier |
| `img150.png` | 150 | person | Accuser Aude ! | Accuser Aude ! | Accuser Aude ! |
| `img151.png` | 151 | person | Accuser Josette ! | Accuser Josette ! | Accuser Josette ! |
| `img152.png` | 152 | person | Accuser Julian ! | Accuser Julian ! | Accuser Julian ! |
| `img153.png` | 153 | person | Accuser Gérard ! | Accuser Gérard ! | Accuser Gérard ! |
| `img154.png` | 154 | person | Accuser Jack ! | Accuser Jack ! | Accuser Jack ! |
| `img155.png` | 155 | person | Accuser Mika ! | Accuser Mika ! | Accuser Mika ! |
| `img156.png` | 156 | location | Le policier | Le policier | Le policier |
