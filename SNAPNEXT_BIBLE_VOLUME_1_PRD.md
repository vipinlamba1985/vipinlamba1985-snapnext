# SnapNext AI — Master Engineering Bible
## Volume 1: Product Foundation & Vision
### Part 1: Official Product Requirements Document (PRD)

---

## Document Control & Metadata
*   **Document ID:** SN-PRD-V1P1-2026
*   **Version:** 1.0.0-PROD
*   **Author:** Lead Product Architect & Chief Systems Architect
*   **Target Audience:** Engineering, Design, QA, and AI Systems Teams
*   **Status:** APPROVED FOR DEVELOPMENT BASELINE
*   **Classification:** Confidentially Open (Internal Developer Bible)

---

## 1. Executive Vision

### 1.1 Why SnapNext Exists
Humanity is capturing more media than at any point in history. The average smartphone user takes between 150 and 250 photos per month. In aggregate, trillions of digital memories are captured annually. Yet, as the volume of media expands exponentially, our connection to these moments collapses. 

Our digital memories have been reduced to flat, unorganized files stored in expensive cloud buckets. They are scattered across disparate platforms—Apple Photos, Google Drive, private WhatsApp threads, expired Instagram Stories, and local hard drives. 

We capture to remember, yet we store to forget.

SnapNext exists to solve this fundamental paradox of the digital age. It is built to rescue our personal histories from the digital graveyard of raw file storage. It transforms raw binary media (JPEG, PNG, MP4, HEIC) into an active, conversational, and private memory landscape. It is not a place where files go to die; it is the living home where memories are preserved, contextualized, understood, and relived.

### 1.2 Mission Statement
> To build the world’s most intelligent, private, and human-centric digital memory platform—transforming scattered media into an organized, searchable, and emotionally resonant legacy for individuals and families across generations.

### 1.3 Vision Statement
> To define the "Digital Life Operating System" category, establishing a secure haven where every captured moment, relationship, and personal story remains permanently protected, deeply understood, and effortlessly accessible—evolving over decades into a dynamic, interactive family legacy.

### 1.4 Comprehensive Problem Statement
The modern consumer media ecosystem is fundamentally broken across three core dimensions: organization, privacy, and legacy.

#### 1.4.1 The Legacy Storage Bloat Problem
Standard consumer cloud platforms (Google Photos, iCloud) operate on a "utility landlord" model. Their business incentive is to encourage infinite, unorganized uploads of duplicates, accidental screenshots, blurry bursts, and work-related document scans. By turning a blind eye to digital clutter, they force users into higher-paying storage tiers. Users pay monthly rent on digital waste.

#### 1.4.2 The Privacy Deprivation Problem
Public cloud platforms are owned by advertising and data conglomerates. Your personal photos, family gatherings, and childhood milestones are treated as raw material to train massive multi-modal ad targeting engines and public models. The user is forced to choose between the convenience of cloud synchronization and the sanctity of personal privacy.

#### 1.4.3 The Emotional Void (Lack of Soul)
A chronological grid of squares is not a memory home; it is an index of files. Existing galleries lack any understanding of human relationships, emotional narratives, or life milestones. They cannot tell you *why* a photo is important, *how* the people in it are connected to you, or *what* story was unfolding behind the lens.

### 1.5 The Future Vision (Decade Scale)
Over the next ten years, SnapNext will transition from an AI-assisted media vault into an interactive legacy engine. As the platform safely archives a user's life-graph, it will enable:
1.  **Generational Memoirs:** Automated generation of high-quality, physical and digital books with human-sounding narrative voiceovers.
2.  **Autonomous Family Timelines:** Interactive, multi-user genealogical trees where memories from grandparents, parents, and children are automatically cross-referenced and preserved.
3.  **Active Legacy Conversations:** Interactive voice interfaces allowing descendants to converse with a secure, highly restricted AI persona synthesized from a departed relative's curated journals and oral histories (strict opt-in only).

