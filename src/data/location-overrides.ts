// Display-name overrides for services (slug → label shown to users).
// Slugs and URLs stay unchanged; only the visible text is overridden.
export const SERVICE_DISPLAY_NAME: Record<string, string> = {
  'powderbrows-ombrebrows-masterclass': 'PowderBrows & OmbreBrows MasterClass',
};

export const CITY_DISPLAY: Record<string, string> = {
  'dunya-said-hamburg': 'Hamburg-Lurup',
};

export const PROFILE_ADDRESS: Record<string, string> = {
  'dunya-said-hamburg': 'Eckhoffpl. 16, 22547 Hamburg',
};

// Per-service technique labels for the dozentinnen profile footer.
// Services with two techniques produce two separate links, both pointing to the same module URL.
export const SERVICE_LABELS: Record<string, string[]> = {
  'powderbrows-ombrebrows-masterclass': ['PowderBrows MasterClass', 'OmbreBrows MasterClass'],
  'velvet-lips-lipstick-masterclass':   ['Velvet Lips MasterClass', 'LipStick Effekt MasterClass'],
  'microblading-masterclass':           ['Microblading MasterClass'],
  'wimpernverlaengerung-masterclass':   ['1:1 Technik MasterClass', 'Volumen Technik MasterClass'],
  'camouflage-removal-masterclass':     ['Camouflage MasterClass', 'Tattoo Removal MasterClass'],
};

// Hub-Link overrides: dozentin.slug → city slug/label for the "Alle anerkannten Akademien in X" link.
// Used when city.slug has no own Stadtseite (elmshorn, wedel) or display differs from URL city (Hamburg-Lurup).
export const HUB_CITY_SLUG: Record<string, string> = {
  'dunya-said-hamburg':    'hamburg',
  'yvonne-klatt-elmshorn': 'hamburg',
  'katarina-hinz-wedel':   'hamburg',
};

export const HUB_CITY_LABEL: Record<string, string> = {
  'dunya-said-hamburg':    'Hamburg',
  'yvonne-klatt-elmshorn': 'Hamburg',
  'katarina-hinz-wedel':   'Hamburg',
};
