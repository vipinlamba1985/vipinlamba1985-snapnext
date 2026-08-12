# SnapNext Navigation Architecture v1 — FROZEN

This file is the authoritative product-navigation contract for SnapNext web and native implementations.

## Primary mental model

**Discover → Find → Add → Make → Connect**

The primary navigation contains exactly five destinations:

1. **Home** — Discover — what is happening.
2. **Library** — Find — what I have.
3. **(+)** — Add — bring something in.
4. **Create** — Make — what I produce.
5. **Circle** — Connect — who I connect and share with.

There is no sixth primary item and there is no More item in the bottom navigation.

## Home — Discover

Home is the living SnapNext feed. It surfaces daily memories, story-agent output, Circle updates, and meaningful activity. It does not own intake, retrieval, relationship management, or authoring.

## Library — Find

Library owns retrieval of saved media and Magic Library organization: photos, videos, documents, screenshots, albums, Favourites, Faces, Search, clusters and timeline views.

**People is not a Library term.** Face-recognition clusters are called **Faces**. Search remains inside Library and is not a sixth navigation destination.

## (+) — Add

Add owns intake only: camera, photos/videos, files, backup, and future Auto Cloud Sync. It contains zero generative/AI-authoring options.

## Create — Make

Create owns posts, stories, reels/short video, captions, collages, AI-assisted editing, and other generative creation tools. Create produces new content; Add brings existing content in.

Putting Create immediately after Add reflects the common SnapNext flow: bring something in, then make something with it. It does not move sharing or relationship ownership out of Circle.

## Circle — Connect

Circle owns people and relationships: SnapNext accounts, friends, family, groups, invites, shared memories, and supported external social profile connections.

**People is reserved for Circle.** Face recognition never automatically creates a Circle Person. Linking a Library Face to a Circle Person is a deliberate user action.

Circle remains the destination for connection and sharing after creation; moving it to the fifth slot changes order, not ownership.

## More

More is a separate top-left secondary-controls menu, never a bottom-navigation item. Its authoritative controls are:

- You / Profile
- Settings
- Plan & storage
- Privacy & security
- Integrations (App & Cloud Connections)
- Help & support

Administrative controls may appear for authorized operators without changing the five primary destinations.

## Integrations boundary

**Person / relationship → Circle**

**Service / authorization / infrastructure → More → Integrations**

External social identity/profile connections are owned exclusively by Circle. More → Integrations may contain technical authorization or account-management controls required to support those connections, but it must not become a second user-facing place for discovering, viewing, or managing social relationships.

## Frozen implementation rules

1. Exactly five primary destinations, in this order: Home, Library, (+), Create, Circle.
2. No sixth primary-navigation item.
3. More is secondary controls only.
4. Library uses **Faces**, never People, for recognition clusters.
5. Circle owns **People** and social relationships.
6. Library Search is persistent inside Library and is not a navigation item.
7. Add and Create never share ownership of the same action: Add brings content in; Create makes new content.
8. Auto Cloud Sync belongs to Add when shipped.
9. Service authorization belongs to Integrations; social relationships belong to Circle.
10. Face → Person linking is user initiated and never automatic.
