// Contenus légaux — modèles à faire relire et compléter (les mentions entre crochets sont à renseigner).
// {adresse}, {email} et {contact} sont remplacés par les coordonnées saisies dans l'admin (src/lib/shop.js).
export const LEGAL = {
  '/mentions-legales': {
    title: 'Mentions légales',
    sections: [
      ['Éditeur du site', ['Maison Green, [forme juridique] au capital de [montant] €, immatriculée au RCS de Rouen sous le numéro [SIREN], dont le siège est situé {adresse}.', 'Numéro de TVA intracommunautaire : [à compléter]. Directeur de la publication : [nom du gérant].', 'Contact : {contact}.']],
      ['Hébergement', ['[Nom de l’hébergeur, adresse, téléphone] — par exemple Render, Railway, Scaleway ou OVHcloud.']],
      ['Propriété intellectuelle', ['La marque Maison Green, son logo et les contenus du site sont la propriété de Maison Green. Toute reproduction sans autorisation est interdite.']],
    ],
  },
  '/cgv': {
    title: 'Conditions générales de vente',
    sections: [
      ['Objet', ['Les présentes conditions régissent les ventes de produits d’épicerie effectuées sur le site Maison Green, avec livraison à domicile dans les zones desservies.']],
      ['Commande', ['La commande est ferme après validation et, pour le paiement par carte, après confirmation du paiement. Un e-mail de confirmation contenant un lien de suivi est adressé au client.', 'Maison Green se réserve le droit d’annuler une commande en cas de rupture de stock ; le client est alors remboursé intégralement.']],
      ['Prix et paiement', ['Les prix sont indiqués en euros TTC. Les frais de livraison dépendent de la zone et sont affichés avant la validation.', 'Le paiement s’effectue par carte bancaire via notre prestataire Stripe, ou en espèces à la livraison. Maison Green ne conserve aucune donnée bancaire.']],
      ['Livraison', ['La livraison a lieu dans le créneau choisi. En cas d’absence, le livreur tente de joindre le client par téléphone. Les produits frais ne peuvent pas être laissés sans instruction explicite du client.']],
      ['Droit de rétractation', ['Conformément à l’article L221-28 du Code de la consommation, le droit de rétractation ne s’applique pas aux denrées périssables. Pour les autres produits, contactez-nous sous 14 jours.']],
      ['Réclamations', ['Tout produit manquant ou abîmé doit être signalé dans les 24 heures ({contact}). Il sera remboursé ou remplacé. Médiateur de la consommation : [à compléter].']],
    ],
  },
  '/confidentialite': {
    title: 'Politique de confidentialité',
    sections: [
      ['Responsable du traitement', ['Maison Green, {adresse} — {email}.']],
      ['Données collectées et finalités', ['Identité, coordonnées, adresse de livraison et instructions : nécessaires à l’exécution de votre commande (base légale : contrat).', 'Historique de commandes : gestion du service client et obligations comptables (base légale : obligation légale).', 'Adresse e-mail pour les actualités : uniquement si vous l’avez accepté (base légale : consentement, retirable à tout moment).']],
      ['Destinataires', ['Nos équipes (préparation et livraison), notre prestataire de paiement Stripe (qui traite seul vos données bancaires), notre prestataire d’envoi d’e-mails et notre hébergeur. Aucune donnée n’est vendue.']],
      ['Durées de conservation', ['Compte client : jusqu’à sa suppression, ou 3 ans après la dernière commande. Commandes : 10 ans (obligation comptable), anonymisées si vous supprimez votre compte. Commandes sans compte : 3 ans.']],
      ['Cookies', ['Nous n’utilisons qu’un cookie de session strictement nécessaire (connexion) et le stockage local de votre navigateur pour mémoriser votre panier. Aucun cookie publicitaire ni de mesure d’audience : aucun bandeau de consentement n’est donc nécessaire.']],
      ['Vos droits', ['Vous disposez des droits d’accès, de rectification, d’effacement, de portabilité, de limitation et d’opposition. Depuis votre compte, vous pouvez exporter vos données et supprimer votre compte en un clic. Vous pouvez aussi nous écrire, ou saisir la CNIL (cnil.fr).']],
      ['Sécurité', ['Mots de passe chiffrés (scrypt), connexions sécurisées (HTTPS), accès aux données limité par rôle, paiements traités par un prestataire certifié PCI-DSS.']],
    ],
  },
};
