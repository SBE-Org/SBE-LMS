import { apiUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const SIZES = { small: 32, medium: 48, large: 72 };

/**
 * The institutional logo, shown only where an administrator switched it on
 * (Settings → Branding and appearance). Without an uploaded logo, the built-in mark is used.
 *
 *   <Logo placement="login" />           uses that placement's on/off, size and alignment
 *   <Logo placement="header" compact />  inside the navigation brand link
 *   <Logo branding={draft} … />          live preview with unsaved settings
 */
export default function Logo({ placement, branding: override, size: forcedSize, align: forcedAlign, compact = false, showName, className = '', src: forcedSrc, nameFallback = true }) {
  const { meta } = useAuth();
  const b = override || meta.branding || {};
  const p = placement ? b.placements?.[placement] : { enabled: true };
  const name = b.appName || meta.appName;
  const sub = b.institutionName || meta.company;
  const withName = showName ?? b.showNameWithLogo !== false;

  if (placement && !p?.enabled) {
    // Logo switched off here: keep the name so the page still says whose it is.
    if (!nameFallback) return null;
    return compact ? <span className="brand-text"><strong>{name}</strong><small>{sub}</small></span> : null;
  }

  const size = forcedSize || p?.size || 'medium';
  const align = forcedAlign || p?.align || 'left';
  const px = SIZES[size] || SIZES.medium;
  const src = forcedSrc !== undefined ? forcedSrc : b.logoUrl ? apiUrl(b.logoUrl) : null;
  const keep = b.keepAspectRatio !== false;

  const mark = src ? (
    <img
      className="logo-img"
      src={src}
      alt={withName ? '' : `${sub} logo`}
      crossOrigin="anonymous"
      style={keep ? { height: px, width: 'auto', maxWidth: px * 4 } : { height: px, width: px, objectFit: 'fill' }}
    />
  ) : (
    <span className="brand-mark logo-default" style={{ width: px, height: px, fontSize: px * 0.48, borderRadius: px * 0.26 }} aria-hidden="true">
      {(name || 'S').trim().charAt(0).toUpperCase()}
    </span>
  );

  if (compact) {
    return (
      <>
        {mark}
        {withName && <span className="brand-text"><strong>{name}</strong><small>{sub}</small></span>}
      </>
    );
  }
  return (
    <div className={`logo logo-${align} ${className}`}>
      {mark}
      {withName && <div className="logo-name"><strong>{sub}</strong>{name !== sub && <small>{name}</small>}</div>}
    </div>
  );
}
