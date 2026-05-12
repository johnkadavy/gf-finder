import type { Metadata } from "next";
import { AskPage } from "./AskPage";

export const metadata: Metadata = {
  title: "Ask CleanPlate — GF Dining Assistant",
  description: "Ask CleanPlate anything about gluten-free dining in NYC. Get personalized restaurant recommendations grounded in real safety data.",
};

type Props = { searchParams: Promise<{ q?: string }> };

// No pt-16 wrapper — AskPage manages its own full-height layout
export default async function AskPageRoute({ searchParams }: Props) {
  const { q } = await searchParams;
  return <AskPage initialQuery={q ?? ""} />;
}
