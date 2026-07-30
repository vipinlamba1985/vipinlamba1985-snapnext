# Photo Restoration QA

1. Provider absent: page shows activation state; pack purchase and restore controls remain disabled.
2. Unauthenticated GET/POST requests to restoration routes return 401.
3. Stripe test purchase grants the selected units exactly once after a verified paid webhook.
4. Failed provider execution releases all reserved Restoration Credits.
5. Premium print preparation reserves and settles two units.
6. Company Profit Guard can block a prepaid job before provider execution.
7. Original media metadata and stored object remain unchanged.
8. Saving creates one user-owned derived copy; a repeat save returns the existing media id.
9. Invalid provider URL, redirect, MIME type, size, or hostname is rejected.
10. Refund and dispute events revoke only unused restoration units and do not downgrade subscriptions.
11. Account deletion removes restoration jobs, wallets, purchases, reservations, and derived media.