---

## 2. Product Philosophy

SnapNext is guided by eight non-negotiable UX and architectural pillars. If a proposed feature does not reinforce these pillars, it is discarded.

```
       [ PRIVACY FIRST ]  =======>  Zero external ad-profiling or training
               ||
       [ SIMPLICITY    ]  =======>  One-click interactions, natural language
               ||
       [ EMOTION-FIRST ]  =======>  Context, relationship-mapping, storytelling
               ||
       [ PERMANENCE    ]  =======>  Generational durability & loss prevention
```

### 2.1 Simple
The interface must be clean of technical jargon. There are no "directories," "buckets," or "parallel stream configuration settings" exposed to the end user. Interaction patterns must be intuitive enough for a 7-year-old child uploading a drawing and an 85-year-old grandparent viewing a family timeline. 

### 2.2 Elegant
We embrace Swiss-Modernist design principles: generous negative space, high-contrast layouts, precise editorial typography, and subtle micro-animations. The product must feel like a premium coffee-table monograph, not an enterprise database manager.

### 2.3 Fast
Performance is a core usability requirement. Media loading must feel instant. We utilize lazy-loading image skeletons, client-side pre-fetching, and direct parallel-stream uploads that bypass server bottlenecks. A sluggish interface breaks the magic of reliving memories.

### 2.4 Trustworthy
We never lose a single byte of user data. Storage layers utilize redundant multi-region block storage with automated transaction logging and continuous integrity checks. Trust is earned over decades but lost in a millisecond.

### 2.5 Private
Your data is yours alone. All AI metadata extraction, facial clustering, and semantic indexing are isolated to dedicated, single-tenant server-side environments or run entirely locally where possible. We do not sell data, track locations for ads, or profile users.

### 2.6 Human
The tone of our AI assistant is empathetic, warm, objective, and respectful. It does not use robotic or technical terminology. It addresses users as humans with rich lives, not as account records in a database.

### 2.7 Magical
The platform must surprise and delight. This is achieved through proactive, intelligent contextualization—such as automatically clustering old photos of a child to show a "Growing Up" transition, or identifying a long-forgotten favorite place and asking if the user wants to write a short entry about it.

### 2.8 Helpful
AI must assist, never overwhelm. It works silently in the background, cleaning up screenshot clutter, sorting blurry frames, and generating accurate search indexes, stepping into the foreground only when explicitly summoned.

---

## 3. Problems to Solve (The Consumer Landscape Audit)

To design a superior product, we must deeply analyze the failures and user frustrations of existing platforms.

### 3.1 Legacy Gallery Failures (Apple & Google Photos)
*   **The Chronological Dump:** Both platforms default to an endless scroll of chronological files. Screenshots, receipts, memes, work slides, and actual family memories are mixed together, diluting the value of the grid.
*   **Intrusive, Opaque AI:** Users have zero control over how these platforms use their photos for model training. The algorithms operate as black boxes, popping up unrequested, sometimes inappropriate memories at wrong times (e.g., displaying photos of a deceased relative or an ex-partner without sensitivity controls).
*   **Subscription Trap:** They offer cheap entry-level tiers but escalate pricing sharply once a user's library crosses the free threshold, leveraging decades of unorganized personal memories as hostage equity.

### 3.2 General Storage Failures (Dropbox, Google Drive, OneDrive)
*   **No Media Understanding:** These are filesystems, not galleries. They do not parse EXIF data, understand visual context, cluster faces, or allow conversational search.
*   **Extreme Friction:** Users must manually create, rename, and manage complex nested folders. If a folder structure is broken, the entire library becomes an unsearchable labyrinth.
*   **Zero Storytelling:** They cannot group photos of a trip automatically, generate captions, or help users write journal entries associated with their media.

