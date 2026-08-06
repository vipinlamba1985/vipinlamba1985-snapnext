# Voice-to-Web Handoff for an AI Receptionist: An Opinionated Product & Technical Blueprint

> Companion doc to `AI_RECEPTIONIST_SAAS_BLUEPRINT.md` — a deeper, opinionated look at one
> specific feature (mid-call SMS→web handoff) for that same standalone AI receptionist SaaS
> idea. Not part of the SnapNext product; kept at the repo root for reference.

## TL;DR

- **The mid-call SMS-to-web handoff is real, proven at enterprise scale, and NOT yet table stakes for SMB AI receptionists — but the funnel is brutal and vendor-inflated: plan for only ~15-35% of callers to opt in, ~20-36% of delivered texts to be tapped, and a meaningful minority of callers (landline-originated) who can't receive an SMS at all. Build it as an *escalation path*, not the default.** For 70-80% of SMB calls (book me in, are you open, simple quote), a 60-second voice-only completion wins on speed and satisfaction.
- **The defensible wedge is not "we text a link" (Rosie, Slang.ai, Numa, Podium already do versions of this) — it is the *stateful warm handoff*: the web page opens pre-populated with everything the AI already learned, the voice agent stays on the line and narrates while the caller taps, and the call only ends when the task is confirmed complete.** That co-browse-while-live experience is what produces the "wow," and almost nobody does it well for SMBs in 2026.
- **Ship a ruthless MVP in 4-6 weeks under $5K: conditional call-forwarding + a voice agent (Vapi/Retell/Bland at ~$0.07-0.15/min) + a tokenized no-login web app on your existing Next.js/MongoDB/Supabase stack + branded short-domain SMS via Twilio/Telnyx. The single wow demo: caller asks a plumber for a quote, gets a text mid-call, taps it, sees available slots + uploads a photo of the leak, books — all while the AI narrates, in under 60 seconds.**

## Key Findings

**1. The mechanic is well-established under the name "visual IVR" / "call deflection to digital" / "voice-to-web."** It has existed for over a decade, pioneered by enterprise vendors (Zappix, Jacada/Uniphore, Radish/Kelvin, Genesys, NICE, Callvu). The canonical flow is exactly the founder's concept: a voice prompt offers self-service, an SMS with a link is sent, and the caller resolves the task in a visual web app on their smartphone.

**2. The enterprise results are strong but vendor-sourced.** Zappix advertises containment rates of "over 80%" and one arts-and-crafts retailer case at "over 75% call containment," with NPS scores of 82-83. Traditional voice IVR containment is cited at 20-30%. But these are marketing numbers from the vendor selling the product.

**3. The make-or-break funnel is far less rosy than headline containment numbers suggest.** Independent-leaning synthesis:

- **Opt-in:** Zappix states verbatim that "these common use cases create up to 80% of inbound call volumes at many contact centers" and that "15-35% of callers opt in to Visual IVR self-service when they are presented with the option." Vendor claims across the market range from a deployed low of ~5% (Centrica/WhatsApp via Webex) to best-case 65-80% (Callvu, with strong scripting). A defensible planning range is **15-40%**.
- **Tap-through:** No independent data isolates the mid-call SMS-link tap rate. Transactional SMS click-through proxies cluster around **20-36%** (MessageDesk ~36%, others 14-28%).
- **Completion:** Only vendor data exists — roughly **44-69%** of those who engage complete the task (Jacada).
- **Landline ceiling:** A meaningful share of callers simply cannot receive an SMS. BIA/Kelsey's 2016 "Call Commerce" report states verbatim that "mobile calls represent 60 percent of inbound calls to businesses in 2016… 85 billion global mobile calls annually, a figure that will grow to 169 billion by 2020" — implying ~40% could not receive a text then; the mobile share is higher now but non-trivial landline traffic remains, especially among older callers.

**4. Visual IVR never became universal for good reasons.** Critics (including vendors like Alvaria) call it "a technology-first, not customer-first mentality" and "a stop-gap technology." Failure modes: it was built to preserve legacy IVR investment rather than fix the underlying experience; opt-in is low; it excludes landline/low-digital-literacy/elderly callers; and poorly designed handoffs just add a step. This is a direct warning for the SMB version.

