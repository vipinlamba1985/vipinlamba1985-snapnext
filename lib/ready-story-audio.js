export const FREE_STORY_AUDIO_TRACKS = [
  {
    id: 'wikimedia-cc0-chill-beat-2026',
    title: 'Chill Beat',
    artist: 'Maddy',
    provider: 'Wikimedia Commons',
    license: 'CC0-1.0',
    licenseVersion: 'CC0-1.0',
    attributionRequired: false,
    commercialUseAllowed: true,
    embeddedExportAllowed: true,
    derivativeSyncAllowed: true,
    redistributionScope: 'embedded-audiovisual-export',
    territories: 'worldwide',
    licenseExpiresAt: null,
    variableLicenseCostUsd: 0,
    uploadedAt: '2026-02-22',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Chill_Beat.ogg',
    licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Chill_Beat.ogg',
    audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Chill_Beat.ogg',
    mp3Url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/9f/Chill_Beat.ogg/Chill_Beat.ogg.mp3',
    moods: ['memory', 'travel', 'wedding', 'birthday', 'celebration', 'calm', 'nostalgic', 'lifestyle'],
  },
];

export function soundtrackForStory(story = {}) {
  const kind = String(story?.type || 'memory').toLowerCase();
  return FREE_STORY_AUDIO_TRACKS.find(track => track.moods.includes(kind)) || FREE_STORY_AUDIO_TRACKS[0] || null;
}

export function soundtrackCanBeEmbedded(track = null) {
  return Boolean(
    track
      && track.commercialUseAllowed === true
      && track.embeddedExportAllowed === true
      && track.derivativeSyncAllowed === true
      && Number(track.variableLicenseCostUsd || 0) >= 0,
  );
}

export function soundtrackLicenseSnapshot(track = null) {
  if (!soundtrackCanBeEmbedded(track)) return null;
  return `${track.provider}:${track.licenseVersion || track.license}:${track.id}`;
}