### 3.3 Social Media Traps (Instagram, Snapchat)
*   **The Vanity Metric Loop:** Social networks are built on public validation—likes, comments, views, and algorithms designed to maximize screen time. This discourages users from uploading real, unpolished personal moments.
*   **Temporary Retention:** Snapchat and Instagram Stories prioritize ephemeral content that disappears. This destroys the long-term preservation of life milestones.
*   **Data Degradation:** Social platforms aggressively compress and strip high-resolution images of their metadata, rendering them useless for physical archiving or high-fidelity displays.

### 3.4 Creator, Traveler, and Professional Bottlenecks
*   **Content Creators:** Face massive disorganization when attempting to match draft clips with original assets. They lack intelligent metadata catalogs that let them find raw files by describing the scene.
*   **Travelers:** Lose geographic context over time. Standard maps show random pins but fail to group trips into coherent, chronological travel narratives that combine routes, dates, and local observations.
*   **Families & Elderly Parents:** Grandparents struggle with complicated cloud sharing links, login walls, and nested folders. They want a simple, direct portal where children's milestones appear automatically, paired with natural voice search and audio playback features.

---

## 4. Why SnapNext Exists (The Value Proposition)

SnapNext is designed to command a premium in the market. Here is why users will migrate, pay, trust, and advocate for it:

```
+------------------------------------------------------------+
|                    THE TRUST CYCLE                         |
|                                                            |
|  [ PRIVACY CONTROL ] ---> [ EMOTIONAL MAGIC ]              |
|          ^                        |                        |
|          |                        v                        |
|  [ DAILY ADVOCACY  ] <--- [ PRODUCTIVITY VALUE ]           |
+------------------------------------------------------------+
```

### 4.1 The Migration Trigger (Why They Will Switch)
Users migrate to SnapNext when they reach "cloud fatigue." When their Google or iCloud storage is full of unorganized junk, or when they realize they can no longer find meaningful photos of their loved ones among thousands of screenshots. The promise of **"One-Click Cleanup"** and **"Semantic Memory Recovery"** serves as the initial migration magnet.

### 4.2 The Monetization Argument (Why They Will Pay)
SnapNext does not monetize through advertisements. Users pay a transparent subscription (Plus, Pro, Family, or Lifetime) because they value:
1.  **Guaranteed Privacy:** A contractual commitment that their data will never be sold, mined, or used for advertising.
2.  **Autonomous Organization:** Saving dozens of hours otherwise spent sorting, tagging, and deleting clutter.
3.  **Generational Preservation:** Absolute file integrity, lossless storage, and standard format exports that prevent proprietary lock-in.

### 4.3 Establishing Unshakeable Trust
We establish trust through open standards:
*   **Zero Lock-In:** One-click, structured exports of all media, preserved with original EXIF data, paired with cleanly formatted JSON files containing all user-created journals, tags, and AI metadata.
*   **Granular Consent:** Simple, explicit toggles for every AI capability. Users decide exactly what is processed, when it is analyzed, and who has access to the metadata.

---

## 5. Target User Personas & Usage Patterns

To build cohesive interfaces, we map every feature to nine target user profiles.

### 5.1 The New Parent (Sarah, 32)
*   **Goals:** Safely document every milestone of her newborn child; share daily updates with grandparents without exposing her child’s identity on public social platforms.
*   **Pain Points:** Existing baby books are tedious to update; sharing via family chat apps (WhatsApp/iMessage) compresses photos, loses dates, and scatters memories across threads.
*   **Device Mix:** iPhone 15 Pro, iPad Air, MacBook Air.
*   **Storage Needs:** High (500GB+ of 4K video and RAW images).
*   **AI Needs:** Auto-clustering of her child's face, automatic age-tagging (e.g., "Liam - 3 months old"), and automated "Milestone Book" drafts.