**5. Down-market fit is real but narrow.** For a plumber/salon/dentist, most calls are simple ("book me in," "are you open") and are better finished by voice in 60 seconds. The visual handoff genuinely wins only for specific, higher-complexity intents: restaurant food ordering, multi-service selection, photo upload for a repair quote, showing available appointment slots visually, price lists, insurance/intake forms, and accessibility cases (hard-of-hearing callers, non-native speakers).

**6. Competitors already do parts of this — so "text a link" alone is not differentiating.** Rosie texts appointment/booking links mid-call (gated to its $149/mo Scale plan; "over 23,000 appointment links" sent). Slang.ai texts a link for restaurant orders and wine lists rather than completing by voice. Numa runs the full missed-call-to-text-thread loop for dealerships. Podium, Weave, Cira, and others send scheduling links by text. The gap none fill well for SMBs: a *stateful, co-browsed, pre-populated* handoff where the voice agent stays live.

## Details

### 1. Validating and naming the mechanic

The pattern the founder describes is textbook **visual IVR** (also "call deflection to digital," "voice-to-web," "SMS deflection," "agentic call deflection"). Zappix describes the exact mechanic: "When they choose it, Zappix or a partner sends a text message with a link to the Visual IVR. The customer then resolves the reason they called using their mobile phone, all in simple to use visual menus."

**Vendors selling it today (all enterprise-oriented):** Zappix, Jacada (now Uniphore), Callvu, Radish Systems (Kelvin/ChoiceView), Genesys (visual IVR), NICE, Five9, Talkdesk (via Zappix AppConnect), Cisco/Webex, Verint, Mosaicx, IVR Technology Group, Nuance/Microsoft. Note these are all built for large contact centers with high call volumes — none are designed for a solo-operated plumbing shop.

**Measured results (clearly separated by source type):**

| Metric                                       | Figure                                                          | Source type           |
|-----------------------------------------------|-------------------------------------------------------------------|--------------------------|
| Containment (Zappix, general)                 | "over 80%"                                                        | Vendor marketing        |
| Containment (Zappix arts & crafts retailer)   | "over 75%," saved $47k, 13k calls deflected in 3 months, NPS 83  | Vendor case study       |
| Containment (traditional voice IVR baseline)  | 20-30%                                                             | Widely cited             |
| Opt-in to visual IVR when offered             | 15-35%                                                             | Vendor (Zappix)          |
| Opt-in range across market                    | 5% (low) to 65-80% (best-case)                                    | Vendor claims             |
| First-year diversion rate                     | 30-40%, climbing to 80-90% by year 3                               | Vendor (Callvu)          |
| Transactional SMS link CTR (proxy)            | ~20-36%                                                            | SMS-vendor benchmarks    |
| Completion once engaged                       | 44-69%                                                             | Vendor (Jacada)          |
| Conversational/AI IVR containment             | 40-60%                                                             | Multiple 2026 guides     |

**The critical skepticism:** Multiply the funnel through and the reality is sobering. If 25% opt in, ~30% of those who get a text tap it, and ~55% of those complete, then the mid-call SMS-web path *fully completes* for only about **4% of all callers** as a standalone mechanism. That is why the handoff must be one branch of a fallback ladder, not the primary path. The voice agent must be capable of completing the most common tasks by voice, and use the web handoff only where it genuinely adds value.

### 2. Is this the right refinement for an SMB product?

**Honest assessment: partially.** Visual IVR was designed to strip cost out of high-volume enterprise contact centers where 80% of calls are a handful of repetitive transactional intents (order status, balance checks, W-2 requests). An SMB gets a few to a few-dozen calls a day, often from local repeat customers, and the "task" is usually trivial.

**Voice-only vs. hybrid handoff — decision rule:**

