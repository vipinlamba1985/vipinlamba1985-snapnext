# SnapNext AI — Master Engineering Bible
## The Long-Term Blueprint & Single Source of Truth

> **Every Memory. Every Story. Forever.**
> This document serves as the comprehensive, unified product and technical specification for SnapNext. It consolidates the architecture, product philosophy, user journeys, technical specs, database schemas, and AI execution workflows into a single master blueprint to guide all future development.

---

## 📗 VOLUME 1: PRODUCT FOUNDATION (PHASE 1)

### 1. Executive Vision
*   **Why SnapNext Exists:** Traditional cloud storage has reduced our priceless memories to mere directories of unorganized binary files. We have more photos than ever, yet less connection to them. SnapNext exists to restore the soul of photography, converting raw digital assets into a living, breathing, and private memory home.
*   **Mission:** To empower individuals and families to easily capture, protect, understand, and relive their life stories across generations, powered by secure, local-first, and server-side intelligence.
*   **Vision:** A world where no memory is lost to a broken hard drive, forgotten login, or scattered cloud account, and where a personal, highly secure AI assistant works in the background to preserve your legacy.
*   **Problem Statement:**
    1.  *Legacy Storage Bloat:* Standard platforms (Google/iCloud) encourage infinite, unorganized uploading of duplicates, blurry photos, and screenshot noise, charging rent on data clutter.
    2.  *Privacy Deprivation:* Public cloud platforms mine personal photos to train general ad models, stripping away deep user privacy.
    3.  *Lack of Soul:* Flat folder structures or endless chronological streams lack emotional context, relationship awareness, and narrative storytelling.
*   **Future Vision:** Over time, SnapNext evolves from a smart backup vault into a digital life preservation system, capable of generating rich multimedia memoirs, private generational voice-overs, and autonomous family tree timelines.

---

### 2. Product Philosophy & Differentiators
SnapNext is distinctly not a general-purpose cloud storage utility. Here is how it compares to legacy platforms:

| Feature/Vector | SnapNext AI | Legacy Clouds (Google Photos / Apple Photos) | General Filesystems (S3, Dropbox, Drive) |
| :--- | :--- | :--- | :--- |
| **Primary Goal** | Emotional Reliving & Legacy Protection | Chronological Capture & Multi-Device Sync | General Document Storage & Sharing |
| **Intelligence** | Proactive, Empathetic AI Storytelling | Basic Object Tagging & Search Queries | None / User-Defined Hierarchies |
| **Privacy Model** | Isolated Private Vault, Zero Ad-Profiling | Opt-In Profiles, Deep In-House Analytics | Standard Enterprise Access Control |
| **Structure** | Dynamic Life-Graph & Story Networks | Chronological Grid | Static Directories & File Lists |
| **Social Model** | Private Family Vault Networks | Public Link Sharing & Multi-User Albums | Public Link Sharing |

*   **VS. Instagram & Snapchat:** Unlike social channels, SnapNext contains no likes, no public metrics, and no external algorithms. It is entirely introspective, dedicated only to you and your selected inner circle.

---

### 3. Comprehensive User Personas
*   **Parents:** Want to document their children’s fleeting milestones without over-exposing their kids' lives on public social media. They require automated "Baby Book" or "Growing Up" album generators and highly secure sharing rules.
*   **Families:** Spread across different countries or regions who need a shared, private space (the "Family Vault") where parents, kids, and grandparents can deposit memories synchronously, receiving alerts like "Aarav added 5 photos of graduation."
*   **Students & Young Adults:** Have heavy photo libraries mixed with study notes, memes, and social outings. They require semantic cleaning tools (Memory Health) to delete screenshots instantly and find that specific restaurant photo from six months ago.
*   **Creators:** Leverage high-resolution media and require structured folders, seamless exports, and draft scene-reel generators with automatic soundtrack suggestions.
*   **Travelers:** Constantly on the move, capturing geographic coordinates, local dishes, and cultural landmarks. They value interactive geographic travel-maps, chronological trip-timelines, and automated travelogs.
*   **Professionals:** Use photographs to document project work sites, real estate inventories, or creative references, keeping work files strictly separated from their personal memories.
*   **Businesses:** Need high-level media organization, multiple users with varying permission levels, audit logs, and secure backup infrastructure.
*   **Photographers:** Demand absolute raw quality backup, strict lossless compression control, EXIF-data preservation, and high-contrast dark galleries.
*   **Elderly Users:** Need ultra-simple, big-typography navigation, automated audio captions, voice search, and seamless physical-print generation.

