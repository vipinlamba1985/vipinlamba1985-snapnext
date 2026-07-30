# Photo Restoration QA

1. Provider or output-host allowlist absent: page shows activation state; pack purchase and restore controls remain disabled.
2. Unauthenticated GET/POST requests to restoration, pack, and preview routes return 401.
3. Stripe test purchase grants the selected units exactly once after a verified paid webhook.
4. A duplicate checkout webhook does not grant twice and cannot reactivate a refunded purchase.
5. Failed provider execution releases all reserved Restoration Credits.
6. Premium print preparation reserves, settles, and reports two units.
7. Company Profit Guard can block a prepaid job before Restoration Credits or provider cost are consumed.
8. A stale processing reservation self-releases after the configured TTL.
9. Two concurrent restore requests cannot both acquire the account's active restoration reservation.
10. Original media metadata and stored object remain unchanged.
11. Saving creates one user-owned derived copy; simultaneous or repeat saves return or converge on the same media id.
12. A storage object is removed when media-record creation fails.
13. Raw provider output URLs and cost metadata never appear in browser API responses.
14. The authenticated preview proxy rejects another user's job, expired output, invalid host, redirect, MIME type, and oversized output.
15. Refund and dispute events account for available, reserved, and used units without downgrading subscriptions.
16. One-time pack net revenue is recognized in the financial ledger and becomes visible to Profit Guard.
17. Web pack checkout is hidden inside native iOS and Android builds.
18. Account deletion removes restoration jobs, wallets, purchases, reservations, and derived media.
