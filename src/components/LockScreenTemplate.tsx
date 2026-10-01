'use client';

import { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { SocialLink } from '@/lib/social-urls';

interface LockScreenTemplateProps {
  displayName: string | null;
  company: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  socialLinks: SocialLink[];
  screenWidth?: number;
  screenHeight?: number;
  logoDataUrl?: string;
}

const PLATFORM_LOGOS: Record<string, string> = {
  x: `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="#fafaf9"/><path d="M17.176 4h2.645l-5.78 6.606 6.8 8.994h-4.676l-4.17-5.453-4.77 5.453H4.58l6.18-7.066L4.2 4h4.795l3.77 4.984zm-.928 14.016h1.466L8.005 5.506H6.44z" fill="#0c0a09"/></svg>')}`,
  telegram: `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="#fafaf9"/><path d="M11.944 3A9 9 0 0 0 3 12a9 9 0 0 0 9 9 9 9 0 0 0 9-9 9 9 0 0 0-9-9zm3.722 5.418c.075-.001.241.017.349.105a.38.38 0 0 1 .128.244c.012.07.027.23.015.354-.135 1.424-.721 4.877-1.02 6.47-.126.675-.374.901-.615.923-.522.049-.919-.345-1.425-.677-.792-.52-1.24-.843-2.009-1.35-.889-.585-.313-.908.194-1.433.133-.138 2.435-2.233 2.48-2.423.006-.024.011-.113-.042-.159s-.13-.031-.187-.018c-.08.018-1.345.856-3.796 2.51-.36.247-.685.367-.977.36-.321-.006-.939-.181-1.399-.33-.564-.184-1.012-.281-.973-.592.02-.162.244-.328.67-.498 2.624-1.143 4.372-1.897 5.249-2.261 2.499-1.04 3.019-1.221 3.357-1.226z" fill="#0c0a09"/></svg>')}`,
  linkedin: `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="#fafaf9"/><path d="M19.336 19.339h-3.065v-4.805c0-1.146-.023-2.62-1.596-2.62-1.597 0-1.842 1.247-1.842 2.536v4.889h-3.065V9.75h2.943v1.347h.042c.41-.776 1.412-1.596 2.907-1.596 3.107 0 3.68 2.044 3.68 4.703v5.135zM6.749 8.397c-.985 0-1.78-.8-1.78-1.782S5.764 4.833 6.749 4.833c.983 0 1.78.8 1.78 1.782s-.797 1.782-1.78 1.782zm1.537 10.942H5.212V9.75h3.074v9.589z" fill="#0c0a09"/></svg>')}`,
  friend: `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg"><rect width="360" height="360" rx="60" fill="#fafaf9"/><g transform="translate(50 40)"><rect y="71.62" width="260.39" height="9.16" fill="#0c0a09"/><rect x="65.86" y="3.83" width="18.38" height="51.31" rx="8.42" stroke="#0c0a09" stroke-width="7.66" fill="none"/><rect x="176.14" y="3.83" width="18.38" height="51.31" rx="8.42" stroke="#0c0a09" stroke-width="7.66" fill="none"/><path d="M56.67 40.16H23.04c-4.93 0-8.92 3.99-8.92 8.92v205.88c0 4.93 3.99 8.92 8.92 8.92h214.06c4.92 0 8.92-3.99 8.92-8.92V49.08c0-4.93-3.99-8.92-8.92-8.92h-33.38V26.04h33.38l.59.01c12.45.32 22.45 10.51 22.45 23.03v205.88l-.01.6c-.31 12.25-10.19 22.12-22.44 22.44l-.59.01H23.04l-.59-.01C10.19 277.68.32 267.81.01 255.55L0 254.96V49.08C0 36.55 10 26.36 22.45 26.05l.59-.01h33.63v14.12zm110.28 0H93.43V26.04h73.52v14.12z" fill="#0c0a09"/><rect x="58.2" y="106.45" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/><rect x="58.2" y="151.79" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/><rect x="110.89" y="151.79" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/><rect x="110.89" y="197.13" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/><rect x="163.58" y="151.79" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/><rect x="58.2" y="197.13" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/><rect x="110.89" y="106.45" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/><rect x="163.58" y="106.45" width="37.99" height="37.99" rx="6.13" fill="#0c0a09"/></g></svg>')}`,
};

// Base design dimensions (iPhone 14/15)
const BASE_W = 1170;
const BASE_H = 2532;

const LockScreenTemplate = forwardRef<HTMLDivElement, LockScreenTemplateProps>(
  function LockScreenTemplate({ displayName, company, jobTitle, avatarUrl, socialLinks, screenWidth, screenHeight, logoDataUrl }, ref) {
    const w = screenWidth || BASE_W;
    const h = screenHeight || BASE_H;
    const s = w / BASE_W; // scale factor based on width

    // Protected zones (scaled) — keep content away from OS UI elements
    const topSafe = Math.round(300 * s);       // clock / Dynamic Island
    const bottomSafe = Math.round(200 * s);     // home indicator / flashlight+camera
    const logoHeight = Math.round(88 * s);
    const logoGap = Math.round(20 * s);

    // Calculate available vertical space for profile + QR codes
    // Avatar+name row (~140px) + company line (~36px) + gaps
    const profileEstimate = Math.round(140 * s) + Math.round(36 * s) + Math.round(16 * s) * 2;
    const fixedHeight = topSafe + profileEstimate + bottomSafe + logoHeight + logoGap + Math.round(80 * s) + Math.round(60 * s);
    const availableForQr = h - fixedHeight;

    const qrCount = socialLinks.length;
    // Base QR sizes, then clamp to available vertical space
    const baseQr = qrCount === 1 ? 1050 : qrCount === 2 ? 680 : qrCount >= 4 ? 460 : 560;
    let qrSize = Math.round(baseQr * s);

    // For stacked layouts, ensure QR codes fit vertically
    if (qrCount === 2) {
      const needed = qrSize * 2 + Math.round(30 * s) + Math.round(16 * s) * 2 + Math.round(28 * s) * 2;
      if (needed > availableForQr) {
        qrSize = Math.round((availableForQr - Math.round(30 * s) - Math.round(16 * s) * 2 - Math.round(28 * s) * 2) / 2);
      }
    } else if (qrCount >= 3) {
      // 2 rows: need 2 QR heights + gaps + labels
      const needed = qrSize * 2 + Math.round(40 * s) + Math.round(16 * s) * 2 + Math.round(28 * s) * 2;
      if (needed > availableForQr) {
        qrSize = Math.round((availableForQr - Math.round(40 * s) - Math.round(16 * s) * 2 - Math.round(28 * s) * 2) / 2);
      }
      // For 4 codes in 2x2 grid, also clamp to half the width minus gap
      if (qrCount >= 4) {
        const maxByWidth = Math.round((w - Math.round(40 * s) * 3) / 2); // 2 cols with padding+gap
        qrSize = Math.min(qrSize, maxByWidth);
      }
    } else if (qrCount === 1) {
      const needed = qrSize + Math.round(16 * s) + Math.round(28 * s);
      if (needed > availableForQr) {
        qrSize = availableForQr - Math.round(16 * s) - Math.round(28 * s);
      }
    }
    qrSize = Math.max(qrSize, Math.round(100 * s)); // floor

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: `${w}px`,
          height: `${h}px`,
          backgroundColor: '#0c0a09',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* Top safe zone — clock / Dynamic Island */}
        <div style={{ height: `${topSafe}px`, flexShrink: 0 }} />

        {/* Push content group toward center */}
        <div style={{ flex: 1 }} />

        {/* Content group: profile + QR codes + branding */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: `${Math.round(40 * s)}px`,
          }}
        >
          {/* Profile section */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: `${Math.round(16 * s)}px`,
              paddingLeft: `${Math.round(60 * s)}px`,
              paddingRight: `${Math.round(60 * s)}px`,
            }}
          >
            {/* Avatar + Name row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${Math.round(24 * s)}px`,
              }}
            >
              {/* Avatar */}
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    width: `${Math.round(140 * s)}px`,
                    height: `${Math.round(140 * s)}px`,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `${Math.round(4 * s)}px solid #292524`,
                    flexShrink: 0,
                  }}
                />
              ) : displayName ? (
                <div
                  style={{
                    width: `${Math.round(140 * s)}px`,
                    height: `${Math.round(140 * s)}px`,
                    borderRadius: '50%',
                    backgroundColor: '#292524',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: `${Math.round(56 * s)}px`,
                    fontWeight: 700,
                    color: '#fbbf24',
                    border: `${Math.round(4 * s)}px solid #292524`,
                    flexShrink: 0,
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              ) : null}

              {/* Name */}
              {displayName && (
                <div
                  style={{
                    fontSize: `${Math.round(72 * s)}px`,
                    fontWeight: 800,
                    color: '#fafaf9',
                    lineHeight: 1.2,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {displayName}
                </div>
              )}
            </div>

            {/* Company / Job Title */}
            {(company || jobTitle) && (
              <div
                style={{
                  fontSize: `${Math.round(36 * s)}px`,
                  fontWeight: 500,
                  color: '#a8a29e',
                  lineHeight: 1.3,
                }}
              >
                {[company, jobTitle].filter(Boolean).join('  |  ')}
              </div>
            )}
          </div>

          {/* QR codes */}
          <div
            style={{
              display: qrCount >= 4 ? 'grid' : 'flex',
              ...(qrCount >= 4
                ? {
                    gridTemplateColumns: `repeat(2, ${qrSize}px)`,
                    justifyContent: 'center',
                    justifyItems: 'center',
                    alignItems: 'start',
                    gap: `${Math.round(30 * s)}px`,
                    padding: `0 ${Math.round(40 * s)}px`,
                  }
                : {
                    flexDirection: qrCount === 2 ? 'column' as const : 'row' as const,
                    flexWrap: 'wrap' as const,
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: qrCount === 1 ? '0px' : qrCount === 2 ? `${Math.round(30 * s)}px` : `${Math.round(40 * s)}px`,
                    paddingLeft: qrCount === 3 ? '0px' : `${Math.round(24 * s)}px`,
                    paddingRight: qrCount === 3 ? '0px' : `${Math.round(24 * s)}px`,
                  }),
            }}
          >
            {socialLinks.map((link) => (
              <div
                key={link.platform}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: `${Math.round(16 * s)}px`,
                }}
              >
                <QRCodeSVG
                  value={link.url}
                  size={qrSize}
                  level={PLATFORM_LOGOS[link.platform] ? 'H' : 'M'}
                  fgColor="#fafaf9"
                  bgColor="#0c0a09"
                  imageSettings={PLATFORM_LOGOS[link.platform] ? {
                    src: PLATFORM_LOGOS[link.platform],
                    height: Math.round(qrSize * 0.22),
                    width: Math.round(qrSize * 0.22),
                    excavate: true,
                  } : undefined}
                />
                <div
                  style={{
                    fontSize: `${Math.round(28 * s)}px`,
                    fontWeight: 600,
                    color: '#a8a29e',
                    textAlign: 'center',
                  }}
                >
                  {link.label}
                </div>
              </div>
            ))}
          </div>

          {/* Branding */}
          {logoDataUrl && (
            <img
              src={logoDataUrl}
              alt="plan.wtf"
              style={{
                height: `${logoHeight}px`,
                objectFit: 'contain',
                opacity: 0.4,
                filter: 'brightness(0) invert(1)',
              }}
            />
          )}
        </div>

        {/* Push content group toward center */}
        <div style={{ flex: 1 }} />

        {/* Bottom safe zone — home indicator / flashlight+camera */}
        <div style={{ height: `${bottomSafe}px`, flexShrink: 0 }} />
      </div>
    );
  }
);

export default LockScreenTemplate;
