/**
 * Built-in dictionaries for Word Chain. A played word must be in the chosen language's list
 * (or be a regular plural of a listed word). Words are school-friendly and well known to young players.
 * Matching ignores case and accents, so "eleve", "élève" and "ÉLÈVE" are the same word.
 */

const EN = `
able about above accept accident across act action actor add address adult adventure afraid afternoon age agree air
airport alarm album alien alive almond alphabet amazing ambulance anchor angel anger angle angry animal ankle answer ant
apple april apron arch arm armchair army arrow art artist ask astronaut atom attic aunt author autumn avocado award awake axe

baby back bacon badge bag bake baker balance ball balloon banana band bank barn basket bat bath battery beach bean bear
beard beat beautiful bed bee beetle begin bell belt bench berry bicycle big bird birthday biscuit black blanket blue board
boat body bone book boot bottle bowl box boy brain branch brave bread break breakfast brick bridge bright bring brother
brown brush bubble bucket build bus butter butterfly button buy

cabbage cabin cactus cake calendar camel camera camp candle candy canoe cap captain car card carpet carrot carry castle cat
catch cave ceiling cello chair chalk change cheese chef cherry chess chicken child chocolate circle city class clean clock
cloud clown coat coffee coin cold color comb comet computer cook cookie corn cotton count country cousin cow crab crayon
cream crocodile crown cry cup curtain cushion

daisy dance danger dark daughter day deep deer delicious dentist desert desk dessert detective diamond diary dice
different dig dinner dinosaur dirt dish dive doctor dog doll dolphin donkey door dot dove down dozen dragon draw drawer
dream dress drink drive drop drum dry duck dust

eagle ear early earth east easy eat echo eclipse edge eel egg eight elbow election electric elephant elevator eleven elf
emerald emotion emperor empty end energy engine engineer enjoy enormous enter entrance envelope equal equator eraser error
escape essay evening event evil exam example exciting excuse exercise exit expensive expert explain explore eye

face fact factory fair fairy fall family famous fan farm farmer fast father feather feet fence field fig film finger fire
fish five flag flame flower fly fog food foot forest fork fox friend frog fruit fun funny

galaxy game garage garbage garden garlic gate gentle ghost giant gift giraffe girl glass glitter globe glove glue goal goat
gold good goose grandma grandpa grape grass gravity green ground group grow guess guitar gum

habit hair hammer hamster hand handle happy harbor harp hat hawk head heart hedgehog helicopter hello helmet help hen hero
hill hippo history hobby hole holiday home honest honey hope horse hospital hot hotel hour house hug hungry hunt hurry

ice icicle idea igloo image imagine inch insect inside invent iron island itch ivory ivy

jacket jaguar jam jar jazz jeans jelly jet jewel job joke journey joy juice jump jungle

kangaroo kayak keep kettle key kick kid kind king kitchen kite kitten kiwi knee knife knight knot koala

label lace ladder lady lake lamp land laptop large laugh lava lawn leaf learn leg lemon leopard lesson letter lettuce
library light lily line lion lip list listen little lizard lobster lock lollipop long luck lunch

machine magic magnet mango map marble market mask meal medal melon metal milk mirror money monkey monster moon morning
mother motor mountain mouse mouth movie mud muffin museum music

nail name nap napkin narrow nature near neck needle neighbor nephew nest net never new news niece night nine noise noodle
noon north nose note notebook number nurse nut

oak oar ocean octopus office oil old olive one onion open orange orbit orchestra ostrich otter oven owl ox oxygen

paint pancake panda paper parent park parrot party pasta peach peanut pear pen pencil penguin people pepper piano picnic
picture pig pillow pilot pink pizza planet plant plate play pocket poem police pond potato pumpkin puppy purple puzzle

quack queen question quick quiet quilt quiz

rabbit raccoon race radio radish raft rain rainbow rat read recipe red reef rescue rest rhino ribbon rice riddle ride ring
river road robot rock rocket roof room root rope rose round rubber ruler run

sad sail salad salt sand sandwich sauce scarf school science scissors screen sea season secret seed seven shadow shape
shark sheep shell shine ship shirt shoe shop shoulder silence silver sing sister skate skirt sky sleep slide smile smoke
snail snake snow soap sock sofa soft soldier song sound soup space spider spoon spring square stairs star statue stone
storm strawberry street student sugar summer sun sweater swim

table tail tall target taste taxi tea teacher team teeth telephone ten tent thank thumb ticket tickle tidy tie tiger time
tiny tired title toast today toe together tomato tongue tooth topic torch tornado tortoise touch towel tower town toy
tractor train travel treasure tree triangle truck trumpet try tulip tunnel turkey turtle twelve twin two

ugly umbrella uncle under uniform unicorn universe up upset use useful

vacation valley van vase vegetable velvet very vest village violin visit voice volcano vote

wagon walk wall want warm wash watch water wave week whale wheel white wind window wing winter wolf woman wood world worm
write

xylophone

yacht yard yawn year yellow yes yesterday yogurt yolk young yummy

zebra zero zigzag zip zone zoo zoom
`;

