// Avis clients, rattachés à une commande livrée.
import { one, run, tx, nowIso } from '../db.js';
import { HttpError } from '../lib/http.js';

export const reviewForOrder = (orderId) => one('SELECT * FROM order_reviews WHERE order_id = ?', orderId) || null;

export function saveReview(order, input) {
  if (!order || order.status !== 'delivered') throw new HttpError(409, 'Vous pourrez donner votre avis après la livraison.');
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(422, 'Choisissez une note entre 1 et 5 étoiles.', { errors: { rating: 'Choisissez une note entre 1 et 5 étoiles.' } });
  }
  const comment = String(input.comment || '').trim();
  if (comment.length > 1000) {
    throw new HttpError(422, 'Votre commentaire est trop long.', { errors: { comment: 'Limitez votre commentaire à 1 000 caractères.' } });
  }
  return tx(() => {
    const now = nowIso();
    run(`INSERT INTO order_reviews (order_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at`,
    order.id, rating, comment, now, now);
    return reviewForOrder(order.id);
  });
}
