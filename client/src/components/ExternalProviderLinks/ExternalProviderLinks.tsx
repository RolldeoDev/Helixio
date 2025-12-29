/**
 * ExternalProviderLinks Component
 *
 * Displays subtle icon links to external metadata provider sites.
 * Only shows icons for providers where an ID is available.
 */

import './ExternalProviderLinks.css';

// =============================================================================
// Types
// =============================================================================

interface ExternalProviderLinksProps {
  comicVineId?: string | null;
  metronId?: string | null;
  gcdId?: string | null;
  anilistId?: string | null;
  malId?: string | null;
  context: 'series' | 'issue';
}

// =============================================================================
// URL Builders
// =============================================================================

function getComicVineUrl(id: string, context: 'series' | 'issue'): string {
  if (context === 'series') {
    return `https://comicvine.gamespot.com/volume/4050-${id}/`;
  }
  return `https://comicvine.gamespot.com/issue/4000-${id}/`;
}

function getMetronUrl(id: string, context: 'series' | 'issue'): string {
  if (context === 'series') {
    return `https://metron.cloud/series/${id}/`;
  }
  return `https://metron.cloud/issue/${id}/`;
}

function getGcdUrl(id: string, context: 'series' | 'issue'): string {
  if (context === 'series') {
    return `https://www.comics.org/series/${id}/`;
  }
  return `https://www.comics.org/issue/${id}/`;
}

function getAnilistUrl(id: string): string {
  return `https://anilist.co/manga/${id}`;
}

function getMalUrl(id: string): string {
  return `https://myanimelist.net/manga/${id}`;
}

// =============================================================================
// Provider Link Component
// =============================================================================

interface ProviderLinkProps {
  href: string;
  label: string;
  abbrev: string;
}

function ProviderLink({ href, label, abbrev }: ProviderLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="external-provider-link"
      title={`View on ${label}`}
    >
      <span className="external-provider-link__abbrev">{abbrev}</span>
    </a>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ExternalProviderLinks({
  comicVineId,
  metronId,
  gcdId,
  anilistId,
  malId,
  context,
}: ExternalProviderLinksProps) {
  const hasAnyLink = comicVineId || metronId || gcdId || anilistId || malId;

  if (!hasAnyLink) {
    return null;
  }

  return (
    <div className="external-provider-links">
      {comicVineId && (
        <ProviderLink
          href={getComicVineUrl(comicVineId, context)}
          label="ComicVine"
          abbrev="CV"
        />
      )}
      {metronId && (
        <ProviderLink
          href={getMetronUrl(metronId, context)}
          label="Metron"
          abbrev="M"
        />
      )}
      {gcdId && (
        <ProviderLink
          href={getGcdUrl(gcdId, context)}
          label="Grand Comics Database"
          abbrev="GCD"
        />
      )}
      {anilistId && (
        <ProviderLink
          href={getAnilistUrl(anilistId)}
          label="AniList"
          abbrev="AL"
        />
      )}
      {malId && (
        <ProviderLink
          href={getMalUrl(malId)}
          label="MyAnimeList"
          abbrev="MAL"
        />
      )}
    </div>
  );
}

export default ExternalProviderLinks;