---

### 4. End-to-End User Journeys
The platform maps out a seamless, high-retention click stream:
1.  **Landing Page:** High-contrast, spacious, emotional headlines paired with high-quality media examples. Clear, immediate calls-to-action (CTAs) pointing to a risk-free trial.
2.  **Signup:** Ultra-clean forms offering dual sign-up pathways: high-speed Supabase Auth with Google/Apple OAuth or secure on-premises custom password credentials.
3.  **Login:** Instant visual state transitions with session persistence, falling back to secure magic links for passwordless experiences.
4.  **Onboarding:** Empathetic, conversational assistant-guided steps. Automatically detects initial upload categories and configures primary backup targets.
5.  **Dashboard (Home):** Greets the user warmly with personal timeline cards, relationship shortcuts, and a clear, high-priority "Backup Everything" button.
6.  **Upload:** Drag-and-drop or tap-to-select, immediately spinning up background streaming, S3 parallel chunking, and immediate metadata categorization.
7.  **Gallery (Vault):** A fluid, beautifully balanced visual grid with month-by-month headings, zoomable sizing, and immediate filters for favorites, people, or events.
8.  **AI Assistant Chat:** An interactive conversational thread where users can ask questions like *"Show me my trips with Sarah"* or *"Write a journal entry for last weekend."*
9.  **Sharing Console:** Granular permissions panel enabling user-to-user private keys, temporary links, or one-click additions to the Family Vault.
10. **Subscription Page (Billing):** Transparent pricing structures mapped via Stripe Checkout, supporting seamless upgrades from Free to Plus, Pro, or Lifetime options.
11. **Daily Reliving Loops:** Staggered notifications reminding users of *"On This Day"* loops and automated weekly digests.

---

### 5. Premium UX & Design Principles
*   **Navigation:** Mobile-first, five-tab bottom persistent layout (Home, Vault, Stories, Create, People). Secondary system utilities (Settings, Admin, Storage, Billing) are consolidated inside the avatar profile menu to eliminate visual clutter.
*   **Animations:** Smooth entrance fades, stagger-loaded grid elements, micro-spring hover interactions, and seamless route changes. Animated using the performance-tuned `motion` library.
*   **Loading States:** Custom SVG skeleton components that maintain the precise aspect-ratio layout of the gallery grid before images hydrate.
*   **Empty States:** No stark white blank spots. Every empty screen features high-contrast minimalist illustration lines paired with descriptive copy and clear primary CTAs (e.g., "Add your first memory").
*   **Error Handling:** Inline toast notifications and clear, non-technical error cards that explain the issue clearly and provide a direct "Retry" button.
*   **The "Premium" Vibe:** Built on a Swiss-Modernist design foundation utilizing spacious margins, sharp font tracking, high-contrast typography pairing (Space Grotesk + JetBrains Mono), and deep slate/fuchsia accent colors.

---

### 6. Branding & Style Guide
*   **App Title:** `SnapNext` (Never generic placeholders or overly technical labels).
*   **Visual Persona:** Sleek, high-integrity, private, and deeply human.
*   **Primary Typography:** Inter (Sans-Serif) for reliable UI readability and body copy.
*   **Display Typography:** Space Grotesk / Outfit for bold headings and emotional prompts.
*   **Technical Accent Typography:** JetBrains Mono for metadata metrics, dates, and storage statistics.
*   **Primary Palette:** Deep space canvas backgrounds (`#0b0414`), pure white text, warm gray borders, and vibrant fuchsia/pink-to-purple gradient highlights.

---

## 📗 VOLUME 2: TECHNICAL ARCHITECTURE (PHASE 2)

```
                       [ NextJS App Router (Client / Server) ]
                                      |
         +----------------------------+----------------------------+
         |                            |                            |
[ Supabase Auth ]              [ MongoDB Database ]         [ AWS S3 Storage ]
  - JWT Tokens                   - User Accounts              - Presigned URLs
  - Social OAuth                 - Media Metadata             - Lossless Backup
  - Passwordless                 - AI Analytics               - Streaming Chunking
         |                            |                            |
         +----------------------------+----------------------------+
                                      |
                         [ Gemini AI Agent Engine ]
                           - vision analysis (3.5-flash)
                           - empathetic chat (3.5-flash)
                           - audio transcribe (3.5-flash)
                           - text-to-speech (3.1-tts)
```

