import React from "react";
import type { LucideProps } from "lucide-react";
import mark from "../assets/brand/mark.svg?raw";

// Share the vector master with the Windows icon exporter; preserve the approved icon color in every theme.
export const BrandMark = React.forwardRef<SVGSVGElement, LucideProps>(
  function BrandMark({ size = 24, ...props }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        fill="#b7572f"
        aria-hidden="true"
        {...props}
        dangerouslySetInnerHTML={{
          __html: mark.slice(mark.indexOf(">") + 1, mark.lastIndexOf("</svg>")),
        }}
      />
    );
  },
);
