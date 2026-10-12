import { brand } from "../../lib/brand/brand";
import { cn } from "../../lib/utils";

export function BrandLogo({ className, eager = false }: { className?: string; eager?: boolean }) {
  return (
    <img
      src={brand.logo.src}
      // The mark is never drawn above 64px, so the 192px copy covers 3x screens
      // and the 960px primary stays the fallback and the share image.
      srcSet={`${brand.logo.smallSrc} 192w, ${brand.logo.src} ${brand.logo.width}w`}
      sizes="64px"
      alt={brand.logo.alt}
      width={brand.logo.width}
      height={brand.logo.height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}
