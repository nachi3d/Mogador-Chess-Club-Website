/**
 * Mogador Chess Club — single source of truth for site-wide constants.
 *
 * CRITICAL (see CLAUDE.md → "Critical Features"):
 *  - NOTHING venue-related may be hardcoded in a component. The club currently
 *    meets at Dar Souiri, but it must stay portable to another venue, or to
 *    independent classes with no venue at all. Every component reads `site.venue`
 *    and renders nothing when a field is null.
 *  - The WhatsApp number lives HERE and nowhere else. Build links with
 *    `whatsappUrl()`.
 *
 * Every value marked TODO is a placeholder pending confirmation from Seàn.
 */

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

/** A string that must exist in both site languages. */
export type Localized = Readonly<Record<Locale, string>>;

export interface SocialLink {
  readonly platform: 'instagram' | 'facebook' | 'youtube' | 'lichess' | 'chesscom';
  readonly label: string;
  readonly url: string;
  /** false = placeholder; the footer skips it until the account really exists. */
  readonly published: boolean;
}

/**
 * A third-party work the site must credit. Rendered by `/mentions-legales/`.
 * `shareAlike` marks the licences that REQUIRE the credit (GPL, CC BY-SA) as
 * opposed to the permissive ones we list out of courtesy.
 */
export interface Attribution {
  readonly id: string;
  readonly work: string;
  readonly author: string;
  /** SPDX identifier or the licence's common name. */
  readonly licence: string;
  readonly workUrl: string;
  readonly licenceUrl: string;
  readonly shareAlike: boolean;
}

export interface Venue {
  /** null ⇒ the club is running without a fixed venue; venue blocks disappear. */
  readonly name: string | null;
  readonly addressLine: string | null;
  readonly city: string;
  readonly country: string;
  readonly countryCode: string;
  /** External map link (Google Maps / OSM). null ⇒ no map button rendered. */
  readonly mapUrl: string | null;
  readonly coordinates: { readonly lat: number; readonly lon: number } | null;
  /** Publish the precise address? Opt-in, same rule as the other Labs sites. */
  readonly addressPublic: boolean;
}