### 1. Framework & Folder Structure
SnapNext is implemented on **Next.js 15+** utilizing the modern **App Router** framework:
*   `/app`: Standard App Router pages. Separates authenticated paths (`/(app)/*`) from public routes.
*   `/components`: Highly reusable, atomic React components (AppShell, GalleryGrid, AISearch, etc.).
*   `/lib`: Core server-side and client-side utilities. Includes database adapters (`db.js`), S3 clients (`storage.js`), billing systems (`billing/`), and the AI SDK wrapper (`gemini.js`).
*   `/public`: Standard static assets, including responsive application launchers and icons.

### 2. Dual-Engine Authentication Model
SnapNext supports a flexible authentication matrix to accommodate both local and global server models:
*   **Standard Local Auth:** Secure JWT generation coupled with bcrypt hashing storing credentials directly within your MongoDB cluster. Ideal for self-hosted instances.
*   **Enterprise Supabase Auth:** Configurable through simple environment properties, enabling magic links, enterprise social OAuth (Google, Apple), and robust server-verified JWT claims.

### 3. Media Processing & AWS S3 Storage
All uploaded files bypass memory buffers for maximum reliability:
*   **Direct Upload Stream:** Large assets stream directly to AWS S3 or compatible object storage.
*   **Parallel Multi-Part Uploads:** Files over 10MB utilize multipart upload signatures to guarantee reliable completion on flaky connections.
*   **Secured Temporary Access:** S3 objects remain private. Pre-signed URLs with configurable time-to-live (default 1 hour) are generated on demand to protect media access.

### 4. AI Processing Pipeline (Google Gemini)
The platform leverages the official `@google/genai` TypeScript SDK:
*   **Vision Extraction:** Upon upload, media assets are processed using `gemini-3.5-flash` to extract tags, descriptions, locations, facial features, and emotions.
*   **Semantic Data Storage:** Extracted structures are stored in the media collection, enabling instant natural-language search queries.
*   **Modality-Rich Interaction:** The conversational assistant utilizes `gemini-3.5-flash` for high-context natural-language search, and `gemini-3.1-flash-tts-preview` to return natural voice playback streams.

---

## 📘 VOLUME 3: FEATURE SPECIFICATIONS (PHASE 3)

### 1. Smart Media Upload & Backup Engine
*   **Goal:** Make backing up your life's media effortless, bulletproof, and fast.
*   **Flow:** User triggers "Backup Everything". The system scans the camera roll or local folder, lists files, excludes duplicates locally using SHA-256 hashes, and streams new assets with real-time progress bars.
*   **Backend:** Handles multipart stream compilation, writes to S3, and sends a quick async task to the Gemini pipeline to index the media before returning success.

### 2. Dense Vault & Smart Gallery
*   **Goal:** Provide an engaging, clutter-free view of every asset.
*   **UX Pattern:** Month headings group the grid smoothly. Dense photo groupings minimize blank space. Dynamic search bar is pinned to the top of the gallery view.
*   **Filters:** Quick-toggle selectors let users view only photos, videos, favorites, detected people, or custom stories.

### 3. Empathy-First Chat Assistant
*   **Goal:** Convert standard library searches into engaging personal conversations.
*   **Capabilities:** Users can ask the assistant to find photos (*"Show me the trip with Sarika"*), create media highlights (*"Stitch together last winter's moments"*), or draft warm captions (*"Write an emotional Instagram caption for this picture"*).

### 4. Semantic Life Graph
*   **Goal:** Map relationships, places, and shared memories visually.
*   **UX Pattern:** An interactive canvas of connected circles representing favorite people, pets, and destinations. Clicking a node highlights shared memories and suggest joint album invitations.

### 5. Memory Health & Cleanup Console
*   **Goal:** Reclaim cloud storage and maintain library quality.
*   **Features:** Automates scan detection for:
    1.  *Screenshots:* Detects phone screenshots to let users archive them with one click.
    2.  *Blurry/Low-Quality Photos:* Identifies duplicate or out-of-focus media to offer storage reclaim estimates.
    3.  *Duplicates:* Automatically hashes files to catch identical uploads.

