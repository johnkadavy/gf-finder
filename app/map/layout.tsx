export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://api.mapbox.com" />
      <link rel="preconnect" href="https://events.mapbox.com" />
      {children}
    </>
  );
}
