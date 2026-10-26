import Image from "next/image";

export function SidebarBrandImage() {
  return (
    <div className="relative h-8 w-[168px] shrink-0">
      <Image
        src="/branding/auvrion-biosphere-sidebar-logo.png"
        alt="Auvrion Biosphere"
        fill
        priority
        sizes="168px"
        className="object-contain object-left"
      />
    </div>
  );
}
