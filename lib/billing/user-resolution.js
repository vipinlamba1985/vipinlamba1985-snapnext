export async function resolveExistingUserIdFromCustomer(db, customerId) {
  if (!db || !customerId) return null;
  const user = await db.collection('users').findOne(
    { stripeCustomerId: customerId },
    { projection: { id: 1 } },
  );
  return user?.id || null;
}

export async function resolveExistingUserIdFromSubscription(db, subscription = {}) {
  if (!db) return null;
  const metadataUserId = subscription?.metadata?.userId;
  if (metadataUserId) {
    const user = await db.collection('users').findOne(
      { id: metadataUserId },
      { projection: { id: 1 } },
    );
    return user?.id || null;
  }
  return resolveExistingUserIdFromCustomer(db, subscription?.customer);
}
