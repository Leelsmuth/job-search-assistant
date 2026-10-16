import { sourceCredit, sourceLabel } from "@/modules/discovery/source-catalog";

export function JobSourceBadge({ provider }: { provider: string | null | undefined }) {
  if (!provider || provider === "manual" || provider === "pasted_description" || provider === "generic_web") {
    return null;
  }

  const credit = sourceCredit(provider);
  const label = sourceLabel(provider);
  const className =
    "inline-flex min-h-10 items-center rounded-full border border-border px-2.5 text-xs font-semibold";

  if (!credit) {
    return <span className={className}>{label}</span>;
  }

  return (
    <a href={credit.href} target="_blank" rel="noopener" className={`${className} hover:underline`}>
      {credit.name}
    </a>
  );
}