### 5.2 The Generational Family (The Patel Family)
*   **Goals:** Maintain a collaborative, cross-generational archive of ancestral history, family reunions, and shared holiday moments.
*   **Pain Points:** Family memories are scattered across four different households, multiple physical albums, and different cloud accounts. Grandparents cannot figure out how to access shared folders.
*   **Device Mix:** Android phones, old Windows laptops, smart TVs, iPads.
*   **Storage Needs:** Massive (2TB+ shared Family Vault).
*   **AI Needs:** OCR scanning of old digitized paper photos, auto-tagging of historical family members, and collaborative timeline compilation.

### 5.3 The Adventure Traveler (Marcus, 28)
*   **Goals:** Capture high-fidelity geographic trips, trail routes, and cultural interactions; relive travel logs in an interactive, fluid spatial dashboard.
*   **Pain Points:** Map views in other apps are slow and simply show a clutter of pins without chronological flow or narrative context.
*   **Device Mix:** Google Pixel 8, GoPro Hero 12, MacBook Pro.
*   **Storage Needs:** Very High (1TB+ of high-bitrate 4K video).
*   **AI Needs:** Automatic geographic trip grouping, landmark identification, translation of signs inside photos (OCR), and narrative travel-diary generation.

### 5.4 The Content Creator (Chloe, 24)
*   **Goals:** Quickly locate high-quality B-roll, specific expressions, or location-based clips from her massive historical media library to repurpose for current projects.
*   **Pain Points:** Spends hours scrolling through random filenames (e.g., `IMG_4920.MP4`) looking for a specific scene or lighting condition.
*   **Device Mix:** iPhone 15 Pro Max, Sony Alpha 7 IV, high-end PC, iPad Pro.
*   **Storage Needs:** Extreme (4TB+ of raw media).
*   **AI Needs:** Advanced semantic search (e.g., *"Find video clips of me laughing in golden hour lighting"*), auto-tagging of video frames, and dynamic aesthetic clustering.

### 5.5 The Digital Professional (David, 45)
*   **Goals:** Maintain a strict wall between professional reference media (receipts, real estate listings, project whiteboards) and personal family memories.
*   **Pain Points:** Work-related photos pollute his personal camera roll, throwing off chronological family memories.
*   **Device Mix:** Samsung Galaxy S24 Ultra, Lenovo ThinkPad.
*   **Storage Needs:** Moderate (200GB).
*   **AI Needs:** OCR text extraction, document classification, automatic categorization of work items, and seamless export of receipts to expense reports.

### 5.6 The Senior Citizen (Robert, 74)
*   **Goals:** Easily relive his life stories; view updates from his children and grandchildren without technical confusion.
*   **Pain Points:** Small font sizes, complex navigation, hidden menus, and the constant fear of accidentally deleting something.
*   **Device Mix:** Android tablet, desktop computer, physical printouts.
*   **Storage Needs:** Low (50GB).
*   **AI Needs:** High-fidelity Text-to-Speech (TTS) to listen to family journals, voice-activated memory search, and automatic magnification of text.

---

## 6. User Emotions (The Emotional Journey Map)

We design the software to guide the user through a deliberate sequence of emotional states over their lifecycle.

```
[ STAGE ]            [ CURRENT STATE ]                  [ TARGET EMOTION ]
----------------------------------------------------------------------------
1. Acquisition  ---> Overwhelmed by clutter, anxious   ---> Relieved, in control
2. Activation   ---> Skeptical of AI and privacy        ---> Amazed, respected
3. Retention    ---> Passive user                       ---> Introspective, connected
4. Generational ---> Legacy-minded                      ---> Deeply secure, nostalgic
```

### 6.1 Phase 1: Onboarding (Relief & Control)
*   *Before:* The user is anxious. Their photos are spread across multiple clouds and devices. They feel disorganized and fear losing irreplaceable records.
*   *Onboarding:* As they drag-and-drop their first folders, the system immediately displays high-speed, clean progress lines. The message is: *"We have received your memories. They are safe now. You are in control."*

