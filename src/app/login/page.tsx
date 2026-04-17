import { redirect } from "next/navigation"
import Link from "next/link"
import { LoginForm } from "~/components/login-form"
import { MailIcon } from "lucide-react"
import { auth, signIn } from "~/server/auth"

export default async function LoginPage() {
  const session = await auth()

  if (session) {
    redirect("/dashboard")
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MailIcon className="size-4" />
            </div>
            Mail App
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm
              onGitHubSignIn={async () => {
                "use server"
                await signIn("github", { redirectTo: "/dashboard" })
              }}
            />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block" />
    </div>
  )
}
