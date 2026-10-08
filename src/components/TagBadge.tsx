'use client';

import {
  Mic,
  Trophy,
  Handshake,
  Wrench,
  Bot,
  ChartCandlestick,
  Image,
  Cpu,
  Gamepad2,
  Palette,
  Heart,
  Coffee,
  Beer,
  Briefcase,
  Smile,
  GraduationCap,
  Play,
  House,
  UtensilsCrossed,
  Drama,
  IdCardLanyard,
  Vote,
  PartyPopper,
  Ticket,
  BadgeDollarSign,
  CircuitBoard,
  Globe,
  Presentation,
  Music,
  Sparkles,
  BookOpen,
  Star,
  Zap,
  Armchair,
  GalleryHorizontalEnd,
  Clapperboard,
  Projector,
  Sparkle,
  Laugh,
  Rocket,
  type LucideIcon,
} from 'lucide-react';
import { VIBE_COLORS } from '@/lib/constants';

/** Custom crypto logo SVG icons matching LucideIcon interface */
function EthIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2L5.5 13 12 22l6.5-9z" />
      <path d="M5.5 13L12 10.5 18.5 13" />
    </svg>
  );
}

function BtcIcon(props: React.SVGProps<SVGSVGElement>) {
  // Official Bitcoin ₿ symbol from Wikimedia Commons
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="15 10 34 44" fill="currentColor" stroke="none" {...props}>
      <path d="m46.103,27.444c0.637-4.258-2.605-6.547-7.038-8.074l1.438-5.768-3.511-0.875-1.4,5.616c-0.923-0.23-1.871-0.447-2.813-0.662l1.41-5.653-3.509-0.875-1.439,5.766c-0.764-0.174-1.514-0.346-2.242-0.527l0.004-0.018-4.842-1.209-0.934,3.75s2.605,0.597,2.55,0.634c1.422,0.355,1.679,1.296,1.636,2.042l-1.638,6.571c0.098,0.025,0.225,0.061,0.365,0.117-0.117-0.029-0.242-0.061-0.371-0.092l-2.296,9.205c-0.174,0.432-0.615,1.08-1.609,0.834,0.035,0.051-2.552-0.637-2.552-0.637l-1.743,4.019,4.569,1.139c0.85,0.213,1.683,0.436,2.503,0.646l-1.453,5.834,3.507,0.875,1.439-5.772c0.958,0.26,1.888,0.5,2.798,0.726l-1.434,5.745,3.511,0.875,1.453-5.823c5.987,1.133,10.489,0.676,12.384-4.739,1.527-4.36-0.076-6.875-3.226-8.515,2.294-0.529,4.022-2.038,4.483-5.155zm-8.022,11.249c-1.085,4.36-8.426,2.003-10.806,1.412l1.928-7.729c2.38,0.594,10.012,1.77,8.878,6.317zm1.086-11.312c-0.99,3.966-7.1,1.951-9.082,1.457l1.748-7.01c1.982,0.494,8.365,1.416,7.334,5.553z" />
    </svg>
  );
}

function SolIcon(props: React.SVGProps<SVGSVGElement>) {
  // Official Solana logo paths scaled to fit, using currentColor
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 397.7 311.7" fill="currentColor" stroke="none" {...props}>
      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" />
      <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" />
      <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" />
    </svg>
  );
}

function MoneyBagIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.5 1h5l-2.5 4-2.5-4z" />
      <path d="M6 5c-3.5 3.5-5 7-5 11.5C1 20.5 5 23 12 23s11-2.5 11-6.5c0-4.5-1.5-8-5-11.5H6z" />
      <path d="M12 9.5v8" />
      <path d="M9 12.5c0-1.4 1.1-2 3-2s3 .7 3 2-1.1 2-3 2-3 .7-3 2 1.1 2 3 2 3-.7 3-2" />
    </svg>
  );
}

type IconComponent = LucideIcon | ((props: React.SVGProps<SVGSVGElement>) => React.ReactNode);

export const TAG_ICONS: Record<string, IconComponent> = {
  '$$': Ticket,
  'Free': BadgeDollarSign,
  'Conference': IdCardLanyard,
  'Panel/Talk': Mic,
  'Hackathon': Trophy,
  'Networking': Handshake,
  'Devs': Wrench,
  'VCs': MoneyBagIcon,
  'AI': Bot,
  'DeFi': ChartCandlestick,
  'DAOs': Vote,
  'NFTs': Image,
  'DePIN': Cpu,
  'RWA': House,
  'ETH': EthIcon,
  'BTC': BtcIcon,
  'SOL': SolIcon,
  'Gaming': Gamepad2,
  'Art': Palette,
  'Wellness': Heart,
  'Brunch': Coffee,
  'Jobs': Briefcase,
  'Founders': Rocket,
  'Memecoins': Smile,
  'Party': PartyPopper,
  'Workshop': GraduationCap,
  'Meetup': Handshake,
  'Demo Day': Play,
  'Demo': Play,
  'Dinner': UtensilsCrossed,
  'Performance': Drama,
  'Tech': CircuitBoard,
  'Culture': Globe,
  'Session': Presentation,
  'Music': Music,
  'Showcase': Sparkles,
  'Education': BookOpen,
  'Special Event': Star,
  'Activation': Zap,
  'Lounge': Armchair,
  'Exhibition': GalleryHorizontalEnd,
  'Film/TV': Clapperboard,
  'Screening': Projector,
  'Vibe': Sparkle,
  'Food': UtensilsCrossed,
  'Drinks': Beer,
  'Comedy': Laugh,
};

interface TagBadgeProps {
  tag: string;
  size?: 'sm' | 'md';
  iconOnly?: boolean;
  iconClassName?: string;
}

export function TagBadge({ tag, size = 'sm', iconOnly = false, iconClassName }: TagBadgeProps) {
  const Icon = TAG_ICONS[tag];
  const color = VIBE_COLORS[tag] || VIBE_COLORS['default'];
  const iconSize = iconClassName
    ? iconClassName
    : iconOnly
      ? 'w-5 h-5'
      : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  if (iconOnly) {
    return Icon ? (
      <span title={tag} className="inline-flex items-center justify-center">
        <Icon className={`${iconSize} flex-shrink-0`} style={{ color }} />
      </span>
    ) : null;
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      title={tag}
    >
      {Icon && <Icon className={`${iconSize} flex-shrink-0`} style={{ color }} />}
      <span className="hidden sm:inline text-[var(--theme-text-secondary)]">{tag}</span>
    </span>
  );
}
