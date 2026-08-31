# ACVTC-CI — V1 déployable

Cette livraison transforme le prototype en application web mobile (PWA) avec serveur et base SQLite.

## Fonctions déjà codées
- Authentification par rôle
- Chauffeurs et matricules par section
- Abidjan, Bouaké, Yamoussoukro
- Cotisation 500 FCFA/mois
- Pénalité unique 200 FCFA après deux semaines
- Déclaration Wave / Orange Money
- Confirmation réservée aux rôles PRESIDENT et TRESORIER
- Historique des paiements
- QR code membre sans numéro complet du permis
- Journal d'audit
- Tableau de bord
- PWA installable

## Lancer localement
1. Installer Node.js 20+.
2. Dans le dossier : `npm install`
3. Définir une vraie clé : `JWT_SECRET=une-cle-longue-et-secrete`
4. Lancer : `npm start`
5. Ouvrir http://localhost:3000

Comptes de démonstration :
- Chauffeur : ACVTC-ABJ-0001 / 1234
- Président : PRESIDENT / 1234

## Avant mise en production
- Remplacer tous les codes de démonstration.
- Héberger derrière HTTPS.
- Utiliser une clé JWT secrète fournie par l'hébergeur.
- Mettre en place sauvegardes et politique de confidentialité.
- Ajouter les comptes Vice-président, Secrétaire, Trésoriers, Délégués et Adjoints.
- Configurer le numéro officiel Wave / Orange Money dans les paramètres privés.
- Pour validation automatique des paiements, utiliser uniquement une API officielle du fournisseur. Sinon conserver la validation manuelle Président/Trésorier.
- Migrer SQLite vers PostgreSQL si le nombre d'utilisateurs/connexions augmente fortement.

## Important
Le numéro de paiement de l'association n'est volontairement pas codé en dur dans les fichiers distribués. Il doit être ajouté comme paramètre sécurisé lors du déploiement.
