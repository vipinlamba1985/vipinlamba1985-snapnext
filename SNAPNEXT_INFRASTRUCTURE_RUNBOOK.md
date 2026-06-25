# SnapNext Production Recovery & Backup Runbook

This runbook defines the production infrastructure policies, backup strategies, environment inventories, and disaster recovery procedures for **SnapNext**. It serves as the single source of truth for operators to maintain service availability, secure user assets, and facilitate infrastructure migrations.

---

## 1. MongoDB Backup Strategy

SnapNext uses MongoDB as its primary metadata and user account database. Keeping this data secure and recoverable is paramount.

### Automated Backups (Recommended)
Since SnapNext runs on fully managed Cloud databases (e.g., MongoDB Atlas):
* **Point-in-Time Recovery (PITR):** Enable PITR on the Atlas cluster. This allows restoring the database to any specific second within the last 7 to 14 days.
* **Daily Snapshots:** Configure automated daily snapshots with a 30-day retention policy.
* **Weekly/Monthly Milestones:** Retain weekly snapshots for 20 weeks and monthly snapshots for 1 year to meet compliance or archival demands.

### Manual Backups (Ad-hoc / Disaster Recovery)
If a manual dump is required before a major migration or schema change:

1. **Perform Backup (`mongodump`):**
   ```bash
   mongodump --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/snapnext" --out=./backups/backup-$(date +%F)
   ```
2. **Compress Backup Archive:**
   ```bash
   tar -czvf snapnext-db-backup-$(date +%F).tar.gz ./backups/backup-$(date +%F)
   ```
3. **Secure Storage:** 
   Store compressed backups in a secure, encrypted offline storage or an isolated cold-storage S3 bucket (e.g., `snapnext-backups`) with strict access controls.

### Restore Verification
A backup is only as good as its restore process. Once every quarter, restore a backup to a staging/development database to verify:
```bash
mongorestore --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/snapnext_staging" --dir=./backups/backup-<date>/snapnext
```

---

## 2. AWS S3 Backup & Versioning Strategy

Media objects are stored in the AWS S3 bucket: `snapnext-user-media`.

### Bucket Versioning (Active Protection)
* **Configuration:** S3 Bucket Versioning must be **Enabled** on `snapnext-user-media`.
* **Benefit:** Protects against accidental overwrites or malicious deletions. If an object is deleted, S3 creates a "Delete Marker." The old version can always be restored.
* **Lifecycle Rules:** To control costs while retaining history, configure a lifecycle policy to transition non-current object versions to **S3 Glacier Flexible Retrieval** or **S3 Glacier Deep Archive** after 30 days, and permanently purge non-current versions after 90 days.

### Multi-Region Replication (Cross-Region Backup)
For business continuity, configure **Cross-Region Replication (CRR)**:
* **Source Bucket:** `snapnext-user-media` (Region: `us-east-1`)
* **Destination Bucket:** `snapnext-user-media-backup` (Region: `us-west-2` or `eu-central-1`)
* **Policy:** Replicate all write and update operations asynchronously. This provides a geographical hot-standby copy of user assets.

---

## 3. Environment Variable Inventory

The table below catalogs all environment variables required by SnapNext for local development and production. 

| Variable Name | Description | Required For | Sensitive? | Recommended Value / Format |
| :--- | :--- | :--- | :--- | :--- |
| `MONGO_URL` / `MONGODB_URI` | MongoDB connection string. Includes credentials. | Core DB Operations | **YES** | `mongodb+srv://...` |
| `DB_NAME` | Target database name. | Core DB Operations | No | `snapnext` |
| `JWT_SECRET` | Secret key used to sign and verify session tokens. | Authentication | **YES** | Cryptographically strong 32+ char string |
| `STORAGE_PROVIDER` | Active storage engine: `local` or `s3`. | Storage Engine | No | `s3` (for Production) |
| `MAX_UPLOAD_SIZE_MB` | Maximum single-file size in MB. | Upload Guards | No | `500` |
| `AWS_ACCESS_KEY_ID` | AWS credential identifier. | AWS S3 Integration | **YES** | Key ID (e.g., `AKIA...`) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret credential. | AWS S3 Integration | **YES** | Standard AWS Secret Key |
| `AWS_REGION` | Target S3 bucket region. | AWS S3 Integration | No | `us-east-1` |
| `AWS_S3_BUCKET` | Target production S3 bucket name. | AWS S3 Integration | No | `snapnext-user-media` |
| `S3_SIGNED_URL_TTL` | Presigned URL expiration time (seconds). | Secure streaming | No | `3600` (1 Hour) |