### 6.2 Phase 2: First Upload & AI Analysis (Wonder & Trust)
*   *During:* The user expects a standard, dry file-index. Instead, they witness the AI engine safely analyze their photos in the background—clustering key people, extracting elegant tags, and presenting their first curated timeline.
*   *The Feeling:* A sense of magic. They ask the assistant: *"Who is the child in the blue jacket?"* and the system instantly surfaces a long-forgotten family gathering from five years ago.

### 6.3 Phase 3: Mature Usage (Nostalgia & Integration)
*   *After 1 Year:* The user interacts with their **Life Graph** and **AI Journal** daily. They no longer see SnapNext as a utility. It has become an extension of their personal narrative. They feel deeply rooted, grounded, and connected to their relationships and past self.

---

## 7. Core Product Values

Our technical and product decisions are governed by ten foundational values:

1.  **Privacy First:** Security and data boundaries are absolute. We never sell, rent, or profile user data. All processing occurs under strict, verified single-tenant cloud boundaries.
2.  **AI Second:** Artificial Intelligence exists to serve human reflection, not to replace it. AI acts as an assistant, organizer, and indexer, keeping the human in the center of every emotional experience.
3.  **Human Always:** We maintain an authentic, warm, and humble voice. We avoid gamification, manipulative metrics, and dark patterns.
4.  **Security by Design:** Every layer of our technology stack—from Supabase Auth to AWS S3 storage buckets—is protected by strict access controls, data encryption at rest and in transit, and continuous security audits.
5.  **Simplicity:** We favor a single, polished view over multiple cluttered screens. We eliminate redundant buttons, complex settings, and unnecessary configuration menus.
6.  **Speed:** Every interaction, scroll, page render, and file download must occur with sub-second latency. Speed is the foundation of user delight.
7.  **Trust:** We provide complete transparent access to user data. No proprietary formats, easy exports, and honest data quotas.
8.  **Family:** We prioritize collaborative spaces. The "Family Vault" must feel like a shared digital home, protecting shared heritages.
9.  **Ownership:** We believe users own their digital lives. We provide complete physical-copy export tools, ensuring digital permanence.
10. **Accessibility:** We optimize for high contrast, clear visual paths, and screen-reader compatibility. We design for everyone, regardless of age or physical capability.

---

## 8. Competitor Analysis & Market Positioning

To win, SnapNext must exploit the specific structural weaknesses of legacy clouds and file platforms.

| Vector | SnapNext AI | Google Photos | Apple Photos | Dropbox / Drive | Instagram |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Privacy Model** | Contractual Zero-Ad Privacy | Ad targeting & model training | Device-locked ecosystem lock-in | Corporate workspace focus | Public profiling & ad-revenue |
| **Search Capabilities** | Contextual, Multi-Modal Semantic Chat | Text search, basic labels | Basic local object tagging | Title & folder-name matching | Hashtags & caption search |
| **Organization Model** | AI-Powered Life Graph | Simple face/place clustering | Local device grouping | Manual nested folders | Linear chronofeed |
| **Family Sharing** | Secured Shared Vaults | Simple link sharing | Shared iCloud albums | Shared folders | Public profile posts |
| **Data Sovereignty** | 100% EXIF Export, No Lock-In | Restrictive batch download limits | Hard ecosystem lock-in | Plain file export | Extreme compression, stripped EXIF |

### 8.1 SWOT Analysis

#### 8.1.1 Strengths
*   Modern, full-stack Next.js 15+ App Router codebase optimized for high-speed performance.
*   Empathetic Gemini AI integration supporting rich semantic search, multi-modal context parsing, and voice synthesis.
*   Secure, unified, and local-first architecture supporting dual authentication (local JWT and Supabase Auth).
*   Beautiful, Swiss-Modernist UI prioritizing generous negative space, Inter/Space Grotesk typography, and adaptive dark canvas aesthetics.