const FR = `
abeille abricot accident acteur aigle aiguille aile aimer air ajouter album aller ami amour ampoule ananas ancre âne ange
animal année anniversaire appareil apprendre araignée arbre arc argent armoire arrosoir art artiste ascenseur assiette
astronaute atelier attendre aube auto automne autruche avion avocat avril

bague baguette baignoire bain balai balançoire baleine balle ballon banane banc bande barbe bateau bâton bébé beurre
bibliothèque bicyclette bien bijou biscuit blanc bleu boire bois boisson boîte bol bonbon bonheur bonnet bord botte bouche
boucle bougie boulanger boule bouteille bouton bras brosse brouillard bruit buisson bureau bus

cabane cadeau café cahier caillou calendrier camion canard canapé carotte carte casque castor cerise chaise chambre champ
chanson chanter chapeau chat château chaud chaussette chemin cheminée chemise cheval cheveu chien chocolat chou ciel
cinéma cirque citron clé classe clown cochon coeur colle collier copain coquillage corde corps couleur couteau crabe craie
crayon crocodile cuillère cuisine

dame danse dauphin dé debout décembre dent dessin dessert devoir diamant dimanche dinosaure dire doigt domino dormir dos
douche douze dragon drapeau droite dune

eau écharpe échelle école écorce écouter écran écrire écureuil effort église électricité élégant éléphant élève emploi
encre enfant énigme énorme ensemble entrée entrer enveloppe épaule épée épice épicerie éponge équipe erreur escalier
escargot espace étagère étang été éternuer étoile étude étudiant éventail évier examen exercice explorer

facteur faim famille farine fée fenêtre fer ferme fête feu feuille fève ficelle fil fille fleur fleuve flèche foin forêt
fourchette fourmi fraise frère frite froid fromage fruit fusée

gant garage garçon gare gâteau gauche gazon genou gilet girafe glace gomme gorille goûter graine grand grenouille grille
gris guitare

habit hamster haricot herbe hérisson heure hibou hier hippopotame histoire hiver homme hôpital horloge huile huit

ici idée igloo île image imaginer immeuble insecte invité iris

jambe jambon janvier jardin jaune jeu jeudi joie joli jouer jouet jour journal journée judo jupe jus

kangourou kayak kilo kiwi koala

lac lait lampe lapin larme lavabo légume lettre lever lèvre lézard libellule lion lire lit livre loup lumière lundi lune
lunettes

magasin mai main maison maître mal maman manger manteau marché mardi marron matin médecin melon mer mère merci midi miel
minute miroir moineau montagne montre mouche mouton mur musique

nager nappe nature navire neige neveu nez nid nièce noël noir noisette nom nombre nord nouille nuage nuit numéro

océan oeil oeuf oie oignon oiseau ombre oncle orange ordinateur oreille oreiller orteil os ours outil

page pain panier pantalon papa papier papillon parapluie parc pastèque pâte patin pêche peigne peinture pelle pendule père
perle perroquet petit peur phare piano pied pierre pingouin pirate piscine placard plage planète plante pluie plume poche
poire poisson pomme pompier pont porte poule poupée prince princesse prune puzzle

quai quart quatre question queue quille

radio radis raisin ramasser rame rangée rat râteau rayon recette regarder reine renard repas requin rêve réveil rideau
rire rivière riz robe robinet robot rocher roi rond ronde rose roue rouge route rue rugby ruisseau

sable sac salade salle samedi sandale sapin sauter savon seau sel semaine serpent serviette singe soeur soir soleil soupe
souris stylo sucre

table tableau taille talon tambour tante tapis tarte tasse taupe taxi télé téléphone tempête temps tente terrain terre
tête thé tigre timbre tiroir tissu toboggan toit tomate tonnerre torchon tortue tour tracteur train travail trésor
triangle trompette trottinette trousse tulipe tuyau

uniforme unique univers usine utile

vache vague valise vélo vendredi vent ventre verre vert veste viande village ville violon visage voiture voix volcan

wagon wapiti

xylophone

yaourt yeux yoyo

zèbre zéro zoo

abri accent acheter adresse affiche agenda agneau aimant alarme algue allumette alphabet ambulance antenne appel arène
armée arrêt atlas aventure avenir avoine
badge balcon bambou bandeau barque bassin batterie berger biche bille blé blouson bocal bonhomme bosse bouc boulangerie
bourgeon bracelet branche brebis brique brindille brioche brouette bulle
cactus cage calme caméra campagne canne canot cantine capitaine caramel carnaval carré cartable casserole cauchemar cave
ceinture cerf cerveau champignon chandelle chariot chèvre chenille cigale cintre cloche clou coccinelle colline colombe
comète concombre confiture coq coquelicot costume coton coude courgette couronne cousin crapaud crêpe cube cygne
dentiste désert dictionnaire dindon docteur dompteur dossier douceur dromadaire
écaille éclair élan empreinte encrier énergie enquête épinard épouvantail équateur érable escabeau espoir étable étage
étiquette expérience
fable falaise fantôme faucon fauteuil feutre figue flaque flamant flocon flûte foire fontaine football forme fouet four
fourneau framboise frein frigo front fumée
galet galette garde gel géant gland globe goéland gorge gourde goutte grain grenier grue guêpe gymnase
hache hamac hameau harpe hélicoptère hêtre hirondelle homard hublot hutte
icône infirmier insigne instrument
jaguar jardinier jeton jonquille journaliste jumeau jumelles
lacet laine laitue lama lanterne lavande légende lessive licorne lierre limace losange loupe luge lutin
machine magicien maillot maïs maîtresse mammouth mandarine mangue manège marmotte marteau masque mélodie menthe meuble
micro miette mille mitaine mollet monde monstre moto moulin moustache muguet musée
navet nénuphar nuque
oasis objet odeur olive ongle orage orchestre orque otarie ouragan ouvrier
paille palmier panda panneau paon paquet parfum passage patate pâtissier pays pelouse pépin phoque pigeon pinceau plafond
plancher plat plongeur poivre police portail potager pouce poussin prairie prison pull
quartier quiche
racine radeau raquette règle renne réponse rhume roche roseau rubis
sabot satellite sauce saucisse saumon scie serre sifflet sirop ski soldat sommet sorcière soucoupe source sourire sport
statue sucette sud surprise
tabouret tache taureau thon tilleul tipi tonneau torche tornade toupie tranche trampoline trèfle tresse tricot trou
troupeau truite tunnel
ustensile
vacances vaisseau valse vase vautour veau velours vendeur verger vernis vigne vipère virgule vitre vitrine voile voilier
volant voleur voyage
zigzag zone
`;

