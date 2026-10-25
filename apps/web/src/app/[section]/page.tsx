import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
const sections = [
  "decision-intelligence",
  "knowledge",
  "training",
  "vision",
  "production",
  "experiments",
  "pipelines",
  "settings",
  "models",
  "monitoring",
];
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <Dashboard section={section} />;
}
