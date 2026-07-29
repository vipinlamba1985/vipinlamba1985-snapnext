import { randomUUID } from 'crypto';
import { fulfillRestorationCheckout } from './checkout.js';
import { revokeRestorationPurchase } from './wallet.js';

async function recordHandledEvent(db, event, result) {
  const now = new Date();
  await db.collection('billing_events').updateOne(
    { eventId: event.id },
    {
      $setOnInsert: {
        id: randomUUID(),
        provider: 'stripe',
        eventId: event.id,
        type: event.type,
        createdAt: now,
      },
      $set: {
        userId: result?.userId || null,
        status: 'processed',
        payload: result || {},
        processedAt: now,
      },
    },
    { upsert: true },
  );
}

export async function handleRestorationStripeEvent({ db, event }) {
  if (!db || !event?.type) return { handled: false };
  const object = event.data?.object || {};

  if (event.type === 'checkout.session.completed' && object.metadata?.purchaseType === 'restoration_pack') {
    const fulfillment = await fulfillRestorationCheckout({ db, session: object, eventId: event.id });
    const result = {
      handled: true,
      skipSubscriptionBilling: true,
      type: 'restoration_pack_grant',
      userId: object.metadata?.userId || object.client_reference_id || null,
      packId: object.metadata?.packId || null,
      granted: fulfillment.granted === true,
    };
    await recordHandledEvent(db, event, result);
    return result;
  }

  if (['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type)) {
    const paymentReference = object.payment_intent || null;
    if (!paymentReference) return { handled: false };
    const purchase = await db.collection('restoration_purchases').findOne({ paymentReference });
    if (!purchase) return { handled: false };

    let wallet = null;
    let action = 'no_change';
    if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created' || object.status !== 'won') {
      wallet = await revokeRestorationPurchase({
        db,
        paymentReference,
        reason: event.type === 'charge.refunded' ? 'refunded' : `dispute_${object.status || 'created'}`,
      });
      action = 'revoked_unused_units';
    }

    const result = {
      handled: true,
      skipSubscriptionBilling: true,
      type: 'restoration_purchase_adjustment',
      userId: purchase.userId,
      paymentReference,
      action,
      availableUnits: wallet?.availableUnits ?? null,
    };
    await recordHandledEvent(db, event, result);
    return result;
  }

  return { handled: false };
}
