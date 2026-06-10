type Props = {
  googleMapsUrl: string | null;
  websiteUrl: string | null;
};

export function RestaurantActions({ googleMapsUrl, websiteUrl }: Props) {
  if (!googleMapsUrl && !websiteUrl) return null;

  return (
    <div className="flex items-center gap-1.5">
      {googleMapsUrl && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-ui-xs uppercase tracking-label px-2.5 py-1.5 border border-border text-text-dim flex items-center gap-1.5 whitespace-nowrap hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
          style={{ transition: "border-color 120ms ease, color 120ms ease" }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2C8.5 2 5 5.5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.5-3-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          Directions
        </a>
      )}
      {websiteUrl && (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Website"
          className="p-1.5 border border-border text-text-dim hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
          style={{ transition: "border-color 120ms ease, color 120ms ease" }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
          </svg>
        </a>
      )}
    </div>
  );
}