#### 8.1.2 Weaknesses
*   High storage bandwidth costs associated with serving raw, uncompressed 4K media and RAW photographs.
*   Dependency on external multi-modal APIs (Google Gemini) for high-context conversational loops.
*   Establishing brand trust as a new player compared to established trillion-dollar tech conglomerates.

#### 8.1.3 Opportunities
*   Growing global consumer backlash against invasive big-tech ad tracking and data mining.
*   Increasing demand from families for a safe, secure, non-social space to archive and share children’s milestones.
*   The massive volume of unstructured personal data requiring smart, automated sorting tools (Memory Health).

#### 8.1.4 Threats
*   Drastic price drops in cloud storage by competitors (Google One, iCloud) eating into subscription margins.
*   Sudden updates to mobile OS restrictions (iOS, Android) designed to limit background media backups to third-party tools.

---

## 9. Product Differentiators (The Core Pillars)

### 9.1 AI Memory OS
SnapNext is not a gallery; it is an operating system for your memories. It reads visual data, transcription histories, and user-provided journals to compile a comprehensive, queryable mental model of a user's life. The AI understands that "Liam" is your son, "The Red Cabin" is your family's vacation spot, and "Last Summer" refers to the trip to Oregon in July 2025.

### 9.2 Shared Family Vaults
A highly secured, separate partition of cloud storage where family members can deposit memories. When a photo is added, it is automatically sorted into shared timelines and relationship graphs, notifying designated family members. 

### 9.3 Favorites Relationship Graph
Instead of a simple star icon, favoriting an item in SnapNext maps its connection to people, places, and events inside the user's **Life Graph**. Favourited items are prioritized in conversational search queries and weekly highlights.

### 9.4 Semantic Life Graph
A fluid, interactive visual canvas mapping the central entities of a user's life—Family, Close Friends, Places, Pets, and Events. Users can navigate their life visually by clicking nodes on the canvas, opening historical records, timelines, and conversational search threads for that specific entity.

### 9.5 Curated AI Journal
The system automatically curates daily, weekly, or trip-based summaries. It acts as an interactive prompt, displaying a beautiful layout of a weekend's photos and gently asking the user: *"This looked like a wonderful Sunday. Would you like to save a memory about what you and Liam talked about at the park?"* The user's typed or spoken response is saved as a permanent personal journal entry, indexed alongside the media.

### 9.6 Memory Health
The ultimate digital cleanup utility. Operates in the background to scan for:
*   **accidental screenshots** (e.g., ticket QR codes, map directions, random notes) and groups them for bulk archiving.
*   **blurry or out-of-focus bursts** to suggest optimal frame saves.
*   **duplicate files** using high-performance local cryptographic hashing (SHA-256).

### 9.7 Creator Assistant
An intelligent cataloging companion for videographers and creative professionals. Allows creators to find specific scenes instantly by describing visual mood, camera movement, or clothing colors (e.g., *"Find slow-motion clips of waves crashing against rocks in warm sunset lighting"*).

### 9.8 Smart Backup
A multi-threaded, parallelized backup system that works seamlessly across desktop and mobile browsers. It checks local file signatures against the cloud before initiating streams, avoiding bandwidth waist and duplicate files.

---

## 10. Long-Term Strategic Roadmap

```
+-------------------------------------------------------------+
|                     STRATEGIC MILESTONES                    |
|                                                             |
|  [ VERSION 1.0 ]  ==>  Focus: Core Vault, Smart Upload,      |
|                       Private Local/Supabase Auth, AI Search|
|                                                             |
|  [ VERSION 2.0 ]  ==>  Focus: Shared Family Vaults,         |
|                       Active Memory Health, Relationship Graph|
|                                                             |
|  [ VERSION 3.0 ]  ==>  Focus: Life Graph Canvas,            |
|                       Automated Offline Curations, Print Engine|
+-------------------------------------------------------------+
```

