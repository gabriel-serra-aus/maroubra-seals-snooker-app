import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentSession()) redirect("/admin");
  return <LoginForm />;
}
