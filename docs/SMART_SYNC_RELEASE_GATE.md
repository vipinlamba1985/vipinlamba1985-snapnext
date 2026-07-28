# Smart Sync release gate

Merge only when the exact branch head passes the full repository tests and production build in Vercel. Type validation and linting are separate because the current Vercel build explicitly skips them. Real provider acceptance still requires provider-issued OAuth credentials and a connected test account.
