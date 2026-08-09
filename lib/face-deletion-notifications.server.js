function notificationId(userId, generation) {
  return `privacy-deletion-retry:${String(userId)}:${Number(generation || 0)}`;
}

export async function publishFaceDeletionRetryNotification({ db, userId, generation }) {
  const now = new Date();
  const id = notificationId(userId, generation);
  await db.collection('notifications').updateOne(
    { id },
    {
      $setOnInsert: {
        id,
        userId,
        type: 'privacy_action_required',
        title: 'Action needed in SnapNext privacy settings',
        body: 'Open Privacy & security to retry a privacy deletion request.',
        payload: { href: '/privacy-security', reason: 'deletion_needs_retry', generation: Number(generation || 0) },
        read: false,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function clearFaceDeletionRetryNotification({ db, userId, generation }) {
  await db.collection('notifications').deleteOne({ id: notificationId(userId, generation), userId });
}
