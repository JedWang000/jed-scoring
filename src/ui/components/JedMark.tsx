import type { SVGProps } from 'react';

export type JedMarkProps = Omit<SVGProps<SVGSVGElement>, 'aria-hidden' | 'children'>;

export function JedMark(props: JedMarkProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>JED Scoring by 达子 Jed_Wang</title>
      <rect x="4" y="4" width="120" height="120" rx="12" fill="#0b0b0a" />
      <g
        fill="none"
        stroke="#f4efe6"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="9"
      >
        <path d="M16 28H40V80L31 90H18L12 84" />
        <path d="M76 28H52V90H76M52 59H72" />
        <path d="M88 28V90H101L116 78V40L101 28H88" />
      </g>
      <path d="M12 108H116" fill="none" stroke="#d8ad70" strokeWidth="6" />
    </svg>
  );
}
