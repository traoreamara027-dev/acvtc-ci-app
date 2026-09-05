ACVTC-CI — VERSION 5
====================

Cette version contient :
- connexion principale par numéro de téléphone + code SMS ;
- ancien accès e-mail conservé temporairement pour les comptes V4 ;
- création d'un membre simple par tous les administrateurs ;
- création d'un administrateur réservée au Président ;
- numéro de membre automatique par section ;
- carte de membre automatique avec photo + QR code sécurisé ;
- vérification publique du QR code ;
- messages aux conducteurs ;
- actualités VTC Côte d'Ivoire & monde ;
- archivage des procès-verbaux par le Secrétariat / Président ;
- cotisations et espace Finances conservés ;
- nouveau design ACVTC-CI bleu marine / rouge / blanc ;
- PWA installable sur téléphone.

ORDRE D'INSTALLATION
--------------------
1. Dans Supabase > SQL Editor, exécuter entièrement le fichier supabase_v5.sql.
2. Dans Supabase > Authentication > Providers, activer Phone/SMS et configurer un fournisseur SMS compatible.
3. Remplacer les fichiers du dépôt GitHub par ceux de ce dossier :
   index.html, style.css, app.js, manifest.json, sw.js, vercel.json, package.json,
   logo-acvtc.png, icon-192.png, icon-512.png.
4. Vercel redéploiera automatiquement le projet si GitHub est relié à Vercel.
5. Tester d'abord avec le compte Président, puis créer un membre test via Membres > Ajouter un membre simple.
6. Le membre se connecte avec son numéro de téléphone ; son profil et son numéro membre sont générés automatiquement.

IMPORTANT
---------
Le téléphone devient le mode principal de connexion. Le code SMS nécessite qu'un fournisseur SMS soit configuré dans Supabase.
L'ancien accès e-mail reste disponible dans un menu discret pour éviter de bloquer les administrateurs V4 pendant la migration.
