import type { SVGProps } from "react";

export function BrandMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className} {...props}>
      <path d="M8 8.5 16 4l8 4.5v9L16 27l-8-9.5v-9Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="m8 8.5 8 4.5 8-4.5M16 13v14" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}