### 10.1 Version 1.0 (Foundation Launch)
*   **Focus:** Perfecting the core vault experience, secure fast uploads, and conversational search.
*   **Deliverables:**
    *   Full-stack Next.js App Router workspace with MongoDB persistence.
    *   Dual authentication pathways (local credentials and Supabase).
    *   Direct AWS S3 multipart streaming upload pipeline with pre-signed temporary URLs.
    *   Basic conversational AI search assistant utilizing Google Gemini.
    *   Standard responsive grid interface with month groupings and beautiful light/dark slate aesthetics.

### 10.2 Version 2.0 (The Family & Cleanup Expansion)
*   **Focus:** Extending platform utility to multi-user collaborative environments and library health.
*   **Deliverables:**
    *   Multi-user Shared Family Vaults with granular access rules.
    *   Memory Health Console supporting screenshot classification, duplicate hashing, and blur detection.
    *   Curated AI Journal with automated memory reflection prompts.
    *   Interactive OCR and sign translation for travel-media curation.

### 10.3 Version 3.0 (The Legacy Engine)
*   **Focus:** Visual relational graphs, automated physical prints, and generational preservation.
*   **Deliverables:**
    *   Interactive canvas interface for the **Semantic Life Graph**.
    *   "Print Home" integration enabling one-click generation of high-quality physical family books.
    *   Offline-first mobile synchronization support.
    *   Full multi-format structured exports ensuring zero platform lock-in.

---

## 11. Key Performance Indicators (Success Metrics)

To evaluate platform health and feature adoption, the systems monitor eleven core metrics:

1.  **Daily Active Users (DAU) & Monthly Active Users (MAU):** Tracks user engagement frequency.
2.  **Backup Velocity (Upload Success Rate):** Measures the percentage of uploaded files that successfully complete streaming to S3 without error.
3.  **Search Latency:** The round-trip time of natural-language queries. Target is sub-1.5 seconds.
4.  **Clutter Reduction Rate:** Volume of digital waste (screenshots, blurry photos) successfully archived or deleted via the Memory Health console.
5.  **Retention Rate (Cohort Analysis):** Percentage of users who remain active 30, 90, and 365 days after signup. Target is >65% at D90.
6.  **AI Assistant Interaction Rate:** Number of queries submitted to the conversational chat interface per active session.
7.  **Family Vault Invitation Velocity:** Number of shared vaults created and collaborative members successfully onboarded.
8.  **Subscription Conversion Rate:** Percentage of free-tier users upgrading to Plus, Pro, or Lifetime options.
9.  **Storage Utilization Efficiency:** Average cost of cloud storage per terabyte of user data managed.
10. **Customer Satisfaction Score (CSAT):** Captured via non-intrusive, occasional user feedback loops inside the profile settings panel.
11. **System Uptime:** Continuous server and database availability. Target is 99.99%.

---

## 12. Core Product Principles

Every future feature, code edit, and design sprint must strictly adhere to these seven non-negotiable guidelines:

*   **User Benefit First:** Every feature must solve a documented human problem, reducing cognitive load and visual clutter.
*   **Privacy by Default:** Privacy settings must always default to the highest level. Sharing and data-analysis permissions are strictly opt-in.
*   **Never Sacrifice Security for Convenience:** We do not bypass verification paths, authentication gates, or encryption standards to shave off milliseconds.
*   **Minimize Friction:** We minimize clicks, forms, and steps. The quickest path to a clean library or a recovered memory is always the best.
*   **Keep Interfaces Intuitive:** Avoid hidden gestures, non-standard navigation bars, or nested settings menus. The interface should explain itself.
*   **Preserve Existing Functionality:** We never break existing database entries, file metadata, or S3 objects when introducing platform upgrades.
*   **Design for Global Users and Accessibility:** We support multiple languages, clear typography sizing, high-contrast layouts, and seamless screen-reader operation.

---

## End of Volume 1, Part 1
### SnapNext AI Master Engineering Bible Baseline Authorized.