| Complete BY VOICE (fast path)                            | Trigger the SMS/WEB HANDOFF                                    |
|-------------------------------------------------------------|---------------------------------------------------------------------|
| "Are you open / what are your hours"                       | Restaurant food ordering (multi-item menu)                         |
| "Book me in" (single service, offer 2-3 slots verbally)     | Multi-service selection / bundling                                  |
| "Do you service my area"                                    | Photo upload for a repair quote (broken faucet, damaged car)       |
| Simple message / callback request                           | Showing many available appointment slots visually                  |
| Price of one known service                                  | Price lists / menus / service catalogs                              |
|                                                               | Insurance / intake / registration forms                             |
|                                                               | Non-native speakers who read better than they hear                  |
|                                                               | Hard-of-hearing / accessibility cases                                |
|                                                               | Deposits / payments                                                  |

The rule of thumb: **if the task can be resolved in ≤3 pieces of information exchanged verbally, complete it by voice.** If it requires the caller to *choose from many options*, *see something*, *show something*, or *type structured data*, trigger the handoff.

### 3. UX / interaction design

**The ideal call flow with scripting:**

*Greeting + AI disclosure (required for trust — per Telnyx's Dec 2025 Consumer Insight Panel of 112 U.S. respondents, "38% identify AI self-disclosure as the primary trust driver, higher than accuracy (21%), comprehension (15%), or human escalation (10%)"; note this is an opt-in, non-probability sample described by Telnyx as "directional and not statistically projectable"):*

> "Thanks for calling [Business]. You're speaking with an AI assistant — I can help you book, get a quote, or answer questions. How can I help?"

*Intent capture, then the branch decision. For a simple booking (voice path):*

> "I've got one opening tomorrow at 2pm and one Thursday at 9am — which works?" → complete by voice → "Booked. You'll get a confirmation text. Anything else?"

*For a complex intent (handoff path) — confirm mobile and detect landline:*

> "The easiest way to show you the available times and let you send a photo of the leak is a quick link I can text you. What's the best mobile number? … Is that a mobile that can receive texts?"

If the ANI (caller ID) is a landline or the caller says they can't receive texts, do NOT dead-end — fall back to voice or callback.

*The warm handoff — stay on the line (this is the differentiator):*

> "I'm sending it now — it should arrive in a few seconds. I'll stay right here with you. Tap the link and you'll see three time-slots… got it? Great, tap the 2pm one…"

**Evidence for staying live:** Co-browsing research consistently shows that live, guided assistance "increases task completion rates" and reduces abandonment on forms, signups, and purchases (Fullview, RingCentral, Bird). Staying on the line while the caller taps is the single highest-leverage design choice — it converts the ~30% tap-rate problem into a guided, narrated experience where the AI can recover a stalled caller in real time.

**The web app experience (design requirements):**

- **Zero login.** Open instantly via a tokenized magic link — a signed, single-use, short-TTL token in the URL that maps to the call session. No password, no account.
- **Pre-populated.** Everything the AI learned (name, intent, service type, address) is already filled in. The caller confirms rather than re-enters.
- **Fast.** Server-render on Next.js; must load on a mid-range phone on cellular in ~2 seconds. Complete in under 60 seconds.
- **Secure without friction.** Token scoped to one session, expires in ~15-30 min, single business, rate-limited. Sensitive fields (card) handled by Stripe's hosted elements so PANs never touch your server.

**Fallback ladder (order and decision logic):**

1. **Web app** (default for complex intents, if mobile + caller willing)
2. **SMS conversational** (reply by text) — if caller taps but stalls, or prefers texting
3. **Continue by voice** — if landline, or caller declines the link
4. **Voicemail-to-text** — if caller wants to just leave details
5. **Human callback registration** — if the caller genuinely needs a person

The AI decides based on: (a) is the number mobile/text-capable? (b) does the intent need visual/structured input? (c) caller's stated preference. Always offer an escape to voice/human.

**Accessibility & inclusion:** WCAG 2.1/2.2 AA for the web app (large tap targets, high contrast, screen-reader labels, resizable text). Critically, the design must NOT exclude the roughly 40% of enterprise callers (and likely a similar or larger share of SMB callers, skewing older) who are on landlines or low digital literacy — for them the voice path IS the product. Offer English/Spanish (matching Rosie's baseline). Pew Research Center's Mobile Device Ownership fact sheet (survey of 5,022 U.S. adults, Feb. 5–June 18, 2025) reports that 78% of adults 65+ own a smartphone (the lowest of any age group), versus 90% of those 50–64 and 97% of adults under 50 — so most older callers *can* use the link, but completion barriers (vision, dexterity) are real, so the live-narration handoff and voice fallback matter most for them.

**Wow vs. creeped-out:** Telnyx's Dec 2025 panel also found 57% want voice AI limited to information delivery, but 75% would re-engage after an AI mistake if recovery is visible. The "wow" comes from *competence and speed* (Telnyx's Oct 2025 study found 80% enthusiasm for AI that eliminates hold times and instantly retrieves caller info) — not from pretending to be human. Disclose the AI, be fast, confirm before consequential actions, and always offer a human path.

### 4. Technical architecture for this specific mechanic

**Bridging the live voice session with the web session in real time:**

- **Session state model (MongoDB):** One `callSession` document per call — `{ sessionId, businessId, callerNumber, ani, intent, capturedFields{}, status, token, webEvents[], createdAt, expiresAt }`. This is the single source of truth both the voice agent and the web app read/write.
- **Real-time sync:** Use **Supabase Realtime** (Postgres changes / broadcast channels) or **Pusher/Ably** to push web events back toward the orchestration layer. Given the founder already uses Supabase for auth, Supabase Realtime is the lowest-friction choice; a mirror table or a broadcast channel keyed by `sessionId`. (The durable state of record can stay in MongoDB while Supabase Realtime carries the ephemeral pub/sub; or move live session state to Supabase Postgres for a single system during the call, syncing to MongoDB for durable storage. Recommend the latter for simplicity.)
- **How the voice agent knows the task is done:** The web app emits events (`link_opened`, `slot_selected`, `photo_uploaded`, `booking_confirmed`) to the realtime channel. The voice orchestration (Vapi/Retell function-calling or a webhook listener) subscribes and reacts: "Perfect, I can see you've selected 2pm — you're all set." This closed loop is the technical heart of the "wow."

**Number porting / call forwarding — three options:**

| Option                                                      | How                                                                                                                                  | Time                                                     | Cost                                    | Risk                                                                                                                                     |
|----------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------|--------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| **(a) Conditional call forwarding** (RECOMMENDED for V1)       | Business dials carrier star codes: no-answer `*92 + number`, or all-conditional GSM `**004*number#` (AT&T/T-Mobile), `*71` (Verizon) | Minutes, self-serve                                        | Free (forwarded minutes may use plan)      | Some carriers/WiFi-calling conflicts; not all landline carriers support it                                                              |
| **(b) Full port to Twilio/Telnyx**                              | LOA + account number/PIN, submit port request                                                                                       | 7-14 business days US local; 2-4 weeks with rejections    | ~$0-30/number                              | Rejections common (mismatched billing info); business continuity risk if number goes dark; don't cancel old carrier until port confirmed|
| **(c) New tracking number**                                    | Provision a fresh Twilio/Telnyx number; business publishes/forwards to it                                                            | Instant                                                     | ~$1-2/mo                                    | Business must update listings; loses "same number" magic                                                                                |

**Recommendation:** Launch with **(a) conditional forwarding** — zero cost, instant, no porting risk, and it lets the business keep answering directly when available (AI only picks up on no-answer/busy). Detect carriers that don't support conditional forwarding by testing during onboarding (call the line, don't answer, confirm the AI picks up); if it fails, fall back to a tracking number. Offer porting only later for businesses that want the AI to be primary.