---

## 📙 VOLUME 4: DATABASE & SECURITY SPECIFICATIONS (PHASE 4)

### 1. Database Collections & Schema Design
The MongoDB database uses five core collection schemas:

#### `users` Collection
```json
{
  "_id": "ObjectId",
  "id": "String (Unique ID)",
  "name": "String",
  "email": "String (Unique, Indexed)",
  "passwordHash": "String (Bcrypt for local-auth)",
  "role": "String (user / admin / superuser)",
  "storageLimitBytes": "Int64 (Default 15 GB)",
  "storageUsedBytes": "Int64",
  "createdAt": "ISODate",
  "emailVerified": "Boolean",
  "emailPrefs": {
    "weeklyDigest": "Boolean",
    "onThisDay": "Boolean",
    "storageAlerts": "Boolean"
  }
}
```

#### `media` Collection
```json
{
  "_id": "ObjectId",
  "id": "String (Unique ID)",
  "userId": "String (Indexed)",
  "storageKey": "String (S3 Key)",
  "fileName": "String",
  "mimeType": "String",
  "fileSizeBytes": "Int64",
  "status": "String (pending / processed / error)",
  "isFavorite": "Boolean",
  "isTrashed": "Boolean",
  "trashedAt": "ISODate",
  "width": "Int32",
  "height": "Int32",
  "createdAt": "ISODate",
  "aiAnalysis": {
    "description": "String",
    "tags": ["String (Indexed)"],
    "faces": ["String (Indexed)"],
    "emotions": ["String"],
    "location": "String",
    "albumSuggestion": "String"
  }
}
```

#### `relationships` Collection
```json
{
  "_id": "ObjectId",
  "id": "String",
  "userId": "String (Indexed)",
  "personName": "String",
  "relationshipLabel": "String (Spouse / Child / Parent / Pet)",
  "sharedCount": "Int32",
  "isFavorite": "Boolean",
  "createdAt": "ISODate"
}
```

#### `stories` Collection
```json
{
  "_id": "ObjectId",
  "id": "String",
  "userId": "String (Indexed)",
  "title": "String",
  "category": "String (Trip / Birthday / Anniversary)",
  "mediaIds": ["String"],
  "aiSummary": "String",
  "createdAt": "ISODate"
}
```

---

## 📔 VOLUME 5: COMPREHENSIVE TESTING & LAUNCH SPECIFICATION (PHASE 5)

### 1. Test Automation Hierarchy
SnapNext utilizes a multi-tier automated test framework:
*   **Unit Tests:** Validates core server-side functions: password encryption, JWT parsing, and S3 path generation.
*   **Integration Tests:** Focuses on standard database operations, file uploads, and mock S3 write checks.
*   **System Testing (Python Test Runner):** `backend_test.py` validates core authentication and data paths under realistic request models.

### 2. Pre-Launch Quality Checklist
Before moving to production:
1.  **Enforce Storage Limits:** Ensure user quotas are checked before initiating multi-part S3 streams.
2.  **Verify S3 CORS Settings:** Target S3 bucket configurations must permit access from your production deployment domain.
3.  **Validate Environment Properties:** Verify that `.env` includes production API endpoints, Stripe secrets, and valid Gemini keys.
4.  **Confirm Local Hashing:** Verify that client-side SHA-256 duplicate detection works properly during large backups.

---

## 📓 VOLUME 6: AI STUDIO EXECUTION PROTOCOLS (PHASE 6)

### 1. Developer Guidelines for Agent Coding
When editing this project, AI Studio agents must strictly follow these rules:
*   **Strict Scope Discipline:** Only implement features explicitly outlined by the user or defined in this blueprint. Never add unrequested pages, dashboards, or utility rails.
*   **Maintain Existing Systems:** Always protect and preserve existing code, including S3 integrations, database queries, and the active Gemini chat pipeline.
*   **Incremental Edits:** Edit files surgically using standard `edit_file` or `multi_edit_file` operations. Never rewrite complete pages if small patches suffice.
*   **Compile Validation:** Run `compile_applet` after each set of edits to verify successful TypeScript compilation.
*   **Clean Output:** Do not include mock files, telemetry logs, or diagnostic rails on production-facing user interfaces.