export const site = {
  name: 'Mogador Chess Club',
  shortName: 'Mogador Chess',

  tagline: {
    fr: "Apprendre les échecs à Essaouira — cours, pièges d'ouverture et exercices",
    en: 'Learn chess in Essaouira — courses, opening traps and exercises',
  } satisfies Localized,

  description: {
    fr: "Le club d'échecs de Mogador : cours progressifs, bibliothèque de pièges d'ouverture, exercices interactifs et parties contre l'ordinateur. En français et en anglais.",
    en: 'The Mogador chess club: progressive courses, an opening-trap library, interactive exercises and games against the computer. In French and English.',
  } satisfies Localized,

  // TODO(domain): mogadorchess.ma is planned, not yet registered.
  // Keep in sync with `site` in astro.config.mjs.
  url: 'https://mogadorchess.ma',

  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,

  /**
   * The venue. Deliberately a plain data object with nullable fields — see the
   * portability rule at the top of this file. Swapping venues is a one-commit
   * change here and nowhere else.
   */
  venue: {
    name: 'Dar Souiri',
    // TODO(venue): confirm the exact street line Dar Souiri wants published.
    addressLine: null,
    city: 'Essaouira',
    country: 'Maroc',
    countryCode: 'MA',
    // TODO(venue): replace with the club's own pinned map link.
    mapUrl: 'https://www.openstreetmap.org/?mlat=31.5131&mlon=-9.7700#map=17/31.5131/-9.7700',
    coordinates: { lat: 31.5131, lon: -9.77 },
    addressPublic: true,
  } satisfies Venue,

  /**
   * Association credit — the club runs under Association Essaouira Mogador.
   * Rendered in the footer beside the Nachi3D Labs credit.
   */
  association: {
    name: 'Association Essaouira Mogador',
    handle: '@associationessaouiramogador',
    url: 'https://www.instagram.com/associationessaouiramogador/',
    text: {
      fr: 'En partenariat avec',
      en: 'In partnership with',
    } satisfies Localized,
  },

  contact: {
    /**
     * International format, digits only (no +, no spaces).
     * TODO(contact): PLACEHOLDER — must be replaced before launch.
     */
    whatsapp: '212600000000',
    whatsappDisplay: '+212 6 00 00 00 00',
    /** TODO(contact): create the club mailbox, or route to Seàn's inbox. */
    email: null as string | null,
  },

  socials: [
    {
      // TODO(socials): create/confirm the club's own Instagram handle.
      platform: 'instagram',
      label: 'Instagram',
      url: 'https://www.instagram.com/',
      published: false,
    },
    {
      // TODO(socials): a Lichess team is the natural home for online club play (v2).
      platform: 'lichess',
      label: 'Lichess',
      url: 'https://lichess.org/team',
      published: false,
    },
  ] as const satisfies readonly SocialLink[],

  credit: {
    label: 'Nachi3D Labs',
    text: {
      fr: 'Site créé par',
      en: 'Site by',
    } satisfies Localized,
    url: 'https://www.nachi3dlabs.com',
  },

  /**
   * LICENCE — decided Session 3, by Seàn.
   *
   * The site ships Chessground, which is GPL-3.0-or-later, and its README is
   * explicit: "your combined work may be distributed only under the GPL. You
   * must release your source code to the users of your website." So the repo is
   * PUBLIC and the site carries a source link — that link IS the distribution
   * obligation being met, which is why it renders in the footer of every page
   * and not only on the legal notice.
   *
   * Everything here is DATA (names, URLs, identifiers). The surrounding prose
   * lives in `src/i18n/ui.ts` like every other user-facing string.
   */
  legal: {
    /** Publisher of the site, in the French "éditeur" sense. */
    publisher: {
      name: 'Seàn McGannon',
      label: 'Nachi3D Labs',
      url: 'https://www.nachi3dlabs.com',
      email: 'nachiketas3d@gmail.com',
    },
    /** Host, as French law requires a legal notice to name. */
    host: {
      name: 'Cloudflare, Inc.',
      url: 'https://www.cloudflare.com/',
      /** Cloudflare Pages — fully static output, no server-side processing. */
      service: 'Cloudflare Pages',
    },
    /** The source release that satisfies the GPL's distribution requirement. */
    source: {
      spdx: 'GPL-3.0-or-later',
      url: 'https://github.com/nachi3d/Mogador-Chess-Club-Website',
      licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
    },
    /**
     * Third-party work that must be credited by its licence.
     * `share-alike` marks the ones whose terms require the credit — the legal
     * page renders those in full rather than as a one-liner.
     */
    attributions: [
      {
        id: 'chessground',
        work: 'Chessground',
        author: 'Lichess (lichess-org)',
        licence: 'GPL-3.0-or-later',
        workUrl: 'https://github.com/lichess-org/chessground',
        licenceUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
        shareAlike: true,
      },
      {
        id: 'cburnett',
        work: 'cburnett',
        author: 'Colin M. L. Burnett',
        licence: 'CC BY-SA 3.0',
        workUrl: 'https://en.wikipedia.org/wiki/User:Cburnett/GFDL_images/Chess',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
        shareAlike: true,
      },
      {
        id: 'chessjs',
        work: 'chess.js',
        author: 'Jeff Hlywa',
        licence: 'BSD-2-Clause',
        workUrl: 'https://github.com/jhlywa/chess.js',
        licenceUrl: 'https://opensource.org/license/bsd-2-clause',
        shareAlike: false,
      },
      {
        id: 'astro',
        work: 'Astro + Preact',
        author: 'The Astro Technology Company, Jason Miller',
        licence: 'MIT',
        workUrl: 'https://astro.build/',
        licenceUrl: 'https://opensource.org/license/mit',
        shareAlike: false,
      },
      {
        id: 'fonts',
        work: 'Fraunces, Inter',
        author: 'Undercase Type, Rasmus Andersson',
        licence: 'SIL OFL 1.1',
        workUrl: 'https://fonts.google.com/specimen/Fraunces',
        licenceUrl: 'https://openfontlicense.org/',
        shareAlike: false,
      },
    ] as const satisfies readonly Attribution[],
  },

  analytics: {
    /**
     * Read from the build environment so the snippet is omitted entirely when
     * unset — no empty <script> tag, no request to umami.is in dev or in tests.
     * Set PUBLIC_UMAMI_WEBSITE_ID in the Cloudflare Pages BUILD variables.
     */
    umamiWebsiteId: (import.meta.env['PUBLIC_UMAMI_WEBSITE_ID'] as string | undefined) ?? null,
    umamiScriptUrl:
      (import.meta.env['PUBLIC_UMAMI_SCRIPT_URL'] as string | undefined) ??
      'https://cloud.umami.is/script.js',
  },

  pwa: {
    /** Must match the theme colours in tokens.css (green-800 / cream-100). */
    themeColor: '#163425',
    backgroundColor: '#faf4e6',
  },
} as const;

/** Socials that actually exist and are safe to render. */
export const publishedSocials: readonly SocialLink[] = site.socials.filter((s) => s.published);

/** True when there is a venue worth rendering a block for. */
export const hasVenue = (): boolean => site.venue.name !== null;

/** The address string to display, or null when it must not be published. */
export function venueAddress(): string | null {
  if (!site.venue.addressPublic) return null;
  const parts = [site.venue.name, site.venue.addressLine, site.venue.city, site.venue.country];
  const shown = parts.filter((p): p is string => Boolean(p));
  return shown.length > 0 ? shown.join(', ') : null;
}

const WHATSAPP_DEFAULT: Localized = {
  fr: 'Bonjour, je souhaite en savoir plus sur le Mogador Chess Club.',
  en: "Hello, I'd like to know more about the Mogador Chess Club.",
};

/**
 * Builds the wa.me link used by every contact CTA.
 * Always goes through `site.contact.whatsapp` — that is the whole point.
 */
export function whatsappUrl(locale: Locale = DEFAULT_LOCALE, message?: string): string {
  const text = message ?? WHATSAPP_DEFAULT[locale];
  return `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(text)}`;
}

export type Site = typeof site;
