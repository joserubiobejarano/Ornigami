import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoLandingPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Public Product Demos</h1>
        <p className="text-slate-600">
          Try Ornigami agents with sample data before creating your account.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Review Replies Demo</CardTitle>
            <CardDescription>
              Try AI-generated replies with sample Google reviews.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/demo/review-replies">Try Review Replies demo</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review Booster Demo</CardTitle>
            <CardDescription>
              Send yourself a sample post-visit review request email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/demo/review-booster">Try Review Booster demo</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        <Button asChild variant="outline">
          <Link href="/signup">Create free account</Link>
        </Button>
      </div>
    </div>
  );
}