**Sending the SMS mid-call:**

- **A2P 10DLC is mandatory** for US business SMS on 10-digit numbers regardless of volume. Register the brand + campaign via The Campaign Registry (through Twilio/Telnyx). A mid-call link sent to an *inbound caller who just asked for it* is strongly **conversational/transactional** (the caller initiated contact), which is the lowest-consent-burden category — but you still must register, include brand name + STOP/HELP, and keep content matching the registered use case. Budget ~1-3 weeks and a one-time + monthly registration fee for 10DLC.
- **Latency:** A2P SMS typically lands in a few seconds; design the script so the AI narrates during the wait ("it should arrive in a few seconds").
- **Link deliverability — this is a known killer.** Public shorteners (bit.ly, rb.gy) are **blocked or filtered by AT&T and T-Mobile** (T-Mobile's Code of Conduct bans URL cycling; per HighLevel's documentation "AT&T: Fully blocks public link shorteners due to fraud and phishing risks"). **Use a branded short domain** on your own DNS (e.g., `bk.yourbrand.co/x7f2`). This both avoids carrier filtering and lifts CTR — Rebrandly reports "an increase in click through rates by 39%" from branded URLs, and Linkly frames the industry uplift as "commonly in the 25–39% range." Limit to one redirect, avoid cloaking, include the brand name in the message.

