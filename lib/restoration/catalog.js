const money = (value, fallback) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : fallback;
};

const currency = () => {
  const value = String(process.env.RESTORATION_CURRENCY || 'usd').trim().toLowerCase();
  return /^[a-z]{3}$/.test(value) ? value : 'usd';
};

export const RESTORATION_RECIPES = Object.freeze({
  repair: Object.freeze({
    id: 'repair',
    name: 'Repair damage',
    description: 'Reduce scratches, tears, stains, fading, and age damage while keeping the people recognizable.',
    providerAction: 'restore',
    units: 1,
    prompt: 'Restore visible age damage, scratches, tears, stains, fading, and compression artifacts. Preserve identity, composition, clothing, expressions, and historical details. Do not invent missing people or objects.',
  }),
  colorize: Object.freeze({
    id: 'colorize',
    name: 'Careful colourisation',
    description: 'Add natural-looking colour to a black-and-white memory without changing its composition.',
    providerAction: 'colorize',
    units: 1,
    prompt: 'Colourise this historical photo conservatively. Preserve identity, composition, lighting direction, era details, and skin texture. Avoid oversaturation and do not invent objects.',
  }),
  faces: Object.freeze({
    id: 'faces',
    name: 'Improve faces',
    description: 'Recover facial clarity while preserving identity and avoiding an artificial portrait effect.',
    providerAction: 'face-repair',
    units: 1,
    prompt: 'Improve facial clarity and local detail while strictly preserving each person’s identity, age, expression, pose, and natural skin texture. Do not beautify or replace faces.',
  }),
  print: Object.freeze({
    id: 'print',
    name: 'Premium repair + print',
    description: 'Repair damage, improve clarity, and prepare a higher-resolution copy suitable for printing.',
    providerAction: 'restore-print',
    units: 2,
    prompt: 'Perform conservative historical-photo restoration and print preparation: repair damage, improve clarity, reduce noise, and upscale cleanly. Preserve identity, composition, era details, and natural texture. Do not invent content.',
  }),
});

export const RESTORATION_PACKS = Object.freeze({
  single: Object.freeze({
    id: 'single',
    name: 'One restoration',
    description: 'Try one basic restoration.',
    units: 1,
    amount: money(process.env.RESTORATION_PACK_SINGLE_PRICE, 0.99),
  }),
  three: Object.freeze({
    id: 'three',
    name: 'Three restorations',
    description: 'A small family-photo bundle.',
    units: 3,
    amount: money(process.env.RESTORATION_PACK_THREE_PRICE, 2.49),
    recommended: true,
  }),
  ten: Object.freeze({
    id: 'ten',
    name: 'Ten restorations',
    description: 'Best for an album or family archive.',
    units: 10,
    amount: money(process.env.RESTORATION_PACK_TEN_PRICE, 6.99),
  }),
});

export function getRestorationRecipe(id) {
  return RESTORATION_RECIPES[String(id || '').toLowerCase()] || null;
}

export function getRestorationPack(id) {
  return RESTORATION_PACKS[String(id || '').toLowerCase()] || null;
}

export function publicRestorationCatalog() {
  return {
    currency: currency(),
    unitName: 'Restoration Credit',
    recipes: Object.values(RESTORATION_RECIPES).map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      units: recipe.units,
    })),
    packs: Object.values(RESTORATION_PACKS).map((pack) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      units: pack.units,
      amount: pack.amount,
      currency: currency(),
      recommended: pack.recommended === true,
    })),
  };
}

export function restorationCurrency() {
  return currency();
}
