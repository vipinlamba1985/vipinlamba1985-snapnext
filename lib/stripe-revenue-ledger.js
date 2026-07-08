import { v4 as uuidv4 } from 'uuid';

let stripeClient = null;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function centsToUsd(cents) {
  return Number((finite(cents, 0) / 100).toFixed(6));
}

function eventDate(event) {
  const seconds = finite(event?.created, 0);
  return seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function conservativeFeeReserveRatio() {
  return Math.max(0, Math.min(0.25, finite(process.env.STRIPE_REVENUE_FEE_RESERVE_RATIO, 0.05)));
}

async function getStripe() {
  if (stripeClient) return stripeClient;
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
  const Stripe = (await import('stripe')).default;
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  return stripeClient;
}

export async function verifyStripeRevenueEvent({ rawBody, signature }) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET missing');
  const stripe = await getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

function invoiceTaxCents(invoice) {
  const taxAmounts = Array.isArray(invoice?.total_tax_amounts) ? invoice.total_tax_amounts : [];
  if (taxAmounts.length) {
    return taxAmounts.reduce((sum, row) => sum + Math.max(0, finite(row?.amount, 0)), 0);
  }
  return Math.max(0, finite(invoice?.tax, 0));
}

async function resolveInvoiceBalanceTransaction(invoice) {
  const stripe = await getStripe();

  try {
    if (invoice?.charge) {
      const charge = typeof invoice.charge === 'string'
        ? await stripe.charges.retrieve(invoice.charge, { expand: ['balance_transaction'] })
        : invoice.charge;
      if (charge?.balance_transaction) {
        return typeof charge.balance_transaction === 'string'
          ? await stripe.balanceTransactions.retrieve(charge.balance_transaction)
          : charge.balance_transaction;
      }
    }

    if (invoice?.payment_intent) {
      const paymentIntent = typeof invoice.payment_intent === 'string'
        ? await stripe.paymentIntents.retrieve(invoice.payment_intent, { expand: ['latest_charge.balance_transaction'] })
        : invoice.payment_intent;
      const charge = paymentIntent?.latest_charge;
      if (charge?.balance_transaction) {
        return typeof charge.balance_transaction === 'string'
          ? await stripe.balanceTransactions.retrieve(charge.balance_transaction)
          : charge.balance_transaction;
      }
    }
  } catch (error) {
    console.warn('[finance] could not resolve Stripe balance transaction:', error?.message);
  }

  return null;
}

async function recordLedgerEntry(db, entry) {
  const sourceEventId = entry.sourceEventId;
  if (!sourceEventId) throw new Error('sourceEventId is required for financial ledger idempotency.');

  await db.collection('financial_ledger').updateOne(
    { source: 'stripe', sourceEventId },
    {
      $setOnInsert: {
        id: uuidv4(),
        source: 'stripe',
        sourceEventId,
        createdAt: new Date(),
      },
      $set: {
        ...entry,
        source: 'stripe',
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

async function recordPaidInvoice(db, event) {
  const invoice = event.data.object;
  const grossCents = Math.max(0, finite(invoice?.amount_paid, 0));
  if (grossCents <= 0) return { ignored: true, reason: 'zero_amount_paid' };

  const taxCents = Math.min(grossCents, invoiceTaxCents(invoice));
  const balanceTransaction = await resolveInvoiceBalanceTransaction(invoice);

  let feeCents;
  let netCents;
  let calculationMethod;

  if (balanceTransaction && Number.isFinite(Number(balanceTransaction.net))) {
    const stripeNetCents = Math.max(0, finite(balanceTransaction.net, 0));
    netCents = Math.max(0, stripeNetCents - taxCents);
    feeCents = Math.max(0, grossCents - stripeNetCents);
    calculationMethod = 'stripe_balance_transaction_net_minus_tax';
  } else {
    const feeReserveCents = Math.ceil(grossCents * conservativeFeeReserveRatio());
    feeCents = feeReserveCents;
    netCents = Math.max(0, grossCents - taxCents - feeReserveCents);
    calculationMethod = 'conservative_fee_reserve_minus_tax';
  }

  const recognizedAt = invoice?.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000)
    : eventDate(event);

  await recordLedgerEntry(db, {
    type: 'revenue',
    subtype: 'subscription_invoice_paid',
    status: 'recognized',
    recognizedAt,
    sourceObjectId: invoice.id,
    customerId: invoice.customer || null,
    subscriptionId: invoice.subscription || null,
    currency: String(invoice.currency || 'usd').toLowerCase(),
    grossAmountUsd: centsToUsd(grossCents),
    taxAmountUsd: centsToUsd(taxCents),
    feeAmountUsd: centsToUsd(feeCents),
    netAmountUsd: centsToUsd(netCents),
    calculationMethod,
    sourceEventId: event.id,
    metadata: {
      invoiceNumber: invoice.number || null,
      billingReason: invoice.billing_reason || null,
      paymentIntentId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id || null,
      chargeId: typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id || null,
      balanceTransactionId: balanceTransaction?.id || null,
    },
  });

  return { recognized: true, netAmountUsd: centsToUsd(netCents), calculationMethod };
}

async function recordNegativeAdjustment(db, event, { subtype, amountCents, sourceObjectId, customerId = null, chargeId = null, metadata = {} }) {
  const amount = Math.max(0, finite(amountCents, 0));
  if (amount <= 0) return { ignored: true, reason: 'zero_adjustment' };

  await recordLedgerEntry(db, {
    type: 'revenue',
    subtype,
    status: 'recognized',
    recognizedAt: eventDate(event),
    sourceObjectId,
    customerId,
    currency: String(event.data.object?.currency || 'usd').toLowerCase(),
    grossAmountUsd: 0,
    taxAmountUsd: 0,
    feeAmountUsd: 0,
    netAmountUsd: -centsToUsd(amount),
    calculationMethod: 'negative_revenue_adjustment',
    sourceEventId: event.id,
    metadata: { chargeId, ...metadata },
  });

  return { adjusted: true, netAmountUsd: -centsToUsd(amount) };
}

async function recordPositiveAdjustment(db, event, { subtype, amountCents, sourceObjectId, customerId = null, chargeId = null, metadata = {} }) {
  const amount = Math.max(0, finite(amountCents, 0));
  if (amount <= 0) return { ignored: true, reason: 'zero_adjustment' };

  await recordLedgerEntry(db, {
    type: 'revenue',
    subtype,
    status: 'recognized',
    recognizedAt: eventDate(event),
    sourceObjectId,
    customerId,
    currency: String(event.data.object?.currency || 'usd').toLowerCase(),
    grossAmountUsd: 0,
    taxAmountUsd: 0,
    feeAmountUsd: 0,
    netAmountUsd: centsToUsd(amount),
    calculationMethod: 'positive_revenue_adjustment',
    sourceEventId: event.id,
    metadata: { chargeId, ...metadata },
  });

  return { adjusted: true, netAmountUsd: centsToUsd(amount) };
}

export async function recordStripeRevenueEvent({ db, event }) {
  if (!db || !event?.id || !event?.type) throw new Error('Database and verified Stripe event are required.');

  switch (event.type) {
    case 'invoice.payment_succeeded':
    case 'invoice.paid':
      return recordPaidInvoice(db, event);

    case 'refund.created': {
      const refund = event.data.object;
      return recordNegativeAdjustment(db, event, {
        subtype: 'refund',
        amountCents: refund.amount,
        sourceObjectId: refund.id,
        chargeId: typeof refund.charge === 'string' ? refund.charge : refund.charge?.id || null,
        metadata: { paymentIntentId: typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id || null },
      });
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      return recordNegativeAdjustment(db, event, {
        subtype: 'dispute_opened',
        amountCents: dispute.amount,
        sourceObjectId: dispute.id,
        chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id || null,
        metadata: { disputeStatus: dispute.status || null, reason: dispute.reason || null },
      });
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      if (dispute.status !== 'won') return { ignored: true, reason: `dispute_${dispute.status || 'closed'}` };
      return recordPositiveAdjustment(db, event, {
        subtype: 'dispute_won_reversal',
        amountCents: dispute.amount,
        sourceObjectId: dispute.id,
        chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id || null,
        metadata: { disputeStatus: dispute.status || null, reason: dispute.reason || null },
      });
    }

    default:
      return { ignored: true, reason: 'event_not_financial' };
  }
}
