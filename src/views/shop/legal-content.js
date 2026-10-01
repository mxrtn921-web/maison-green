// Contenus légaux de Maison Green (MOAN SAS).
// Les champs entre accolades sont remplacés par les informations saisies dans Admin → Horaires
// (« Coordonnées de la boutique » et « Informations légales »), avec les valeurs du Kbis par défaut — voir src/routes/account.js.
// {editeur} {siege} {etablissement} {adresse} {email} {contact} {tva} {gerant} {mediateur}

const RETRACT = 'Conformément à l’article L221-28 du Code de la consommation, le droit de rétractation ne peut pas être exercé pour : les denrées périssables ou susceptibles de se détériorer rapidement (produits frais, fruits, produits laitiers…) ; les biens descellés par le client qui ne peuvent être renvoyés pour des raisons d’hygiène ou de protection de la santé (produits alimentaires ouverts, produits à base de CBD ouverts…) ; les boissons alcoolisées dont la livraison est différée au-delà de trente jours et dont la valeur dépend des fluctuations du marché.';

export const LEGAL = {
  '/mentions-legales': {
    title: 'Mentions légales',
    sections: [
      ['Éditeur du site', [
        'Le site Maison Green est édité par {editeur}',
        'Siège social : {siege}. Boutique et préparation des commandes : {etablissement}.',
        'Numéro de TVA intracommunautaire : {tva}.',
        'Directeur de la publication : {gerant}, en qualité de Président.',
        'Contact : {contact}.',
      ]],
      ['Hébergement', [
        'Le site est hébergé par Railway Corporation, 548 Market Street, PMB 68956, San Francisco, CA 94104, États-Unis — https://railway.com.',
      ]],
      ['Paiement', [
        'Les paiements par carte bancaire sont traités par Stripe Payments Europe Limited, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin D02 H210, Irlande — https://stripe.com. Maison Green n’a jamais accès à vos données bancaires.',
      ]],
      ['Conception et réalisation', [
        'Site conçu et développé par Martin Petit, entrepreneur individuel (AE Martin Petit — Web Design & Services), SIRET 130 174 790 00019, 60 route d’Hautot, 76190 Étoutteville.',
      ]],
      ['Propriété intellectuelle', [
        'Le nom et la marque Maison Green, le logo, les textes, la mise en page et le code du site sont protégés par le Code de la propriété intellectuelle. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite de l’éditeur est interdite. Les marques et visuels des produits vendus appartiennent à leurs fabricants respectifs.',
      ]],
      ['Vente d’alcool', [
        'L’abus d’alcool est dangereux pour la santé, à consommer avec modération.',
        'La vente de boissons alcooliques aux mineurs est interdite (article L3342-1 du Code de la santé publique). Une confirmation d’âge est demandée à la commande et le livreur peut exiger une pièce d’identité à la remise : en cas de refus ou si le client est mineur, les boissons alcooliques ne sont pas remises.',
      ]],
      ['Produits à base de CBD', [
        'Les produits à base de chanvre (CBD) proposés sont issus de variétés autorisées et leur teneur en THC est conforme à la réglementation française (0,3 % maximum). Ils sont réservés aux personnes majeures, ne sont pas des médicaments et ne revendiquent aucune propriété thérapeutique. Déconseillés aux femmes enceintes ou allaitantes. Ne pas conduire après consommation.',
      ]],
      ['Données personnelles', [
        'Le traitement de vos données personnelles est décrit dans notre politique de confidentialité (lien « Confidentialité » en bas de chaque page).',
      ]],
      ['Médiation et litiges', [
        'Conformément aux articles L612-1 et suivants du Code de la consommation, le client consommateur peut recourir gratuitement à un médiateur de la consommation après une réclamation écrite restée sans réponse satisfaisante : {mediateur}.',
        'Les présentes mentions sont soumises au droit français.',
      ]],
    ],
  },
  '/cgu': {
    title: 'Conditions générales d’utilisation',
    sections: [
      ['Objet', ['Les présentes conditions encadrent l’accès et l’utilisation du site Maison Green, édité par {editeur} En naviguant sur le site, vous les acceptez. Les achats sont régis par nos conditions générales de vente (lien « Conditions de vente » en bas de chaque page).']],
      ['Accès au site', ['Le site est accessible gratuitement, 7 jours sur 7, 24 heures sur 24, sous réserve des interruptions pour maintenance ou en cas de force majeure. Les frais de connexion à Internet restent à la charge de l’utilisateur.']],
      ['Rayons réservés aux majeurs', ['Les rayons Alcools et CBD sont réservés aux personnes âgées de 18 ans ou plus. En y passant commande, l’utilisateur certifie être majeur ; cette déclaration est vérifiée à la livraison.']],
      ['Compte client', ['La création d’un compte est facultative : il est possible de commander sans compte et de suivre sa commande grâce au lien de suivi. Si vous créez un compte, vous êtes responsable de la confidentialité de votre mot de passe et de l’exactitude de vos informations. Vous pouvez supprimer votre compte à tout moment depuis votre espace personnel.']],
      ['Utilisation du site', ['Il est interdit d’utiliser le site de manière frauduleuse ou abusive : fausses commandes, usurpation d’identité, tentative d’intrusion, envoi automatisé de formulaires, collecte des données d’autres utilisateurs. Maison Green peut suspendre un compte ou refuser une commande en cas d’abus.']],
      ['Contenus et responsabilité', ['Les photos et descriptions des produits sont les plus fidèles possible ; l’emballage peut toutefois varier selon les arrivages du fabricant. Maison Green n’est pas responsable des dommages liés à l’équipement ou à la connexion de l’utilisateur, ni du contenu des sites tiers vers lesquels renvoient d’éventuels liens.']],
      ['Propriété intellectuelle', ['Les textes, photos, logos et le design du site appartiennent à Maison Green ou à leurs ayants droit. Toute reproduction, même partielle, est interdite sans autorisation écrite.']],
      ['Données personnelles et cookies', ['Le traitement de vos données est détaillé dans notre politique de confidentialité. Le site n’utilise que des cookies strictement nécessaires à son fonctionnement et une mesure d’audience anonyme, sans cookie.']],
      ['Modification et droit applicable', ['Maison Green peut faire évoluer les présentes conditions ; la version applicable est celle en ligne lors de votre visite. Elles sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité ({contact}).']],
    ],
  },
  '/cgv': {
    title: 'Conditions générales de vente',
    sections: [
      ['Vendeur', ['Les ventes sont conclues avec {editeur} Contact et service client : {contact}.']],
      ['Champ d’application', ['Les présentes conditions s’appliquent à toutes les commandes passées sur le site Maison Green par des consommateurs, pour une livraison à domicile à Rouen et dans les zones desservies indiquées sur le site. Elles prévalent sur tout autre document. Le client déclare les avoir lues et acceptées avant de valider sa commande.']],
      ['Produits', ['Les produits proposés sont ceux affichés sur le site, dans la limite des stocks disponibles. Leurs caractéristiques essentielles (dénomination, format, prix) figurent sur chaque fiche. Les rayons Alcools et CBD sont réservés aux personnes majeures.']],
      ['Prix', ['Les prix sont indiqués en euros, toutes taxes comprises, hors frais de livraison. Les frais de livraison dépendent de la zone (code postal) et sont affichés avant la validation de la commande ; ils peuvent être offerts au-delà d’un certain montant, indiqué pour chaque zone. Il n’y a pas de minimum de commande. Les produits sont facturés au prix en vigueur au moment de la validation.']],
      ['Commande', ['Le client compose son panier, indique ses coordonnées, son adresse et un créneau de livraison, vérifie le récapitulatif puis valide et paie. Pour les produits réservés aux majeurs, il certifie avoir 18 ans ou plus. La commande est ferme après confirmation du paiement ; elle peut ensuite être suivie en direct sur la page de suivi.', 'Maison Green peut annuler une commande en cas de rupture de stock, d’indisponibilité de livreur sur le créneau, d’adresse hors zone ou de commande anormale ; le client est alors remboursé intégralement, sans frais.']],
      ['Paiement', ['Le paiement s’effectue par carte bancaire (et, selon votre appareil, Apple Pay ou Google Pay) via notre prestataire sécurisé Stripe, au moment de la commande. Les données bancaires sont chiffrées et ne sont jamais transmises à Maison Green. La commande n’est préparée qu’après acceptation du paiement.']],
      ['Livraison', ['La livraison est effectuée par l’équipe Maison Green à l’adresse indiquée, dans le créneau choisi. Le client doit être présent ou joignable ; en cas d’absence, le livreur tente de le contacter. Les produits frais ne sont pas laissés sans instruction du client. Les boissons alcooliques et les produits à base de CBD ne sont remis qu’à une personne majeure, qui peut être invitée à présenter une pièce d’identité.', 'Le transfert des risques a lieu à la remise des produits au client.']],
      ['Réception et réclamations', ['Le client vérifie sa commande à la livraison. Tout produit manquant, abîmé ou non conforme doit être signalé dans les 24 heures ({contact}), si possible avec une photo. Maison Green rembourse ou remplace le produit concerné.']],
      ['Droit de rétractation', ['Pour les produits non exclus, le client dispose de 14 jours à compter de la livraison pour se rétracter sans avoir à se justifier, en adressant une déclaration claire à {email} (ou au moyen du modèle de formulaire de l’annexe à l’article R221-1 du Code de la consommation). Les produits doivent être restitués intacts, dans leur emballage d’origine non ouvert ; les frais de retour sont à la charge du client. Le remboursement intervient sous 14 jours à compter de la rétractation, par le même moyen de paiement.', RETRACT]],
      ['Garanties légales', ['Les produits bénéficient de la garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) et de la garantie contre les vices cachés (articles 1641 et suivants du Code civil). En cas de produit non conforme ou périmé, contactez-nous : il sera remboursé ou remplacé.']],
      ['Responsabilité', ['Maison Green n’est pas responsable de l’inexécution du contrat due au client, au fait imprévisible et insurmontable d’un tiers ou à un cas de force majeure. Les informations sur les allergènes figurent sur l’emballage des produits ; le client est invité à les vérifier.']],
      ['Données personnelles', ['Les données collectées lors de la commande sont nécessaires à son traitement. Leur utilisation est détaillée dans notre politique de confidentialité.']],
      ['Médiation et droit applicable', ['Les présentes conditions sont soumises au droit français. En cas de litige, le client adresse d’abord une réclamation écrite à Maison Green. À défaut d’accord, il peut recourir gratuitement au médiateur de la consommation (articles L612-1 et suivants du Code de la consommation) : {mediateur}. Le client peut également saisir la juridiction compétente.']],
    ],
  },
  '/confidentialite': {
    title: 'Politique de confidentialité',
    sections: [
      ['Responsable du traitement', ['Vos données sont traitées par {editeur} Contact pour toute question relative à vos données : {email}.']],
      ['Données collectées et finalités', [
        'Identité, téléphone, e-mail, adresse de livraison, instructions et créneau : traitement et livraison de votre commande (base légale : exécution du contrat).',
        'Confirmation de majorité pour les rayons Alcools et CBD : respect de l’interdiction de vente aux mineurs (base légale : obligation légale).',
        'Historique des commandes et factures : service client et obligations comptables (base légale : obligation légale).',
        'Compte client, si vous en créez un : accès à votre historique et à vos adresses (base légale : contrat).',
        'Prévention de la fraude et sécurité du site (protection contre les robots, limitation des tentatives de connexion) : base légale, intérêt légitime.',
      ]],
      ['Destinataires', ['Les données sont accessibles uniquement à l’équipe Maison Green (préparation et livraison, chacun pour ce qui le concerne) et à nos sous-traitants : Stripe (paiement, qui traite seul vos données bancaires) et Railway (hébergement du site). Aucune donnée n’est vendue ni utilisée à des fins publicitaires.']],
      ['Transferts hors de l’Union européenne', ['L’hébergeur Railway est situé aux États-Unis et Stripe peut traiter certaines données hors de l’Union européenne. Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne et, le cas échéant, par le cadre de protection des données UE–États-Unis (Data Privacy Framework).']],
      ['Durées de conservation', ['Compte client : jusqu’à sa suppression, ou 3 ans après la dernière commande. Commandes et factures : 10 ans (obligation comptable), anonymisées si vous supprimez votre compte. Commandes passées sans compte : 3 ans. Journaux techniques de sécurité : 12 mois au plus.']],
      ['Mesure d’audience', ['Nous comptons les pages vues de façon anonyme, sans cookie et sans conserver votre adresse IP : seuls des totaux (pages consultées, type d’appareil, site d’origine) sont enregistrés pour améliorer le site. Cette mesure est exemptée de consentement selon les recommandations de la CNIL.']],
      ['Cookies et stockage local', ['Le site n’utilise qu’un cookie de session strictement nécessaire (connexion à votre compte) et le stockage local de votre navigateur pour mémoriser votre panier et vos commandes en cours. Aucun cookie publicitaire ni traceur tiers : aucun consentement n’est donc requis.']],
      ['Vos droits', ['Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de vos données, ainsi que du droit de définir des directives sur leur sort après votre décès. Depuis votre compte, vous pouvez exporter vos données et supprimer votre compte en un clic. Vous pouvez aussi nous écrire à {email} ; nous répondons sous un mois. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (www.cnil.fr).']],
      ['Sécurité', ['Mots de passe chiffrés (scrypt), connexions sécurisées (HTTPS), accès aux données limité selon le rôle (administrateur, livreur), paiements traités par un prestataire certifié PCI-DSS.']],
      ['Mise à jour', ['Cette politique peut évoluer ; la version en vigueur est celle publiée sur cette page.']],
    ],
  },
};
