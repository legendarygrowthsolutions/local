"use client";

import { useState } from "react";

export function ReadMore({ paragraphs }: { paragraphs: string[] }) {
  const [open, setOpen] = useState(false);
  const long = paragraphs.join(" ").length > 220;
  return (
    <div className="flex flex-col gap-2 text-sm leading-[1.55] text-ink-2 md:text-[15px]">
      <div className={long && !open ? "line-clamp-4" : "flex flex-col gap-3"}>
        {open || !long ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p>{paragraphs.join(" ")}</p>}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="self-start text-[13px] font-bold text-brand" aria-expanded={open}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