---

## 4. Disaster Recovery (DR) Process

In the event of a catastrophic regional outage, data corruption, or server loss, execute the following recovery steps:

```
[System Outage Detected]
          │
          ▼
1. Isolate Traffic (Enable Maintenance Page)
          │
          ▼
2. Provision New Infrastructure (Database & S3 Bucket)
          │
          ▼
3. Restore DB (PITR / Last Snapshot) & S3 Objects
          │
          ▼
4. Redeploy SnapNext Application using New Environment Secrets
          │
          ▼
5. Perform Integration Testing (Run S3 Verification Probe)
          │
          ▼
6. Re-route DNS Traffic to New Deployment
```

### Critical Recovery Commands
* **Promote CRR Backup S3 Bucket:**
  If the primary `us-east-1` region is down, update `AWS_REGION` to `us-west-2` and `AWS_S3_BUCKET` to the replica bucket `snapnext-user-media-backup`.
* **Restore DB to New Cluster:**
  Initiate an Atlas Cloud restore to a fresh cluster, capture the connection string, and update the server configuration with the new `MONGODB_URI`.

---

## 5. User Data Export Process

To support privacy guidelines (GDPR/CCPA Compliance) and provide a premium user experience, administrators can trigger a complete export of user data.

### Data Package Contents
Each exported ZIP archive must contain:
1. **Metadata Export (`export.json`):** A JSON document containing all user profile information, gallery items, folders, AI captions, and activity logs.
2. **Media files:** A copy of all original images and videos downloaded from S3 using their direct keys.

### Scripted Export Procedure (Operator CLI)
```bash
# 1. Export user metadata document from MongoDB
mongoexport --uri="mongodb+srv://..." --collection=media --query='{"userId": "<user_id>"}' --out=./export-<user_id>/metadata.json

# 2. Download files from S3 using AWS CLI
aws s3 cp s3://snapnext-user-media/users/<user_id>/ ./export-<user_id>/media/ --recursive

# 3. Compress package
zip -r snapnext-export-<user_id>.zip ./export-<user_id>
```

---

## 6. Migration Path: JWT Auth to Supabase Auth (Future)

To scale authentication, support Social OAuth, and implement passwordless logins, SnapNext plans to transition from standard JWT auth to **Supabase Auth**.

### Step 1: Initialize Supabase Client
Add Supabase SDK dependencies to `package.json` and initialize the server client:
```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

### Step 2: User Account Migration
Write an administrative batch script to migrate credentials. Supabase allows creating users with pre-hashed bcrypt passwords:
```typescript
// Migrate custom DB users to Supabase Auth
const users = await db.collection('users').find({}).toArray();
for (const user of users) {
  await supabase.auth.admin.createUser({
    email: user.email,
    password: 'TemporaryBcryptPasswordPlaceholder', // Or use custom password import endpoints
    email_confirm: true,
    user_metadata: { name: user.name, legacyId: user.id }
  });
}
```

### Step 3: Map Database Relationships
Keep the original `userId` matching the Supabase-generated `auth.users.id`. Update all records in the MongoDB `media` collection to point to the new Supabase-assigned user identifier.

### Step 4: Middleware Update
Update JWT validation in the API middleware (`app/api/[[...path]]/route.js`) to parse the standard Supabase access token:
```typescript
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) return json({ error: 'Unauthorized' }, 401);
```

---

## 7. GitHub Deployment & Export Procedure

Deploying and syncing SnapNext source code with remote GitHub repositories ensures automated delivery and standard CI/CD.

### Source Export (Vite/NextJS Apps)
1. Navigate to the **Settings** panel inside the Google AI Studio environment.
2. Select **Export to GitHub** or **Download ZIP**.
3. If downloading ZIP, extract the contents locally and initialize a git repository:
   ```bash
   git init
   git add .
   git commit -m "chore: initial import from Google AI Studio"
   git remote add origin https://github.com/<username>/snapnext.git
   git branch -M main
   git push -u origin main
   ```

### CI/CD Deployment Flow (Google Cloud Run / Vercel)
* **Build Command:** `npm run build`
* **Output Directory:** `dist/` or `.next/`
* **Execution Port:** Port `3000` (Configured automatically via Cloud Run configuration)
* **Continuous Delivery:** Configure GitHub Actions to rebuild and deploy to Cloud Run on every push to the `main` branch. Ensure secrets (`AWS_ACCESS_KEY_ID`, `MONGODB_URI`, etc.) are safely injected via GitHub Secret variables.

---
*Created and maintained by the SnapNext Infrastructure & Engineering Team.*
