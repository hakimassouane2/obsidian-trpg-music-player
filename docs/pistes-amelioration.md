# Pistes d'amélioration

Idées validées en principe mais pas encore développées.

## Onglet « Rechercher » dans la Bibliothèque

La recherche YouTube intégrée vit aujourd'hui dans deux champs : le one-shot du
lecteur (trouver et jouer tout de suite, en pleine partie) et la modale « Ajouter
une piste » (trouver et ranger). Les deux s'appuient sur le même composant,
`YoutubeSearchPanel`.

Pour de longues sessions de « shopping musical » en préparation de séance, un onglet
dédié dans la vue Bibliothèque serait plus confortable : plus de place pour les
résultats, catégorisation (humeur, lieu, intensité) directement sur chaque résultat,
ajout en série sans rouvrir la modale. Le composant est déjà prêt à être branché
ailleurs, il faudrait surtout un troisième mode (`'library'`) avec ses propres actions.
