"use client";

import { ShieldCheck } from "lucide-react";
import { Cormorant_Garamond } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
});

export default function HeroContent() {
  return (
    <div className="flex flex-col pt-0">

      {/* Heading */}

      <h1
  className={`${cormorant.className} mt-10 w-[420px] text-[58px] font-medium leading-[58px] tracking-[-0.035em] text-[#1C1C1C]`}
>
  <span className="whitespace-nowrap">
    Your AR Employee
  </span>
  <br />
  is working 
  <span className="text-[#B88A4B]">.</span>
</h1>

      {/* Description */}

      <p className="mt-7 max-w-[340px] text-[17px] leading-[30px] text-[#66615B]">
        Recovering outstanding payments while protecting customer
        relationships.
      </p>

      {/* Badge */}
<div className="mt-5">
  <div className="inline-flex items-center gap-2 rounded-full border border-[#ECE5DD] bg-[#F6F1EA] px-4 py-2">
     <ShieldCheck
    size={14}
    strokeWidth={2}
    className="text-[#8A6A42]"
  />

  <span className="text-[13px] font-semibold text-[#3E3A35]">
    Trust
  </span>

  <span className="text-[#B8AEA3]">•</span>

  <span className="text-[13px] font-semibold text-[#3E3A35]">
    Level 3
  </span>
  </div>
</div>
      

    </div>
  );
}