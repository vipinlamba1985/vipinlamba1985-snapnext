# Smart Sync external activation

The remaining activation steps are external to the repository: create or verify OAuth applications in Google Cloud, Dropbox App Console, and Microsoft Entra; register the exact production callbacks; and add the issued client IDs and secrets to Vercel Preview and Production. The application intentionally reports a provider as unavailable until those secrets exist.
