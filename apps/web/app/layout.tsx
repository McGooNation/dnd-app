import "../styles/globals.css";

export const metadata = {
  title: "TavernTable — play with friends",
  description: "Chat, call, and roll dice with your D&D group.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
