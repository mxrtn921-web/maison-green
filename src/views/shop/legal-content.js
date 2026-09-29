// Contenus légaux — modèles à faire relire et compléter (les mentions entre crochets sont à renseigner).
// {adresse}, {email}, {contact}, {editeur}, {tva}, {gerant} et {mediateur} sont remplacés par les informations
// saisies dans Admin → Horaires (« Coordonnées » et « Informations légales »), voir src/routes/account.js.
export const LEGAL = {
  '/mentions-legales': {
    title: 'Mentions légales',
    sections: [
      ['Éditeur du site', ['{editeur}', 'Numéro de TVA intracommunautaire : {tva}. Directeur de la publication : {gerant}.', 'Contact : {contact}.']],
      ['Hébergement', ['Le site est hébergé par Railway Corporation, San Francisco, Californie (États-Unis) — https://railway.com.']],
      ['Propriété intellectuelle', ['La marque Maison Green, son logo et les contenus du site sont la propriété de Maison Green. Toute reproduction sans autorisation est interdite.']],
    ],
  },
  '/cgu': {
    title: 'Conditions générales d’utilisation',
    sections: [
      ['Objet', ['Les présentes conditions encadrent l’accès et l’utilisation du site Maison Green, que vous passiez commande ou non. En naviguant sur le site, vous les acceptez. Les achats sont régis par nos conditions générales de vente (lien « Conditions de vente » en bas de chaque page).']],
      ['Accès au site', ['Le site est accessible gratuitement, 7 jours sur 7. Maison Green peut l’interrompre pour maintenance ou en cas de force majeure, sans que sa responsabilité puisse être engagée.']],
      ['Compte client', ['La création d’un compte est facultative. Vous êtes responsable de la confidentialité de votre mot de passe et des informations que vous renseignez, qui doivent être exactes. Vous pouvez supprimer votre compte à tout moment depuis votre espace personnel.']],
      ['Utilisation du site', ['Il est interdit d’utiliser le site de manière frauduleuse : fausses commandes, tentative d’intrusion, envoi automatisé de formulaires, collecte des données d’autres utilisateurs. Maison Green peut suspendre un compte ou refuser une commande en cas d’abus.']],
      ['Responsabilité', ['Les photos et descriptions des produits sont les plus fidèles possible, sans valeur contractuelle pour les variations naturelles (taille, couleur, poids des produits frais). Maison Green n’est pas responsable des interruptions dues à votre connexion ou à votre appareil.']],
      ['Propriété intellectuelle', ['Les textes, photos, logos et le design du site appartiennent à Maison Green. Toute reproduction, même partielle, est interdite sans autorisation écrite.']],
      ['Données personnelles et cookies', ['Le traitement de vos données est détaillé dans notre politique de confidentialité (lien « Confidentialité » en bas de chaque page). Le site n’utilise que des cookies nécessaires à son fonctionnement et une mesure d’audience anonyme, sans cookie.']],
      ['Droit applicable', ['Les présentes conditions sont soumises au droit français. En cas de litige, une solution amiable sera recherchée en priorité ({contact}).']],
    ],
  },
  '/cgv': {
    title: 'Conditions générales de vente',
    sections: [
      ['Objet', ['Les présentes conditions régissent les ventes de produits d’épicerie effectuées sur le site Maison Green, avec livraison à domicile dans les zones desservies.']],
      ['Commande', ['La commande est ferme après validation et, pour le paiement par carte, après confirmation du paiement. Le client suit ensuite sa commande en direct sur la page de suivi du site (ou depuis son compte).', 'Maison Green se réserve le droit d’annuler une commande en cas de rupture de stock ; le client est alors remboursé intégralement.']],
      ['Prix et paiement', ['Les prix sont indiqués en euros TTC. Les frais de livraison dépendent de la zone et sont affichés avant la validation.', 'Le paiement s’effectue uniquement par carte bancaire via notre prestataire Stripe, au moment de la commande. Maison Green ne conserve aucune donnée bancaire.']],
      ['Livraison', ['La livraison a lieu dans le créneau choisi. En cas d’absence, le livreur tente de joindre le client par téléphone. Les produits frais ne peuvent pas être laissés sans instruction explicite du client.']],
      ['Droit de rétractation', ['Conformément à l’article L221-28 du Code de la consommation, le droit de rétractation ne s’applique pas aux denrées périssables. Pour les autres produits, contactez-nous sous 14 jours.']],
      ['Réclamations', ['Tout produit manquant ou abîmé doit être signalé dans les 24 heures ({contact}). Il sera remboursé ou remplacé. Médiateur de la consommation : {mediateur}.']],
    ],
  },
  '/confidentialite': {
    title: 'Politique de confidentialité',
    sections: [
      ['Responsable du traitement', ['Maison Green, {adresse} — {email}.']],
      ['Données collectées et finalités', ['Identité, coordonnées, adresse de livraison et instructions : nécessaires à l’exécution de votre commande (base légale : contrat).', 'Historique de commandes : gestion du service client et obligations comptables (base légale : obligation légale).', 'Adresse e-mail pour les actualités : uniquement si vous l’avez accepté (base légale : consentement, retirable à tout moment).']],
      ['Destinataires', ['Nos équipes (préparation et livraison), notre prestataire de paiement Stripe (qui traite seul vos données bancaires) et notre hébergeur. Aucune donnée n’est vendue.']],
      ['Durées de conservation', ['Compte client : jusqu’à sa suppression, ou 3 ans après la dernière commande. Commandes : 10 ans (obligation comptable), anonymisées si vous supprimez votre compte. Commandes sans compte : 3 ans.']],
      ['Mesure d’audience', ['Nous comptons les pages vues de façon anonyme, sans cookie et sans conserver votre adresse IP : seuls des totaux (pages consultées, type d’appareil, site d’origine) sont enregistrés, pour améliorer le site. Cette mesure est exemptée de consentement (recommandations de la CNIL).']],
      ['Cookies', ['Nous n’utilisons qu’un cookie de session strictement nécessaire (connexion) et le stockage local de votre navigateur pour mémoriser votre panier. Aucun cookie publicitaire ni de mesure d’audience : aucun bandeau de consentement n’est donc nécessaire.']],
      ['Vos droits', ['Vous disposez des droits d’accès, de rectification, d’effacement, de portabilité, de limitation et d’opposition. Depuis votre compte, vous pouvez exporter vos données et supprimer votre compte en un clic. Vous pouvez aussi nous écrire, ou saisir la CNIL (cnil.fr).']],
      ['Sécurité', ['Mots de passe chiffrés (scrypt), connexions sécurisées (HTTPS), accès aux données limité par rôle, paiements traités par un prestataire certifié PCI-DSS.']],
    ],
  },
};
