import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useRequestMagicLink, useVerifyMagicLink, MagicLinkRequestIntent } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const requestLink = useRequestMagicLink();
  const verifyLink = useVerifyMagicLink();
  const { toast } = useToast();

  // Parse slug + intent from query string
  const searchParams = new URLSearchParams(searchString);
  const slugParam = searchParams.get("slug") ?? undefined;
  const intentParam = searchParams.get("intent") ?? undefined;

  // Validate intent against the enum
  const intent: MagicLinkRequestIntent | undefined =
    intentParam && Object.values(MagicLinkRequestIntent).includes(intentParam as MagicLinkRequestIntent)
      ? (intentParam as MagicLinkRequestIntent)
      : undefined;

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const dest = slugParam ? `/${slugParam}` : "/dashboard";
      setLocation(dest);
    }
  }, [isAuthenticated, authLoading, setLocation, slugParam]);

  const verifiedTokenRef = useRef<string | null>(null);
  const verifyMutate = verifyLink.mutate;
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const token = params.get("token");
    if (!token) return;
    if (verifiedTokenRef.current === token) return;
    verifiedTokenRef.current = token;
    verifyMutate(
      { data: { token } },
      {
        onSuccess: (data) => {
          toast({ title: "Welcome back", description: "Successfully signed in." });
          // Navigate to the server-computed redirect, falling back to /dashboard
          setLocation(data.redirectTo || "/dashboard");
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Sign in failed",
            description: "This link may have expired.",
          });
          setLocation("/sign-in");
        },
      },
    );
  }, [searchString, verifyMutate, setLocation, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    requestLink.mutate(
      {
        data: {
          email,
          ...(slugParam ? { slug: slugParam } : {}),
          ...(intent ? { intent } : {}),
        },
      },
      {
        onSuccess: () => {
          setSubmitted(true);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to send link. Please try again." });
        }
      }
    );
  };

  if (authLoading || verifyLink.isPending) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground">Authenticating...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-card p-8 md:p-12 rounded-2xl shadow-xl border border-border/40 text-center"
      >
        <h1 className="text-3xl font-serif mb-2">Leave a Tribute</h1>
        <p className="text-muted-foreground font-serif italic mb-8">
          Sign in to share a memory, a story, or a quiet thought.
        </p>

        {submitted ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><rect width="20" height="14" x="2" y="5" rx="2"/></svg>
            </div>
            <h2 className="text-xl font-serif">Check your email</h2>
            <p className="text-muted-foreground">
              We sent a magic link to <span className="font-medium text-foreground">{email}</span>. Click it to sign in.
            </p>
            <Button variant="ghost" onClick={() => setSubmitted(false)} className="mt-4">
              Use a different email
            </Button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 text-left">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground/80">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-background"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 text-lg font-serif rounded-xl"
              disabled={requestLink.isPending}
            >
              {requestLink.isPending ? "Sending..." : "Send Magic Link"}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