export const WORD_CHAIN_LANGUAGES = { en: "English", fr: "Français" };

/** Lower-case, accents stripped, ligatures expanded: "Œuf" → "oeuf". */
export function normalizeWord(word) {
  return String(word)
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

const DICTIONARIES = {
  en: new Set(EN.split(/\s+/).filter(Boolean).map(normalizeWord)),
  fr: new Set(FR.split(/\s+/).filter(Boolean).map(normalizeWord)),
};

/** Singular candidates for a regular plural, most likely first. */
function singulars(language, word) {
  const out = [];
  if (language === "en") {
    if (word.endsWith("ies")) out.push(`${word.slice(0, -3)}y`);
    if (word.endsWith("ves")) out.push(`${word.slice(0, -3)}f`, `${word.slice(0, -3)}fe`);
    if (word.endsWith("es")) out.push(word.slice(0, -2));
    if (word.endsWith("s")) out.push(word.slice(0, -1));
  } else {
    if (word.endsWith("aux")) out.push(`${word.slice(0, -3)}al`);
    if (word.endsWith("s") || word.endsWith("x")) out.push(word.slice(0, -1));
  }
  return out;
}

/** True when the word (or its regular singular) is in the language's dictionary. */
export function isKnownWord(language, word) {
  const dict = DICTIONARIES[language];
  if (!dict) return false;
  const normalized = normalizeWord(word);
  return dict.has(normalized) || singulars(language, normalized).some((w) => dict.has(w));
}

export function dictionarySize(language) {
  return DICTIONARIES[language]?.size ?? 0;
}
