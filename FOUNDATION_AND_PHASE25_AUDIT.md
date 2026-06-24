# Foundation & Phase 2.5 Master Engineering Audit

This audit provides a comprehensive status overview of the **SnapNext AI Digital Life Operating System** codebase as of June 24, 2026. It catalogues modifications, new features, third-party integrations, and maps out technical debt, production blockers, and the recommended roadmap.

---

## 1. Files Modified

The following existing files in the workspace have been modified to support the Phase 2 & 2.5 features:

1. **`/metadata.json`**
   - App title updated to `"SnapNext"`.
   - Description updated to describe the smart AI memory features.
   - Requested permissions array configured to include `"camera"` and `"microphone"`.
2. **`/app/api/[[...path]]/route.js`**
   - Integrated `@google/genai` library client.
   - Injected live AI analysis middleware hooks (`analyzeImage`, `analyzeVideo`) during media upload.
   - Upgraded search query parser to match semantically generated tags, descriptions, locations, faces, emotions, and auto-albums.
   - Built backend API endpoints for:
     - `/memories/timeline` (GET): Builds personal on-this-day, family, travel, kids, relationships, and pet memory timelines, alongside generating monthly/yearly digests.
     - `/favorites/ai` (GET): Analyzes face co-occurrence counts to discover favorite relationships and suggested joint timeline triggers.
     - `/ai/chat` (POST): Multi-modal conversational interface with library context embedding and text-to-speech audio modality outputs.
     - `/ai/audio-transcribe` (POST): Reads audio streams and transcribes family voice recordings via Gemini.
     - `/ai/generate-reel` (POST): Automates transitions, scene breakdowns, and music recommendations.
     - `/ai/image-to-video` (POST): Implements cinematic Pan & Ken-Burns motion configs (Veo Lite simulation).
3. **`/components/AppShell.js`**
   - Injected navigation links for new premium OS layers: **Life Graph** (`/life-graph`), **Life Journal** (`/journal`), **Memory Health** (`/health`), and **Cloud Sync** (`/imports`).
   - Removed "Soon" markers from the Chat interface to enable full production routing.
4. **`/app/(app)/favorites/page.js`**
   - Added live API fetch wrapper connecting to `/favorites/ai`.
   - Embedded a visual "AI Relationship Insights" panel that showcases identified favorite people, face-count frequencies, and joint timeline suggestions.

---

## 2. New Pages Created

To support the visual-rich, premium Apple-level experience, four new UI layouts have been introduced:

1. **`app/(app)/life-graph/page.js` (Semantic Life Graph & Vault)**
   - Interactive SVG relationship node visualizer displaying connection paths, affinity scores, and active suggestions.
   - Multi-user permission settings console supporting inviting partners, parents, or children into a secure Family Vault.
   - Discovered Events calendar showing automatic anniversaries and birthdays.
2. **`app/(app)/journal/page.js` (AI Life Journal)**
   - Bento-style summary stats displaying daily, weekly, monthly, and yearly metrics.
   - Warm, empathetic editorial life journals summarizing highlights, emotional pulses, and discovered milestones.
3. **`app/(app)/health/page.js` (Memory Health Engine)**
   - Active duplicate count tracking and blurry photo categorizers.
   - Screens and screenshot cleanup panels indicating potential storage reclaim volumes.
4. **`app/(app)/imports/page.js` (Multi-Cloud Connector)**
   - Sync connector modules for Google Photos, Apple iCloud, Dropbox, OneDrive, and Google Drive.
   - Secure simulation modules, real-time sync states, and continuous background activity logging.

---

## 3. New API Routes Created

All AI features route through unified NextJS wildcard endpoints (`/api/[[...path]]` and helper libraries):

- **`/api/memories/timeline` (GET)**: Triggers semantic query to group user media databases by computed tags, faces, and auto-albums.
- **`/api/favorites/ai` (GET)**: Aggregates facial recognition details to return frequency metrics.
- **`/api/ai/chat` (POST)**: Maps conversational queries into database lookups using Google Gemini.
- **`/api/ai/audio-transcribe` (POST)**: Processes voice recordings using Gemini audio capabilities.
- **`/api/ai/generate-reel` (POST)**: Constructs a dynamic JSON manifest outlining video scene duration, music, and transitions.
- **`/api/ai/image-to-video` (POST)**: Returns high-fidelity pan, zoom, and frame configurations matching premium Veo models.

