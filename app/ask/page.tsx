import type { Metadata } from "next";
import { AskPage } from "./AskPage";

export const metadata: Metadata = {
  title: "Ask CleanPlate — GF Dining Assistant",
  description: "Ask CleanPlate anything about gluten-free dining in NYC. Get personalized restaurant recommendations grounded in real safety data.",
};

export default function AskPageRoute() {
  return <AskPage />;
}