**Voicemail-to-text, callback queue:** Transcribe voicemail (Deepgram/Whisper) → store on the session → notify the owner via SMS/push/email with a one-tap callback. Callback requests go into a simple queue collection with priority flags (emergency keywords escalate immediately, mirroring what RingOwl/Numa do).

**Photo upload to S3:** In the web app, use a **pre-signed S3 PUT URL** minted by a Next.js route handler (scoped to the session token, content-type + size limited). The client uploads directly to S3; the returned object key is written to the session document and attached to the job/quote request. This keeps large files off your server.

**Payments/deposits via Stripe:** **Do NOT take deposits in V1.** Rationale: card-not-present bookings from first-time callers carry elevated chargeback/"friendly fraud" risk, and Stripe notes disputed funds can be pulled and unavailable for up to ~3 months during assessment. Add deposits in V2 only for verticals that need no-show protection, using **Stripe hosted Checkout/Elements** (PANs never touch your server), a clearly disclosed cancellation policy on the booking screen (the #1 chargeback defense), and optionally a **pre-authorization hold** rather than an upfront charge. Consider Stripe Radar / Chargeback Protection once volume justifies it.

### 5. Competitive positioning

| Product                              | Sends link mid-call?         | Books via web/voice?                                                     | Notes                                                                                                                    |
|-----------------------------------------|----------------------------------|-------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| **Rosie**                                | Yes (Scale $149/mo)              | Both — texts booking link AND now books directly into calendar on-call        | "23,000+ appointment links" sent; home-services focus; $49 Professional tier only sends links, doesn't complete in-call |
| **Slang.ai**                             | Yes (restaurants)                | Voice for reservations; **link** for food orders & wine lists                 | Explicitly deflects ordering to SMS link rather than completing by voice                                                |
| **Numa**                                 | Yes (text thread)                | Text-based; full missed-call→text→booking loop                                | Dealership-focused; "voice with a brain" DMS integration                                                                |
| **Podium AI Employee**                   | Yes (within ecosystem)           | Books appointments                                                             | Heavy platform lock-in                                                                                                   |
| **Goodcall / My AI Front Desk**          | Varies                            | Mostly voice + calendar                                                        | My AI Front Desk books in-conversation                                                                                  |
| **Weave / Cira / Sameday / Avoca**       | Some send scheduling links        | Mostly voice/booking                                                           | Weave = dental; Avoca = enterprise HVAC                                                                                 |
| **echowin**                              | Multi-channel                     | Phone + text + chat                                                            |                                                                                                                           |

**Blunt assessment:** "Text a link mid-call" is **approaching table stakes** — Rosie, Slang.ai, Numa, and Podium all do a version. What is NOT yet common and IS defensible:

1. **Stateful pre-population** — the web page opens knowing everything from the call (most competitors send a generic booking/menu link with no call context).
2. **Live co-browse narration** — the AI stays on the line and guides the tap-through, recovering stalls in real time.
3. **Multi-channel completion by caller choice** — voice, text, web, or voicemail, with the AI intelligently picking the fallback.
4. **Photo-upload-for-quote** in the same session (strong for home services).

**Strongest defensible angle:** The **stateful warm handoff for home services** — "the AI answers, understands the job, texts a link that already knows what you need, stays on the line while you pick a time and snap a photo of the problem, and books it — in under a minute." That is a demonstrably better experience than a bare booking link, and it's the hardest for incumbents to copy because it requires the real-time voice↔web state bridge.

### 6. Unit economics impact

**Baseline pure-voice call:** A booking handled entirely by voice runs ~90-120 seconds. At an all-in voice stack cost of ~$0.07-0.15/min (Vapi/Retell base $0.05-0.07/min + LLM + STT/TTS + telephony; Bland ~$0.11-0.14/min all-in post-Dec-2025), that's roughly **$0.11-0.30 per call**.

**Hybrid SMS+web deflected call:** The voice portion shrinks to ~45-60 seconds (greet, capture intent, confirm number, narrate) = ~$0.06-0.15 voice. Add SMS cost (~$0.0075-0.02 per segment; Bland charges $0.02/msg) + amortized 10DLC registration (a few dollars/month spread across calls, so <$0.01/call at modest volume). Net: **~$0.08-0.18 per hybrid call** — roughly comparable to or slightly cheaper than pure voice on a per-call basis, with the compute shifted from expensive voice-minutes to near-free web interaction.

**The real economic lever:** Deflecting the *complex* tasks to web lets the founder use a **cheaper, faster, simpler voice agent** because the voice conversation no longer has to handle menu navigation, multi-item ordering, or slot enumeration by voice. Shorter, more constrained voice turns mean:

- Lower per-call minutes (the dominant cost).
- Ability to use a cheaper LLM / faster TTS because the dialog is simpler.
- Fewer failure modes (voice ordering of a 40-item menu is where robotic agents break — exactly why Slang.ai deflects orders to a link rather than taking them by voice).

Quantified: if the average voice handle time drops from ~110s to ~55s on the ~25% of calls that deflect, that's roughly a 50% voice-cost reduction on those calls, funding the SMS cost several times over. The economics *favor* the handoff for genuinely complex calls, and are neutral-to-slightly-negative for simple calls (which is why simple calls should stay voice-only — you save the SMS cost and the funnel risk).

### 7. Revised MVP scope and roadmap

**The ruthless MVP (4-6 weeks, under $5K):**

- Conditional call-forwarding onboarding (no porting).
- One voice agent via Vapi or Retell (BYO Twilio/Telnyx number), with AI disclosure, one vertical's script (home services).
- Voice-completes simple bookings; triggers handoff only for: photo-quote and multi-slot selection.
- Tokenized no-login Next.js web app: confirm pre-filled details, pick a slot, upload a photo to S3, done.
- Branded short-domain SMS via Twilio/Telnyx, 10DLC registered.
- Supabase Realtime bridge so the AI can say "I see you picked 2pm."
- Owner notification (SMS/email) with call summary + photo + booking.
- Fallback ladder: web → voice → voicemail-to-text → callback.

**Cost check:** Voice/SMS usage is pay-as-you-go (pennies per call); Supabase/MongoDB/Vercel free-to-cheap tiers; a branded short domain ~$10-15/yr; 10DLC registration one-time + small monthly. Easily under $5K before revenue, dominated by your own time.

**The single wow demo:** A plumbing call — caller describes a leak, AI texts a link mid-call, caller taps it, sees appointment slots, uploads a photo of the dripping pipe, books 2pm — all in under 60 seconds while the AI narrates. That demo sells the product because it shows the *stateful, co-browsed* handoff no bare-link competitor can match.

**Sequenced roadmap:**

- **V1 (weeks 1-6):** Above. Home-services wedge only.
- **V2 (weeks 7-14):** Calendar integrations (Google/Jobber/Housecall Pro), SMS-conversational fallback, Spanish, deposits via Stripe hosted Checkout with pre-auth holds + disclosed cancellation policy.
- **V3:** Restaurant vertical (menu/ordering handoff), number porting option, richer analytics dashboard, multi-location.

**What to cut from V1:** Deposits/payments, porting, restaurant menus, human-agent hybrid, deep CRM integrations, multi-language beyond a basic Spanish toggle, native mobile app (Capacitor can wait — the caller uses a web link, and the *owner* app is a fast follow).

**Top risks & the metrics to instrument:**

| Risk                                                | Guardrail / Metric                                                                                 |
|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| Callers don't tap the link (the core assumption)        | Instrument **link-tap rate** (target >30%); if <20%, shift more intents to voice-only                     |
| Web task abandoned mid-flow                              | **Step-by-step funnel: SMS sent → opened → slot selected → completed**; find the drop-off screen          |
| SMS filtered/undelivered                                 | **Delivery rate** by carrier; alert if branded-domain links get blocked                                    |
| Landline callers dead-ended                              | **% calls from non-mobile ANIs**; ensure voice fallback fires 100% of the time                             |
| Voice-only calls failing that should have                | **Voice-only completion rate** vs. **handoff completion rate** — compare CSAT per path                    |
| Callers frustrated / want human                          | **Callback-request rate** and **human-escalation rate**; spikes signal script or trust problems            |
| Over-deflection hurting CSAT                              | Post-call **CSAT/NPS by path**; deflection that lowers CSAT is a loss, not a win                           |

## Recommendations

1. **Build voice-first, handoff-second.** Make the voice agent fully capable of completing the top 3-4 SMB intents in ≤60 seconds. Trigger the SMS/web handoff ONLY for the taxonomy in section 2 (photo-quote, multi-slot, menus, forms, accessibility). This directly answers the make-or-break funnel risk: you never bet the outcome on a link tap for a call that could have been finished by voice.
2. **Make the handoff stateful and live — that is the whole moat.** Pre-populate the web page from call context and keep the AI on the line narrating. Instrument the tap-and-complete funnel from day one. If mid-call tap rate holds above ~30%, lean in; if it sits below ~20% after tuning the script and using a branded short domain, pull complex intents back to voice and reposition the web app as a *post-call* convenience.
3. **Launch on conditional call-forwarding, not porting.** Zero cost, instant, reversible, no dead-number risk. Detect unsupported carriers during onboarding and fall back to a tracking number.
4. **Use a branded short domain for every SMS link, and register 10DLC before launch.** Public shorteners will get you filtered by AT&T/T-Mobile. This is non-negotiable for the concept to function.
5. **Ship the home-services vertical wedge with the leak-photo demo.** It's the clearest expression of the differentiator and the hardest for Rosie/Slang/Numa to match.
6. **Defer deposits to V2.** The chargeback/fraud exposure on CNP first-time-caller bookings is not worth it pre-revenue. When you add it, use Stripe hosted Checkout, pre-auth holds, and a disclosed cancellation policy.
7. **Disclose the AI up front, every call.** Consumer trust data is unambiguous that transparency is the top trust driver. Compete on speed and competence, not on fooling people.

**Thresholds that change the plan:** If link-tap rate <20% after optimization → demote the handoff to complex-only / post-call. If landline-originated calls >30% of a target vertical → prioritize voice completion and treat web as bonus. If a well-funded incumbent ships stateful pre-populated co-browse for home services → accelerate into a narrower niche (e.g., restoration/roofing with mandatory photo intake) where the photo-quote handoff is essential rather than optional.

## Caveats

- **The entire funnel is dominated by vendor-reported numbers with obvious incentive to inflate.** The only solidly independent anchors are BIA/Kelsey (mobile share of business calls) and Pew Research Center (age/smartphone ownership). Treat every opt-in / tap / completion figure as directional and validate with a live A/B test in the first 100 calls.
- **No source measures the mid-call SMS-link tap rate specifically** in a transactional SMB context; the 20-36% range is extrapolated from marketing-SMS click benchmarks, and a caller who just asked for the link should tap at a higher rate — but this is unproven and must be measured.
- **Landline-vs-mobile split for SMB inbound calls specifically is not available in recent independent data;** the 60% mobile figure is from BIA/Kelsey 2016 and is likely conservative today, but older-skewing verticals (some home services, healthcare) may have materially more landline callers.
- **Consumer-sentiment figures come from small opt-in panels** — Telnyx's trust panels (N=112 and N=105) are explicitly "directional and not statistically projectable." Use them as signal, not proof.
- **Voice-agent pricing is volatile** — Bland raised prices 25-55% in December 2025; advertised per-minute rates exclude LLM/STT/TTS/telephony. Model all-in and re-check quarterly.
- **Carrier behavior on SMS filtering changes frequently;** branded-domain deliverability should be monitored continuously, not assumed.