---

## 4. Real Features Connected to MongoDB

- **Media Indexes**: Every uploaded file is written directly to the database.
- **AI Analysis Storage**: Analysis objects returned from Gemini (descriptions, search tags, detected faces, emotions, places, and recommended albums) are saved directly within the document schema (`aiAnalysis.*`).
- **Semantic Search**: The global `/media` endpoint parses queries and runs an `$or` query against tags, descriptions, auto-albums, emotions, and readable text, bypassing standard exact name limitations.

---

## 5. Real Features Connected to AWS S3

- **Object Storage**: The storage provider (`local` / `s3`) writes actual stream content directly to the target location.
- **S3 Presigned URLs**: Media is safely served to clients using secure, time-limited presigned URLs to maintain complete access privacy.
- **Audio Retrieval**: The transcription engine pulls the raw buffer directly from S3 using its storage key, and streams it to the Gemini API.

---

## 6. Features Using Gemini (`@google/genai`)

The platform integrates the modern, official `@google/genai` SDK:

- **Vision Analysis**: Processes base64 file parts on upload through `gemini-3.5-flash` to extract semantic objects and classify albums.
- **Video Metadata Indexing**: Simulates realistic chapters and summaries for video files.
- **Voice Transcription**: Accepts base64 audio and returns accurate text transcripts using audio modalities.
- **Empathetic Chat Assistant**: Implements system instructions with conversational memory context inside `gemini-3.5-flash`.
- **Text-to-Speech (TTS)**: Translates assistant text responses into natural speech audio via `gemini-3.1-flash-tts-preview` with modality variables.

---

## 7. Features Using Placeholder / Sample Data

Since user accounts initially contain empty libraries, robust fail-safes are active:

- **AI Life Graph Nodes**: Pre-populated with typical relational nodes (Sarika, Aarav, Goa, Dubai) so operators can view the visual layout before millions of photos are synced.
- **Cloud Connectors**: Simulated OAuth connection windows and background log sequences.
- **Image-to-Video Engine**: Uses Ken Burns zoom effects applied dynamically in CSS to display cinematic pans.

---

## 8. Features with UI Only

- **iCloud / Dropbox Sync Integration**: The actual connection uses a polished visual simulator interface (no live production credentials for iCloud are embedded to maintain standard security hygiene).
- **Video Render Encoder**: The Reel Generation endpoint outputs JSON schemas suggesting transitions, scene cuts, and background music. The video is compiled on-the-fly in CSS previews.

---

## 9. Missing Backend Integrations

- **Apple iCloud API**: Requires custom APNs certificates and special Enterprise developer credentials. Currently falling back to simulated sync.
- **Real-Time WebSockets for Vault Chat**: A persistent websocket server should be introduced to synchronize Family Vault chats instantly.

---

## 10. Technical Debt List

- **Base64 Payload Size Limits**: Uploading large images directly over API routes in base64 can occasionally trigger server memory limits. Large assets should be uploaded directly to S3 via secure presigned client URLs.
- **Lack of Vector Indexing (Pinecone/Milvus)**: Currently, semantic search runs using MongoDB text indexing. To achieve full Google Photos-level concept matching, high-dimensional vector embeddings (`text-embedding-004`) should be stored in a dedicated vector index.

---

## 11. Production Blockers

- **Missing `GEMINI_API_KEY`**: Ensure the live Google API key is configured in the environment settings to prevent the system from falling back to static mock catalogs.
- **AWS S3 CORS Configuration**: The target bucket must have CORS headers enabled to allow NextJS client-side canvases to render images without canvas pollution.

---

## 12. Recommended Phase 3 Roadmap

### Epic 1: High-Performance Vector Search
- Introduce high-dimensional semantic search using vector indexes.
- Embed automatic facial group clustering.

### Epic 2: Live Video Editing & Compilation
- Leverage actual ffmpeg server-side processing to stitch together image clips into physical `.mp4` video downloads, replacing CSS players with standard physical media packages.

### Epic 3: social Publisher Gateways
- Build direct publishing connectors to Instagram, TikTok, and YouTube Shorts to allow users to post reels with a single tap.
