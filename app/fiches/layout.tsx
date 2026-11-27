import "./fiches.css";

export const metadata = {
  title: "Fiches — UMPJ",
  description: "Suivi des productions et des ventes de fiches du ministère.",
};

export default function FichesLayout({ children }: { children: React.ReactNode }) {
  return <div className="fiches-module">{children}</div>;
}
