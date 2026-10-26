import Image from "next/image";

type AuvrionAIBrandProps = {
  variant?: "icon" | "wordmark";
  className?: string;
};

/** Dedicated identity for Auvrion AI; never replaces Biosphere's global brand. */
export function AuvrionAIBrand({
  variant = "icon",
  className = "",
}: AuvrionAIBrandProps) {
  if (variant === "wordmark") {
    return (
      <Image
        src="/branding/auvrion-ai-wordmark.png"
        alt="Auvrion AI"
        width={1036}
        height={321}
        sizes="180px"
        className={`block h-auto w-[120px] max-w-full object-contain object-left ${className}`}
      />
    );
  }

  return (
    <Image
      src="/branding/auvrion-ai-icon.png"
      alt=""
      aria-hidden="true"
      width={344}
      height={321}
      sizes="24px"
      className={`block size-full object-contain ${className}`}
    />
  );
}
