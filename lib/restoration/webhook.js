import { randomUUID } from 'crypto';
import { fulfillRestorationCheckout } from './checkout.js';
import { revokeRestorationPurchase } from './wallet.js';

let stripeClient = null;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function centsToUsd(value) {
  return Number((finite(value, 0) / 100).toFixed(6));
}

function eventDate(event) {
  const seconds = finite(event?.created, 0);
  return seconds > 0 ? new Date(seconds * 1000) : new Date();
}

async function getStripe() {
  if (stripeClient) return stripeClient;
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
  const Stripe = (await import('stripe')).default;
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  return stripeClient;
}

async function resolveRestorationNet(session) {
  const grossCents = Math.max(0, finite(session?.amount_total, 0));
  const taxCents = Math.min(grossCents, Math.max(0, finite(session?.total_details?.amount_tax, 0)));

  try {
    const stripe = await getStripe();
    const paymentIntentId = typeof session?.payment_intent === 'string'
      ? session.payment_intent
      : session?.payment_intent?.id;
    if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.balance_transaction'],
      });
      const transaction = paymentIntent?.latest_charge?.balance_transaction;
      if (transaction && Number.isFinite(Number(transaction.net))) {
        const stripeNetCents = Math.max(0, finite(transaction.net, 0));
        return {
          grossCents,
          taxCents,
          feeCents: Math.max(0, grossCents - stripeNetCents),
          netCents: Math.max(0, stripeNetCents - taxCents),
          calculationMethod: 'stripe_balance_transaction_net_minus_tax',
          balanceTransactionId: transaction.id || null,
        };
      }
    }
  } catch (error) {
    console.warn('[restoration-revenue] could not resolve Stripe balance transaction:', error?.message);
  }

  const percent = Math.max(0, finite(process.env.STRIPE_CARD_PERCENT_FEE, 0.029));
  const fixedCents = Math.max(0, Math.round(finite(process.env.STRIPE_CARD_FIXED_FEE_CENTS, 30)));
  const feeCents = Math.min(grossCents, Math.ceil(grossCents * percent) + fixedCents);
  return {
    grossCents,
    taxCents,
    feeCents,
    netCents: Math.max(0, grossCents - taxCents - feeCents),
    calculationMethod: 'card_percentage_plus_fixed_fee_reserve_minus_tax',
    balanceTransactionId: null,
  };
}

async function recordRestorationRevenue(db, event, session) {
  if (String(session?.currency || 'usd').toLowerCase() !== 'usd') {
    throw Object.assign(new Error('Restoration revenue recognition currently requires USD checkout.'), {
      code: 'restoration_currency_not_supported',
    });
  }
  const amounts = await resolveRestorationNet(session);
  if (amounts.grossCents <= 0) throw new Error('A paid restoration checkout must have a positive amount.');
  const now = new Date();
  const ledgerKey = `restoration_pack:${session.id}`;
  await db.collection('financial_ledger').updateOne(
    { source: 'stripe', ledgerKey },
    {
      $setOnInsert: {
        id: randomUUID(),
        source: 'stripe',
        ledgerKey,
        firstSourceEventId: event.id,
        createdAt: now,
      },
      $set: {
        type: 'revenue',
        subtype: 'restoration_pack',
        status: 'recognized',
        recognizedAt: eventDate(event),
        source: 'stripe',
        ledgerKey,
        sourceObjectId: session.id,
        customerId: session.customer || null,
        currency: 'usd',
        grossAmountUsd: centsToUsd(amounts.grossCents),
        taxAmountUsd: centsToUsd(amounts.taxCents),
        feeAmountUsd: centsToUsd(amounts.feeCents),
        netAmountUsd: centsToUsd(amounts.netCents),
        calculationMethod: amounts.calculationMethod,
        lastSourceEventId: event.id,
        metadata: {
          purchaseType: 'restoration_pack',
          packId: session.metadata?.packId || null,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
          balanceTransactionId: amounts.balanceTransactionId,
        },
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  return {
    grossAmountUsd: centsToUsd(amounts.grossCents),
    netAmountUsd: centsToUsd(amounts.netCents),
    calculationMethod: amounts.calculationMethod,
  };
}

async function paymentReferenceForAdjustment(event, object) {
  const direct = typeof object?.payment_intent === 'string'
    ? object.payment_intent
    : object?.payment_intent?.id;
  if (direct) return direct;
  const chargeId = typeof object?.charge === 'string'
    ? object.charge
    : object?.charge?.id || (event.type === 'charge.refunded' ? object?.id : null);
  if (!chargeId) return null;
  try {
    const stripe = await getStripe();
    const charge = await stripe.charges.retrieve(chargeId);
    return typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id || null;
  } catch (error) {
    console.warn('[restoration-refund] could not resolve payment intent:', error?.message);
    return null;
  }
}

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
    const revenue = fulfillment.granted ? await recordRestorationRevenue(db, event, object) : null;
    const result = {
      handled: true,
      skipSubscriptionBilling: true,
      type: 'restoration_pack_grant',
      userId: object.metadata?.userId || object.client_reference_id || null,
      packId: object.metadata?.packId || null,
      granted: fulfillment.granted === true,
      revenue,
    };
    await recordHandledEvent(db, event, result);
    return result;
  }

  if (['refund.created', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type)) {
    const paymentReference = await paymentReferenceForAdjustment(event, object);
    if (!paymentReference) return { handled: false };
    const purchase = await db.collection('restoration_purchases').findOne({ paymentReference });
    if (!purchase) return { handled: false };

    let wallet = null;
    let action = 'no_change';
    const shouldRevoke = event.type === 'refund.created'
      || event.type === 'charge.refunded'
      || event.type === 'charge.dispute.created'
      || (event.type === 'charge.dispute.closed' && object.status !== 'won');
    if (shouldRevoke) {
      wallet = await revokeRestorationPurchase({
        db,
        paymentReference,
        reason: event.type.includes('refund')
          ? 'refunded'
          : `dispute_${object.status || 'created'}`,
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
