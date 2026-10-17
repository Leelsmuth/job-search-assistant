import { cn } from "@/lib/utils";

const iconSizes = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
} as const;

type LogoSize = keyof typeof iconSizes;

/**
 * Wordmark visibility.
 * `responsive` keeps the name for assistive tech and shows it from the `sm` breakpoint up.
 */
type Wordmark = "always" | "responsive" | "never";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="14" fill="#171717" />
      <path
        d="M40 26V40A10.5 10.5 0 0 1 19 40"
        fill="none"
        stroke="#FAFAFA"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M28 27L40 11L52 27Z"
        fill="#F59E0B"
        stroke="#F59E0B"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  wordmark = "responsive",
  size = "md",
  className,
  wordmarkClassName,
}: {
  wordmark?: Wordmark;
  size?: LogoSize;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("relative flex min-w-0 max-w-full items-center gap-2", className)}>
      <LogoMark className={iconSizes[size]} />
      <span
        className={cn(
          "min-w-0 truncate text-sm tracking-tight",
          wordmark === "never" && "sr-only",
          wordmark === "responsive" && "sr-only sm:not-sr-only sm:truncate",
          wordmarkClassName,
          "leading-none"
        )}
      >
        <span className="font-bold text-foreground">Job Search</span>{" "}
        <span className="font-medium text-muted-foreground">Assistant</span>
      </span>
    </span>
  );
}
