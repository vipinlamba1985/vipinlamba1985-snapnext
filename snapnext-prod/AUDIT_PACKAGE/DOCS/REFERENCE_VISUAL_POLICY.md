# REFERENCE_VISUAL_POLICY.md — Empty States & Reference Visuals

Rule for the entire SnapNext application: **do not fabricate content of any kind to fill space.** If there is no real user data, show an honest empty state that (a) explains why nothing is there, (b) tells the user what to do next, and (c) uses only user-neutral placeholder art.

This policy applies to every screen: Journal, Memories, Timelines, Life Graph, Dashboard, Gallery, Chat, AI Studio, Community, Downloads, Admin.

---

## 1. Warm / human copy (default — approved by user)

Use warm, gentle, first-person copy on every empty state SnapNext ships to end users. This is the shipping tone.

### Journal
- Title: `Your journal is quiet today`
- Body: `Upload a memory to begin your story. SnapNext will start weaving reflections as you add photos, videos and notes.`
- CTA: `Upload a memory`

### Memories → Monthly Recap
- Title: `Your month is just beginning`
- Body: `Add a few memories and this recap will grow from your own uploads — not from anyone else's story.`

### Memories → Annual Recap
- Title: `We'll build your year with you`
- Body: `SnapNext will summarise this year from your own memories as you upload them.`

### Timeline sections (Family Journey, Travel History, Child Growth, Relationship, Pet Timeline)
- Title: `Nothing here yet`
- Body: `As you upload memories, SnapNext will thoughtfully group them into this timeline. Nothing here is ever invented on your behalf.`

### Favorites → People
- Title: `Faces will appear here as memories arrive`
- Body: `SnapNext groups people based on the photos you upload. You'll always see who and how many — never guessed emotional claims.`

### Life Graph
- Title: `Your graph will grow with you`
- Body: `As soon as memories arrive, SnapNext will start mapping the people, places and moments that matter most to you.`

### AI Chat / Memory Search
- Title: `Ask about your memories`
- Body: `Try "beach photos from last summer" or "videos with music". SnapNext will only answer from what you have uploaded.`

### Gallery
- Title: `Your gallery is waiting`
- Body: `Upload a photo or video to start your library. Everything you upload stays private to you until you choose to share it.`
- CTA: `Upload`

### Trash
- Title: `Nothing in the trash`
- Body: `Items you delete will live here for 30 days before they are permanently removed.`

### Downloads / Exports
- Title: `No exports yet`
- Body: `Start an export from Gallery, an album, or a memory. We'll email you when your ZIP is ready.`

### AI transcription unavailable
- Title: `Transcript unavailable`
- Body: `SnapNext couldn't reach the transcription service. Try again in a moment.`

### AI analysis unavailable
- Title: `Not analysed yet`
- Body: `SnapNext will analyse this memory when the AI service is available again.`

### Notifications empty
- Title: `You're all caught up`
- Body: `New activity from your favorites will appear here.`

### Billing / Subscription
- Title: `You're on the Free plan`
- Body: `Upgrade any time to unlock more storage, AI credits, and download volume.`

---

## 2. Neutral / product copy (alternative — kept for later choice)

If marketing decides the warm tone is too personal, these are the neutral alternatives. Every screen listed above has a neutral variant here.

| Screen | Neutral title | Neutral body |
|---|---|---|
| Journal | `No entries yet` | `Upload media to populate this view.` |
| Monthly recap | `No monthly recap` | `Add memories to generate this month's recap.` |
| Annual recap | `No annual recap` | `Add memories to generate this year's recap.` |
| Timeline sections | `No items yet` | `Items will appear as they are added.` |
| Favorites people | `No people yet` | `People appear once faces are recognised in your uploads.` |
| Life graph | `Graph empty` | `Data will populate as memories arrive.` |
| AI chat | `Ready` | `Type a question to search your library.` |
| Gallery | `Gallery empty` | `Upload media to begin.` |
| Trash | `Trash empty` | `Deleted items appear here for 30 days.` |
| Downloads | `No exports` | `Start an export to see it here.` |
| Transcript unavailable | `Transcript unavailable` | `Retry when the service is available.` |
| Analysis unavailable | `Not analysed` | `Analysis pending.` |
| Notifications | `No notifications` | `Activity will appear here.` |
| Billing | `Free plan` | `Upgrade for higher limits.` |

---

## 3. Visual guidelines for empty states

- **Icon**: use a neutral line icon from `lucide-react` (`ImageOff`, `Sparkles`, `MessageSquareOff`, etc.). Never a photograph.
- **Illustration**: allowed only if it is a purely geometric or abstract shape (no people, no places).
- **Sample data**: never show "example content" that looks real. If you must show a preview UI shape, use greyed-out skeleton bars.
- **Colours**: prefer 8–12% opacity white on dark surfaces (`text-white/55` for body copy, `text-white/70` for titles).
- **CTA**: always suggest the next action the user can take. Never lead with "upgrade".
- **Spacing**: 32–48px vertical padding around the empty state block; centre-aligned; max width 420px for the copy.

---

## 4. Anti-patterns (forbidden)

1. Rendering fake user data "so the UI looks alive."
2. Rendering placeholder photos of real people.
3. Rendering fabricated AI narrative ("joyful moments", "heartwarming family gatherings", etc.) without underlying evidence in the user's data.
4. Rendering hardcoded personal names, place names, or event names in placeholder texts (search suggestions, chat prompts, form placeholders).
5. Rendering example numbers (`"2,345 memories"`, `"412 photos"`) unless they are derived from the current authenticated user's real data.
6. Displaying `""` quoted around empty AI content — always guard `if (recap) { … } else { <EmptyState /> }`.

---

## 5. Reference visuals for stock imagery

If a marketing page needs stock imagery (landing page, testimonial background, feature illustration), use only:
- Purely abstract or geometric visuals.
- Photos of hardware / interfaces / gradients — never photos of identifiable people.
- Illustrations licensed for commercial use.

Under no circumstances should a real user's photo be embedded in the marketing pages.

---

## 6. Approval by user

User instruction on 04 Jul 2026: **use the warm/human copy as the default**, with the neutral/product set kept in this document for future switching. Any deviations should be recorded here as "Copy Change Log" entries with date + author.

### Copy Change Log

- **2026-07-04**: Initial policy authored. Warm copy adopted as default; neutral copy captured for future selection.
