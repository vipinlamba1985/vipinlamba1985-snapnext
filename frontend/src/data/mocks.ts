// SnapNext AI prototype — mock data only.
// This file provides deterministic sample data for the UX reference prototype.
// ALL content is fictitious and clearly labelled as DEMO DATA in the UI.

export const demoUser = {
  name: "Vipin",
  handle: "@vipin",
  avatar: "https://images.pexels.com/photos/20157010/pexels-photo-20157010.jpeg",
  storageUsedGB: 42.3,
  storageTotalGB: 200,
  plan: "SnapNext Pro",
};

// A palette of curated demo photos used across the prototype.
export const demoPhotos = [
  { id: "p1", url: "https://images.pexels.com/photos/38065247/pexels-photo-38065247.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", label: "Sunset beach", date: "Jul 14, 2026", place: "Goa, India", favorite: true, isVideo: false },
  { id: "p2", url: "https://images.unsplash.com/photo-1611416457332-946853cc75d6?auto=format&fit=crop&w=900&q=60", label: "Night city", date: "Jun 03, 2026", place: "Dubai, UAE", favorite: false, isVideo: false },
  { id: "p3", url: "https://images.unsplash.com/photo-1653762381632-2945469edb7b?auto=format&fit=crop&w=900&q=60", label: "Coffee with friends", date: "May 22, 2026", place: "Bengaluru", favorite: true, isVideo: false },
  { id: "p4", url: "https://images.unsplash.com/photo-1597046835715-16f81ac132c0?auto=format&fit=crop&w=900&q=60", label: "Milo in the park", date: "Apr 10, 2026", place: "Cubbon Park", favorite: true, isVideo: false },
  { id: "p5", url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=60", label: "Wedding day", date: "Feb 18, 2026", place: "Udaipur", favorite: true, isVideo: false },
  { id: "p6", url: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=900&q=60", label: "Trek to Triund", date: "Jan 04, 2026", place: "Himachal Pradesh", favorite: false, isVideo: false },
  { id: "p7", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=60", label: "Morning ride", date: "Dec 12, 2025", place: "Nandi Hills", favorite: false, isVideo: true, duration: "0:34" },
  { id: "p8", url: "https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?auto=format&fit=crop&w=900&q=60", label: "Diwali at home", date: "Nov 01, 2025", place: "Home", favorite: true, isVideo: false },
  { id: "p9", url: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?auto=format&fit=crop&w=900&q=60", label: "Rooftop dinner", date: "Oct 09, 2025", place: "Bengaluru", favorite: false, isVideo: false },
  { id: "p10", url: "https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=900&q=60", label: "Coastal drive", date: "Sep 15, 2025", place: "Konkan", favorite: false, isVideo: true, duration: "1:12" },
  { id: "p11", url: "https://images.unsplash.com/photo-1521401830884-6c03c1c87ebb?auto=format&fit=crop&w=900&q=60", label: "New apartment", date: "Aug 21, 2025", place: "Home", favorite: false, isVideo: false },
  { id: "p12", url: "https://images.unsplash.com/photo-1543353071-c8a2e2135d24?auto=format&fit=crop&w=900&q=60", label: "Mountain lake", date: "Jul 30, 2025", place: "Ladakh", favorite: true, isVideo: false },
];

export const onThisDay = {
  yearsAgo: 3,
  photo: demoPhotos[0],
  caption: "Sunset with family in Goa — three years ago today.",
  photoCount: 12,
};

export const primaryRecommendation = {
  title: "Continue your Goa trip story",
  reason: "You have 12 unstitched moments from Feb 2026",
  actionLabel: "Open story",
  icon: "sparkles" as const,
};

export const aiInsight = {
  title: "You visit Cubbon Park a lot",
  detail: "42 memories captured here over 3 years — often on weekends with Milo.",
  actionLabel: "See place timeline",
};

export const continueYourStory = [
  { id: "s1", title: "Goa 2026", cover: demoPhotos[0].url, count: 47, subtitle: "Story in progress" },
  { id: "s2", title: "Ladakh Trip", cover: demoPhotos[11].url, count: 128, subtitle: "Ready to publish" },
  { id: "s3", title: "Diwali Nights", cover: demoPhotos[7].url, count: 22, subtitle: "AI-generated draft" },
  { id: "s4", title: "Milo's Year", cover: demoPhotos[3].url, count: 96, subtitle: "New moments" },
];

export const memoriesStories = [
  { id: "st1", title: "Goa 2026", cover: demoPhotos[0].url, count: 47, tag: "Trip" },
  { id: "st2", title: "Wedding Week", cover: demoPhotos[4].url, count: 213, tag: "Event" },
  { id: "st3", title: "Ladakh Diaries", cover: demoPhotos[11].url, count: 128, tag: "Trip" },
  { id: "st4", title: "Diwali 2025", cover: demoPhotos[7].url, count: 34, tag: "Festival" },
  { id: "st5", title: "Milo the Pup", cover: demoPhotos[3].url, count: 96, tag: "Pet" },
];

export const memoriesPeople = [
  { id: "pe1", name: "Ananya", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=60", count: 342 },
  { id: "pe2", name: "Rahul", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=60", count: 218 },
  { id: "pe3", name: "Mom", avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=60", count: 512 },
  { id: "pe4", name: "Dad", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=60", count: 487 },
  { id: "pe5", name: "Priya", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=60", count: 156 },
];

export const memoriesPlaces = [
  { id: "pl1", name: "Cubbon Park", cover: demoPhotos[3].url, count: 42, subtitle: "Bengaluru" },
  { id: "pl2", name: "Goa Beaches", cover: demoPhotos[0].url, count: 87, subtitle: "3 trips" },
  { id: "pl3", name: "Ladakh", cover: demoPhotos[11].url, count: 128, subtitle: "1 trip" },
  { id: "pl4", name: "Home", cover: demoPhotos[7].url, count: 623, subtitle: "Bengaluru" },
];

export const aiExamples = {
  ask: [
    "Show me beach photos with family",
    "What memories do I have with Mom?",
    "Find photos from my Goa trip",
    "Show all videos under 1 minute",
  ],
  understand: [
    "What has SnapNext learned about me?",
    "What places appear most often?",
    "Who do I take photos with most?",
    "What stories could I create?",
  ],
  create: [
    "Write a caption for this photo",
    "Create a story from Goa 2026",
    "Draft a social post from last weekend",
    "Suggest a short-video concept for Ladakh",
  ],
  organize: [
    "Find duplicates in my library",
    "Suggest albums to create",
    "Help me clean my archive",
    "Group blurry photos to review",
  ],
};

export const favorites = [
  { id: "f1", name: "Ananya", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=60", status: "accepted" as const, sharedCount: 47, since: "Since Mar 2024" },
  { id: "f2", name: "Rahul", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=60", status: "accepted" as const, sharedCount: 22, since: "Since Jan 2025" },
  { id: "f3", name: "Mom", avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=60", status: "pending" as const, sharedCount: 0, since: "Invited 2 days ago" },
  { id: "f4", name: "Priya", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=60", status: "invited" as const, sharedCount: 0, since: "Waiting on you" },
];

export const uploadQueue = {
  primaryLabel: "Back up everything new",
  primarySubtitle: "Includes 128 new photos & 6 videos from your camera roll",
  progress: {
    uploaded: 82,
    total: 100,
    skipped: 18,
    failed: 0,
  },
  skipReasons: [
    { label: "Already backed up", count: 12, tone: "info" as const },
    { label: "Unsupported type", count: 3, tone: "warning" as const },
    { label: "File too large", count: 3, tone: "warning" as const },
  ],
  recent: [
    { id: "u1", url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=200&q=40", state: "uploaded" as const },
    { id: "u2", url: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=200&q=40", state: "uploaded" as const },
    { id: "u3", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=200&q=40", state: "uploading" as const },
    { id: "u4", url: "https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?auto=format&fit=crop&w=200&q=40", state: "skipped" as const },
    { id: "u5", url: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?auto=format&fit=crop&w=200&q=40", state: "queued" as const },
    { id: "u6", url: "https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=200&q=40", state: "queued" as const },
  ],
};

export const galleryFilters = ["All", "Favorites", "Videos", "Screenshots", "Recent"];
export const aiTabs: { key: "ask" | "understand" | "create" | "organize"; label: string }[] = [
  { key: "ask", label: "Ask" },
  { key: "understand", label: "Understand" },
  { key: "create", label: "Create" },
  { key: "organize", label: "Organize" },
];
