import { useState, useEffect } from "react";

export function BackToTopButton({ scrollRef }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;

    function onScroll() {
      setVisible(el.scrollTop > 200);
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  function handleClick() {
    scrollRef?.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      title="Back to top"
      className={`fixed bottom-5 right-5 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border/40 bg-background/50 text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity duration-200 hover:bg-background/70 hover:text-foreground ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
