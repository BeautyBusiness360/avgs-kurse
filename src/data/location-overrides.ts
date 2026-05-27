export const CITY_DISPLAY: Record<string, string> = {
  'dunya-said-hamburg': 'Hamburg-Lurup',
};

export const PROFILE_ADDRESS: Record<string, string> = {
  'dunya-said-hamburg': 'Eckhoffpl. 16, 22547 Hamburg',
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
