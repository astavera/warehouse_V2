import { getCarrierBrand, getCarrierInitials } from '@/lib/carrierLogos';

function getCarrierAsset(name: string) {
  const lower = name.toLowerCase().trim();

  if (lower.includes('amazon')) {
    return { src: '/carrier-logos/amazon.svg', alt: 'Amazon', imgClass: 'h-6 w-[4.1rem]' };
  }

  if (lower.includes('fedex') || lower.includes('federal express')) {
    return { src: '/carrier-logos/fedex.svg', alt: 'FedEx', imgClass: 'h-7 w-[3.25rem]' };
  }

  if (lower.includes('ups')) {
    return { src: '/carrier-logos/ups.svg', alt: 'UPS', imgClass: 'h-9 w-9' };
  }

  if (
    lower.includes('usps') ||
    lower.includes('postal service') ||
    lower.includes('u.s. postal') ||
    lower.includes('united states postal')
  ) {
    return { src: '/carrier-logos/usps.svg', alt: 'USPS', imgClass: 'h-6 w-[3.5rem]' };
  }

  if (lower.includes('dhl')) {
    return { src: '/carrier-logos/dhl.svg', alt: 'DHL', imgClass: 'h-7 w-[3.2rem]' };
  }

  return null;
}

function getCarrierDisplayName(name: string) {
  return name.replace(/\s+/g, ' ').trim();
}

export default function CarrierBadge({
  name,
  size = 'md',
  variant = 'default',
}: {
  name: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'plain';
}) {
  const asset = getCarrierAsset(name);
  const brand = getCarrierBrand(name);
  const boxClass = size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-10 w-10 rounded-xl';

  if (asset) {
    if (variant === 'plain') {
      return <img src={asset.src} alt={asset.alt} className={`${asset.imgClass} object-contain`} draggable={false} />;
    }

    return (
      <div className={`${boxClass} flex shrink-0 items-center justify-center bg-white`}>
        <img src={asset.src} alt={asset.alt} className={`${asset.imgClass} object-contain`} draggable={false} />
      </div>
    );
  }

  if (brand) {
    if (variant === 'plain') {
      return (
        <span style={{ color: brand.bg }} className="font-bold text-[11px]">
          {brand.abbr}
        </span>
      );
    }

    return (
      <div
        className={`${boxClass} flex shrink-0 items-center justify-center font-bold text-[11px]`}
        style={{ backgroundColor: brand.bg, color: brand.fg }}
      >
        {brand.abbr}
      </div>
    );
  }

  if (variant === 'plain') {
    return (
      <span className="max-w-[110px] rounded-md bg-foreground/8 px-2 py-1 text-center text-[12px] font-bold leading-[1.05rem] text-foreground whitespace-normal break-words shadow-sm">
        {getCarrierDisplayName(name)}
      </span>
    );
  }

  return (
    <div className={`${boxClass} flex shrink-0 items-center justify-center bg-muted font-bold text-[11px] text-muted-foreground`}>
      {getCarrierInitials(name)}
    </div>
  );
}
